import {createHmac,createHash,randomUUID,timingSafeEqual} from 'node:crypto';
import type {FastifyInstance} from 'fastify';
import {ApiError,workspaceContext} from './auth.js';
import {auditLog} from './events.js';
import {query} from './db.js';
import {connectorSecretsConfigured,connectorStateSecret,decryptConnectorSecret,encryptConnectorSecret} from './connector-secrets.js';

const USER_READ_SCOPE='User.Read';
const MAIL_READ_BASIC_SCOPE='Mail.ReadBasic';
const CALENDAR_READ_BASIC_SCOPE='Calendars.ReadBasic';
const MICROSOFT_SCOPES=['openid','profile','email','offline_access',USER_READ_SCOPE,MAIL_READ_BASIC_SCOPE,CALENDAR_READ_BASIC_SCOPE];

type MicrosoftTokenSecret={
  accessToken:string;
  refreshToken?:string|null;
  expiresAt:number;
  tokenType?:string|null;
  scope?:string|null;
};

function tenant(){return String(process.env.MICROSOFT_CONNECT_TENANT||'common').trim()||'common'}
function microsoftRedirectUri(){
  const explicit=String(process.env.MICROSOFT_CONNECT_REDIRECT_URI||'').trim();
  if(explicit)return explicit;
  const apiBase=String(process.env.NEXOFFICE_PUBLIC_API_URL||'').trim().replace(/\/$/,'');
  return apiBase?`${apiBase}/v1/connect/microsoft/callback`:'';
}
function microsoftConfigured(){
  return Boolean(
    String(process.env.MICROSOFT_CONNECT_CLIENT_ID||'').trim()&&
    String(process.env.MICROSOFT_CONNECT_CLIENT_SECRET||'').trim()&&
    microsoftRedirectUri()&&
    connectorSecretsConfigured()
  );
}
function stateKey(){return connectorStateSecret()}
function signState(payload:Record<string,unknown>){
  const encoded=Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature=createHmac('sha256',stateKey()).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}
function verifyState(value:string){
  const [encoded,signature]=String(value||'').split('.');
  if(!encoded||!signature)throw new ApiError(400,'oauth_state_invalid','Estado OAuth inválido.');
  const expected=createHmac('sha256',stateKey()).update(encoded).digest();
  const actual=Buffer.from(signature,'base64url');
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw new ApiError(400,'oauth_state_invalid','Estado OAuth inválido.');
  const payload=JSON.parse(Buffer.from(encoded,'base64url').toString('utf8')) as any;
  if(!payload?.workspaceId||!payload?.userId||!payload?.exp||Number(payload.exp)<Date.now())throw new ApiError(400,'oauth_state_expired','A sessão de conexão expirou. Inicie novamente.');
  return payload as {workspaceId:string;userId:string;exp:number;nonce:string;returnUrl:string};
}
function webReturnUrl(){
  return String(process.env.NEXOFFICE_WEB_URL||process.env.PUBLIC_WEB_URL||process.env.WEB_APP_URL||'https://nexoffices.com.br').trim().replace(/\/$/,'');
}
function authorizationUrl(state:string){
  const url=new URL(`https://login.microsoftonline.com/${encodeURIComponent(tenant())}/oauth2/v2.0/authorize`);
  url.searchParams.set('client_id',String(process.env.MICROSOFT_CONNECT_CLIENT_ID));
  url.searchParams.set('redirect_uri',microsoftRedirectUri());
  url.searchParams.set('response_type','code');
  url.searchParams.set('response_mode','query');
  url.searchParams.set('scope',MICROSOFT_SCOPES.join(' '));
  url.searchParams.set('state',state);
  url.searchParams.set('prompt','select_account');
  return url.toString();
}
async function tokenRequest(params:Record<string,string>){
  const response=await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant())}/oauth2/v2.0/token`,{
    method:'POST',
    headers:{'content-type':'application/x-www-form-urlencoded',accept:'application/json'},
    body:new URLSearchParams(params),
    signal:AbortSignal.timeout(12_000)
  });
  const body=await response.json().catch(()=>({})) as any;
  if(!response.ok||!body?.access_token)throw new ApiError(502,'microsoft_oauth_failed',String(body?.error_description||body?.error||'Falha ao concluir OAuth Microsoft.'));
  return body;
}
async function exchangeCode(code:string){
  const body=await tokenRequest({
    client_id:String(process.env.MICROSOFT_CONNECT_CLIENT_ID),
    client_secret:String(process.env.MICROSOFT_CONNECT_CLIENT_SECRET),
    code,
    redirect_uri:microsoftRedirectUri(),
    grant_type:'authorization_code',
    scope:MICROSOFT_SCOPES.join(' ')
  });
  return{
    accessToken:String(body.access_token),
    refreshToken:body.refresh_token?String(body.refresh_token):null,
    expiresAt:Date.now()+Number(body.expires_in||3600)*1000,
    tokenType:body.token_type?String(body.token_type):'Bearer',
    scope:body.scope?String(body.scope):null
  } satisfies MicrosoftTokenSecret;
}
async function refreshMicrosoftToken(secret:MicrosoftTokenSecret){
  if(secret.expiresAt>Date.now()+60_000)return secret;
  if(!secret.refreshToken)throw new ApiError(409,'microsoft_refresh_missing','A conexão Microsoft 365 precisa ser autorizada novamente.');
  const body=await tokenRequest({
    client_id:String(process.env.MICROSOFT_CONNECT_CLIENT_ID),
    client_secret:String(process.env.MICROSOFT_CONNECT_CLIENT_SECRET),
    refresh_token:secret.refreshToken,
    grant_type:'refresh_token',
    scope:MICROSOFT_SCOPES.join(' ')
  });
  return{
    ...secret,
    accessToken:String(body.access_token),
    refreshToken:body.refresh_token?String(body.refresh_token):secret.refreshToken,
    expiresAt:Date.now()+Number(body.expires_in||3600)*1000,
    tokenType:body.token_type?String(body.token_type):secret.tokenType,
    scope:body.scope?String(body.scope):secret.scope
  } satisfies MicrosoftTokenSecret;
}
async function graphJson<T=any>(path:string,accessToken:string){
  const url=path.startsWith('http')?path:`https://graph.microsoft.com/v1.0${path}`;
  const response=await fetch(url,{headers:{authorization:`Bearer ${accessToken}`,accept:'application/json'},signal:AbortSignal.timeout(15_000)});
  const body=await response.json().catch(()=>({})) as any;
  if(!response.ok)throw new ApiError(response.status===401?401:502,'microsoft_graph_failed',String(body?.error?.message||`Microsoft Graph HTTP ${response.status}`));
  return body as T;
}
function address(value:any){
  const email=String(value?.emailAddress?.address||value?.address||'').trim().toLowerCase();
  return email&&email.includes('@')?email:null;
}
function addresses(values:any){
  return (Array.isArray(values)?values:[]).map(address).filter(Boolean).slice(0,50);
}
function calendarIso(value:any){
  const raw=String(value?.dateTime||value||'');
  if(!raw)return new Date().toISOString();
  const normalized=/Z$|[+-]\d\d:\d\d$/.test(raw)?raw:`${raw}Z`;
  const date=new Date(normalized);
  return Number.isNaN(date.getTime())?new Date().toISOString():date.toISOString();
}
async function loadIntegrationSecret(workspaceId:string){
  const integration=(await query<any>(`select provider,status,config,secret_ref,capabilities from integrations where workspace_id=$1 and provider='microsoft_365' limit 1`,[workspaceId]))[0];
  if(!integration?.secret_ref)throw new ApiError(409,'microsoft_not_connected','Microsoft 365 ainda não está conectado.');
  return{integration,secret:decryptConnectorSecret<MicrosoftTokenSecret>(String(integration.secret_ref))};
}

export async function registerMicrosoftConnectRoutes(app:FastifyInstance){
  app.get('/v1/connect/microsoft/status',async req=>{
    const ctx=await workspaceContext(req,'integrations.read');
    const integration=(await query<any>(`select status,external_account_ref,capabilities,config,connected_at,updated_at from integrations where workspace_id=$1 and provider='microsoft_365' limit 1`,[ctx.workspaceId]))[0];
    return{
      provider:'microsoft_365',
      configured:microsoftConfigured(),
      status:integration?.status||'disconnected',
      accountEmail:integration?.external_account_ref||null,
      capabilities:Array.isArray(integration?.capabilities)?integration.capabilities:[],
      lastSyncAt:integration?.config?.lastSyncAt||null,
      lastSync:integration?.config?.lastSync||null,
      scopes:{mail:'basic_metadata_only',calendar:'basic_readonly'},
      safety:{sendEmail:false,modifyMailbox:false,createCalendarEvent:false,modifyCalendarEvent:false,readOnly:true}
    };
  });

  app.post('/v1/connect/microsoft/start',async req=>{
    const ctx=await workspaceContext(req,'integrations.manage');
    if(!microsoftConfigured())throw new ApiError(503,'microsoft_connect_not_configured','Microsoft 365 Connect ainda não está configurado no servidor.');
    const state=signState({
      workspaceId:ctx.workspaceId,
      userId:ctx.user.id,
      exp:Date.now()+10*60_000,
      nonce:randomUUID(),
      returnUrl:`${webReturnUrl()}/?app=1&nexconnect=microsoft`
    });
    await auditLog(ctx,'nex_connect.microsoft_oauth_started','workspace',ctx.workspaceId,null,{
      provider:'microsoft_365',
      scopes:[USER_READ_SCOPE,MAIL_READ_BASIC_SCOPE,CALENDAR_READ_BASIC_SCOPE],
      externalEffect:false,
      readOnly:true
    });
    return{
      provider:'microsoft_365',
      authorizationUrl:authorizationUrl(state),
      expiresInSeconds:600,
      scopes:{mail:'basic_metadata_only',calendar:'basic_readonly'},
      safety:{readOnly:true,sendEmail:false,modifyCalendar:false}
    };
  });

  app.get('/v1/connect/microsoft/callback',async(req,reply)=>{
    if(!microsoftConfigured())throw new ApiError(503,'microsoft_connect_not_configured','Microsoft 365 Connect ainda não está configurado no servidor.');
    const queryData=req.query as any;
    const state=verifyState(String(queryData?.state||''));
    if(queryData?.error)return reply.redirect(`${state.returnUrl}&status=denied`);
    const code=String(queryData?.code||'');
    if(!code)throw new ApiError(400,'microsoft_oauth_code_missing','Código OAuth ausente.');
    const membership=(await query<any>(`select 1 from workspace_members where workspace_id=$1 and user_id=$2 and active=true limit 1`,[state.workspaceId,state.userId]))[0];
    if(!membership)throw new ApiError(403,'workspace_membership_required','Acesso ao workspace não está mais ativo.');

    const token=await exchangeCode(code);
    const profile=await graphJson<any>('/me?$select=id,displayName,mail,userPrincipalName',token.accessToken);
    const accountEmail=String(profile?.mail||profile?.userPrincipalName||'').toLowerCase();
    const granted=new Set(String(token.scope||'').split(/\s+/).filter(Boolean));
    const hasScope=(scope:string)=>granted.has(scope)||granted.has(`https://graph.microsoft.com/${scope}`);
    const capabilities=[
      ...(hasScope(MAIL_READ_BASIC_SCOPE)?['email.metadata.read']:[]),
      ...(hasScope(CALENDAR_READ_BASIC_SCOPE)?['calendar.read']:[])
    ];
    if(!capabilities.length)throw new ApiError(400,'microsoft_scopes_missing','Nenhum escopo de leitura esperado foi concedido.');

    await query(
      `insert into integrations(workspace_id,provider,status,external_account_ref,capabilities,config,secret_ref,connected_at,updated_at)
       values($1,'microsoft_365','connected',$2,$3,$4,$5,now(),now())
       on conflict(workspace_id,provider) do update set
         status='connected',
         external_account_ref=excluded.external_account_ref,
         capabilities=excluded.capabilities,
         config=excluded.config,
         secret_ref=excluded.secret_ref,
         connected_at=coalesce(integrations.connected_at,now()),
         updated_at=now()`,
      [
        state.workspaceId,
        accountEmail||null,
        capabilities,
        JSON.stringify({grantedScopes:[...granted],connectionMode:'read_only',tenant:tenant(),graphProfileId:profile?.id?String(profile.id):null}),
        encryptConnectorSecret(token)
      ]
    );
    await query(
      `insert into audit_log(workspace_id,actor_type,actor_ref,action,subject_type,subject_id,after_state,metadata)
       values($1,'user',$2,'nex_connect.microsoft_connected','workspace',$1,$3,$4)`,
      [state.workspaceId,state.userId,JSON.stringify({provider:'microsoft_365',accountEmail,capabilities}),JSON.stringify({externalEffect:false,readOnly:true})]
    ).catch(()=>null);
    return reply.redirect(`${state.returnUrl}&status=connected`);
  });

  app.post('/v1/connect/microsoft/sync',async req=>{
    const ctx=await workspaceContext(req,'integrations.manage');
    if(!microsoftConfigured())throw new ApiError(503,'microsoft_connect_not_configured','Microsoft 365 Connect ainda não está configurado no servidor.');
    const loaded=await loadIntegrationSecret(ctx.workspaceId);
    const secret=await refreshMicrosoftToken(loaded.secret);
    if(secret.accessToken!==loaded.secret.accessToken||secret.expiresAt!==loaded.secret.expiresAt||secret.refreshToken!==loaded.secret.refreshToken){
      await query(`update integrations set secret_ref=$3,updated_at=now() where workspace_id=$1 and provider=$2`,[ctx.workspaceId,'microsoft_365',encryptConnectorSecret(secret)]);
    }

    let mailSeen=0,mailInserted=0,calendarSeen=0,calendarInserted=0;
    const warnings:string[]=[];
    const capabilities=new Set(Array.isArray(loaded.integration.capabilities)?loaded.integration.capabilities:[]);

    if(capabilities.has('email.metadata.read')){
      const params=new URLSearchParams({
        '$top':'50',
        '$select':'id,conversationId,subject,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,isRead,importance,parentFolderId',
        '$orderby':'receivedDateTime desc'
      });
      const list=await graphJson<any>(`/me/messages?${params.toString()}`,secret.accessToken);
      const messages=Array.isArray(list?.value)?list.value:[];
      mailSeen=messages.length;
      for(const message of messages){
        try{
          const correlationId=`microsoft:mail:${String(message.id)}`;
          const exists=(await query<any>(`select 1 from business_events where workspace_id=$1 and source='external.microsoft.mail' and correlation_id=$2 limit 1`,[ctx.workspaceId,correlationId]))[0];
          if(exists)continue;
          const from=address(message.from);
          await query(
            `insert into business_events(workspace_id,type,source,subject_type,subject_id,payload,correlation_id,occurred_at)
             values($1,'email.metadata.observed','external.microsoft.mail','external_message',null,$2,$3,$4)`,
            [ctx.workspaceId,JSON.stringify({
              schemaVersion:'nex-connect-microsoft-v1',
              messageId:String(message.id),
              conversationId:message.conversationId?String(message.conversationId):null,
              subject:String(message.subject||'(sem assunto)').slice(0,500),
              from:from?[from]:[],
              to:addresses(message.toRecipients),
              cc:addresses(message.ccRecipients),
              receivedDateTime:message.receivedDateTime||null,
              sentDateTime:message.sentDateTime||null,
              isRead:Boolean(message.isRead),
              importance:message.importance?String(message.importance):null,
              parentFolderIdHash:message.parentFolderId?createHash('sha256').update(String(message.parentFolderId)).digest('hex').slice(0,32):null,
              privacy:'mail_read_basic',
              bodyStored:false,
              bodyPreviewStored:false,
              attachmentsStored:false
            }),correlationId,String(message.receivedDateTime||message.sentDateTime||new Date().toISOString())]
          );
          mailInserted++;
        }catch(error){warnings.push(`Outlook: ${error instanceof Error?error.message:String(error)}`)}
      }
    }

    if(capabilities.has('calendar.read')){
      const startDateTime=new Date(Date.now()-30*86400_000).toISOString();
      const endDateTime=new Date(Date.now()+180*86400_000).toISOString();
      const params=new URLSearchParams({
        startDateTime,
        endDateTime,
        '$top':'100',
        '$select':'id,subject,start,end,organizer,attendees,location,isAllDay,isCancelled,type,seriesMasterId'
      });
      const list=await graphJson<any>(`/me/calendarView?${params.toString()}`,secret.accessToken);
      const events=Array.isArray(list?.value)?list.value:[];
      calendarSeen=events.length;
      for(const event of events){
        try{
          const startAt=calendarIso(event.start);
          const endAt=calendarIso(event.end);
          const eventVersion=createHash('sha256').update(JSON.stringify([event.id,event.subject,startAt,endAt,event.isCancelled])).digest('hex').slice(0,16);
          const correlationId=`microsoft:calendar:${String(event.id)}:${eventVersion}`;
          const exists=(await query<any>(`select 1 from business_events where workspace_id=$1 and source='external.microsoft.calendar' and correlation_id=$2 limit 1`,[ctx.workspaceId,correlationId]))[0];
          if(exists)continue;
          const organizer=address(event.organizer);
          await query(
            `insert into business_events(workspace_id,type,source,subject_type,subject_id,payload,correlation_id,occurred_at)
             values($1,'calendar.event.observed','external.microsoft.calendar','external_calendar_event',null,$2,$3,$4)`,
            [ctx.workspaceId,JSON.stringify({
              schemaVersion:'nex-connect-microsoft-v1',
              eventId:String(event.id),
              summary:String(event.subject||'Compromisso sem título').slice(0,500),
              startAt,
              endAt,
              organizerEmail:organizer,
              attendeeEmails:addresses(event.attendees),
              location:event.location?.displayName?String(event.location.displayName).slice(0,500):null,
              isAllDay:Boolean(event.isAllDay),
              isCancelled:Boolean(event.isCancelled),
              eventType:event.type?String(event.type):null,
              seriesMasterIdHash:event.seriesMasterId?createHash('sha256').update(String(event.seriesMasterId)).digest('hex').slice(0,32):null,
              privacy:'calendar_read_basic',
              bodyStored:false,
              attachmentsStored:false,
              externalModificationAllowed:false
            }),correlationId,startAt]
          );
          calendarInserted++;
        }catch(error){warnings.push(`Microsoft Calendar: ${error instanceof Error?error.message:String(error)}`)}
      }
    }

    const lastSyncAt=new Date().toISOString();
    const nextConfig={
      ...(loaded.integration.config&&typeof loaded.integration.config==='object'?loaded.integration.config:{}),
      lastSyncAt,
      lastSync:{mailSeen,mailInserted,calendarSeen,calendarInserted,warnings:warnings.slice(0,10)}
    };
    await query(
      `update integrations set status='connected',config=$3,updated_at=now() where workspace_id=$1 and provider=$2`,
      [ctx.workspaceId,'microsoft_365',JSON.stringify(nextConfig)]
    );
    await auditLog(ctx,'nex_connect.microsoft_synced','workspace',ctx.workspaceId,null,{
      provider:'microsoft_365',mailSeen,mailInserted,calendarSeen,calendarInserted,warnings:warnings.slice(0,10),externalEffect:false,readOnly:true
    });
    return{
      provider:'microsoft_365',
      mail:{seen:mailSeen,inserted:mailInserted,privacy:'mail_read_basic'},
      calendar:{seen:calendarSeen,inserted:calendarInserted,mode:'basic_readonly'},
      warnings:warnings.slice(0,10),
      safety:{readOnly:true,sendEmail:false,modifyMailbox:false,modifyCalendar:false,externalEffects:false}
    };
  });

  app.post('/v1/connect/microsoft/disconnect',async req=>{
    const ctx=await workspaceContext(req,'integrations.manage');
    await query(
      `update integrations set status='disconnected',external_account_ref=null,secret_ref=null,capabilities='{}',config=config||$3::jsonb,updated_at=now() where workspace_id=$1 and provider=$2`,
      [ctx.workspaceId,'microsoft_365',JSON.stringify({disconnectedAt:new Date().toISOString()})]
    );
    await auditLog(ctx,'nex_connect.microsoft_disconnected','workspace',ctx.workspaceId,null,{provider:'microsoft_365',tokensRemoved:true,externalEffect:false});
    return{ok:true,provider:'microsoft_365',status:'disconnected',tokensRemoved:true};
  });
}
