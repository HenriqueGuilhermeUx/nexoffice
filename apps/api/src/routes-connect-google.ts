import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
import type {FastifyInstance} from 'fastify';
import {ApiError,workspaceContext} from './auth.js';
import {auditLog} from './events.js';
import {query,transaction} from './db.js';
import {connectorSecretsConfigured,connectorStateSecret,decryptConnectorSecret,encryptConnectorSecret} from './connector-secrets.js';

const GMAIL_METADATA_SCOPE='https://www.googleapis.com/auth/gmail.metadata';
const CALENDAR_READONLY_SCOPE='https://www.googleapis.com/auth/calendar.readonly';
const GOOGLE_SCOPES=[GMAIL_METADATA_SCOPE,CALENDAR_READONLY_SCOPE];

type GoogleTokenSecret={
  accessToken:string;
  refreshToken?:string|null;
  expiresAt:number;
  tokenType?:string|null;
  scope?:string|null;
};

function googleRedirectUri(){
  const explicit=String(process.env.GOOGLE_CONNECT_REDIRECT_URI||'').trim();
  if(explicit)return explicit;
  const apiBase=String(process.env.NEXOFFICE_PUBLIC_API_URL||'').trim().replace(/\/$/,'');
  return apiBase?`${apiBase}/v1/connect/google/callback`:'';
}
function googleConfigured(){
  return Boolean(
    String(process.env.GOOGLE_CONNECT_CLIENT_ID||'').trim()&&
    String(process.env.GOOGLE_CONNECT_CLIENT_SECRET||'').trim()&&
    googleRedirectUri()&&
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

function authUrl(state:string){
  const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id',String(process.env.GOOGLE_CONNECT_CLIENT_ID));
  url.searchParams.set('redirect_uri',googleRedirectUri());
  url.searchParams.set('response_type','code');
  url.searchParams.set('scope',GOOGLE_SCOPES.join(' '));
  url.searchParams.set('access_type','offline');
  url.searchParams.set('include_granted_scopes','true');
  url.searchParams.set('prompt','consent');
  url.searchParams.set('state',state);
  return url.toString();
}

async function exchangeCode(code:string){
  const response=await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',
    headers:{'content-type':'application/x-www-form-urlencoded',accept:'application/json'},
    body:new URLSearchParams({
      code,
      client_id:String(process.env.GOOGLE_CONNECT_CLIENT_ID),
      client_secret:String(process.env.GOOGLE_CONNECT_CLIENT_SECRET),
      redirect_uri:googleRedirectUri(),
      grant_type:'authorization_code'
    }),
    signal:AbortSignal.timeout(12_000)
  });
  const body=await response.json().catch(()=>({})) as any;
  if(!response.ok||!body?.access_token)throw new ApiError(502,'google_oauth_exchange_failed',String(body?.error_description||body?.error||'Falha ao concluir OAuth Google.'));
  return {
    accessToken:String(body.access_token),
    refreshToken:body.refresh_token?String(body.refresh_token):null,
    expiresAt:Date.now()+Number(body.expires_in||3600)*1000,
    tokenType:body.token_type?String(body.token_type):'Bearer',
    scope:body.scope?String(body.scope):null
  } satisfies GoogleTokenSecret;
}

async function refreshGoogleToken(secret:GoogleTokenSecret){
  if(secret.expiresAt>Date.now()+60_000)return secret;
  if(!secret.refreshToken)throw new ApiError(409,'google_refresh_missing','A conexão Google precisa ser autorizada novamente.');
  const response=await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',
    headers:{'content-type':'application/x-www-form-urlencoded',accept:'application/json'},
    body:new URLSearchParams({
      refresh_token:secret.refreshToken,
      client_id:String(process.env.GOOGLE_CONNECT_CLIENT_ID),
      client_secret:String(process.env.GOOGLE_CONNECT_CLIENT_SECRET),
      grant_type:'refresh_token'
    }),
    signal:AbortSignal.timeout(12_000)
  });
  const body=await response.json().catch(()=>({})) as any;
  if(!response.ok||!body?.access_token)throw new ApiError(502,'google_token_refresh_failed',String(body?.error_description||body?.error||'Falha ao renovar acesso Google.'));
  return{
    ...secret,
    accessToken:String(body.access_token),
    expiresAt:Date.now()+Number(body.expires_in||3600)*1000,
    tokenType:body.token_type?String(body.token_type):secret.tokenType,
    scope:body.scope?String(body.scope):secret.scope
  } satisfies GoogleTokenSecret;
}

async function googleJson<T=any>(url:string,accessToken:string){
  const response=await fetch(url,{headers:{authorization:`Bearer ${accessToken}`,accept:'application/json'},signal:AbortSignal.timeout(15_000)});
  const body=await response.json().catch(()=>({})) as any;
  if(!response.ok)throw new ApiError(response.status===401?401:502,'google_api_failed',String(body?.error?.message||body?.error_description||`Google HTTP ${response.status}`));
  return body as T;
}

function header(message:any,name:string){
  const headers=Array.isArray(message?.payload?.headers)?message.payload.headers:[];
  return String(headers.find((item:any)=>String(item?.name||'').toLowerCase()===name.toLowerCase())?.value||'').slice(0,1000);
}
function isoFromInternalDate(value:unknown){
  const n=Number(value||0);return Number.isFinite(n)&&n>0?new Date(n).toISOString():new Date().toISOString();
}
function compactAddress(value:string){
  return value.split(',').map(item=>item.trim()).filter(Boolean).slice(0,20).map(item=>item.slice(0,240));
}
function calendarDate(event:any){
  const value=event?.start?.dateTime||event?.start?.date||event?.created||event?.updated;
  const date=new Date(String(value||''));return Number.isNaN(date.getTime())?new Date().toISOString():date.toISOString();
}

async function loadIntegrationSecret(workspaceId:string){
  const integration=(await query<any>(`select provider,status,config,secret_ref,capabilities from integrations where workspace_id=$1 and provider='google_workspace' limit 1`,[workspaceId]))[0];
  if(!integration?.secret_ref)throw new ApiError(409,'google_not_connected','Google Workspace ainda não está conectado.');
  return{integration,secret:decryptConnectorSecret<GoogleTokenSecret>(String(integration.secret_ref))};
}

export async function registerGoogleConnectRoutes(app:FastifyInstance){
  app.get('/v1/connect/google/status',async req=>{
    const ctx=await workspaceContext(req,'integrations.read');
    const integration=(await query<any>(`select status,external_account_ref,capabilities,config,connected_at,updated_at from integrations where workspace_id=$1 and provider='google_workspace' limit 1`,[ctx.workspaceId]))[0];
    return{
      provider:'google_workspace',
      configured:googleConfigured(),
      status:integration?.status||'disconnected',
      accountEmail:integration?.external_account_ref||null,
      capabilities:Array.isArray(integration?.capabilities)?integration.capabilities:[],
      lastSyncAt:integration?.config?.lastSyncAt||null,
      lastSync:integration?.config?.lastSync||null,
      scopes:{gmail:'metadata_only',calendar:'readonly'},
      safety:{sendEmail:false,modifyMailbox:false,createCalendarEvent:false,modifyCalendarEvent:false,readOnly:true}
    };
  });

  app.post('/v1/connect/google/start',async req=>{
    const ctx=await workspaceContext(req,'integrations.manage');
    if(!googleConfigured())throw new ApiError(503,'google_connect_not_configured','Google Connect ainda não está configurado no servidor.');
    const state=signState({
      workspaceId:ctx.workspaceId,
      userId:ctx.user.id,
      exp:Date.now()+10*60_000,
      nonce:randomUUID(),
      returnUrl:`${webReturnUrl()}/?app=1&nexconnect=google`
    });
    await auditLog(ctx,'nex_connect.google_oauth_started','workspace',ctx.workspaceId,null,{
      provider:'google_workspace',
      scopes:[GMAIL_METADATA_SCOPE,CALENDAR_READONLY_SCOPE],
      externalEffect:false
    });
    return{
      provider:'google_workspace',
      authorizationUrl:authUrl(state),
      expiresInSeconds:600,
      scopes:{gmail:'metadata_only',calendar:'readonly'},
      safety:{readOnly:true,sendEmail:false,modifyCalendar:false}
    };
  });

  app.get('/v1/connect/google/callback',async(req,reply)=>{
    if(!googleConfigured())throw new ApiError(503,'google_connect_not_configured','Google Connect ainda não está configurado no servidor.');
    const queryData=req.query as any;
    const state=verifyState(String(queryData?.state||''));
    if(queryData?.error){
      return reply.redirect(`${state.returnUrl}&status=denied`);
    }
    const code=String(queryData?.code||'');
    if(!code)throw new ApiError(400,'google_oauth_code_missing','Código OAuth ausente.');
    const membership=(await query<any>(`select 1 from workspace_members where workspace_id=$1 and user_id=$2 and active=true limit 1`,[state.workspaceId,state.userId]))[0];
    if(!membership)throw new ApiError(403,'workspace_membership_required','Acesso ao workspace não está mais ativo.');

    const token=await exchangeCode(code);
    const profile=await googleJson<any>('https://gmail.googleapis.com/gmail/v1/users/me/profile',token.accessToken);
    const accountEmail=String(profile?.emailAddress||'').toLowerCase();
    const granted=new Set(String(token.scope||'').split(/\s+/).filter(Boolean));
    const capabilities=[
      ...(granted.has(GMAIL_METADATA_SCOPE)?['email.metadata.read']:[]),
      ...(granted.has(CALENDAR_READONLY_SCOPE)?['calendar.read']:[])
    ];
    if(!capabilities.length)throw new ApiError(400,'google_scopes_missing','Nenhum escopo de leitura esperado foi concedido.');

    await query(
      `insert into integrations(workspace_id,provider,status,external_account_ref,capabilities,config,secret_ref,connected_at,updated_at)
       values($1,'google_workspace','connected',$2,$3,$4,$5,now(),now())
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
        JSON.stringify({grantedScopes:[...granted],gmailHistoryId:profile?.historyId?String(profile.historyId):null,connectionMode:'read_only'}),
        encryptConnectorSecret(token)
      ]
    );
    await query(
      `insert into audit_log(workspace_id,actor_type,actor_ref,action,subject_type,subject_id,after_state,metadata)
       values($1,'user',$2,'nex_connect.google_connected','workspace',$1,$3,$4)`,
      [state.workspaceId,state.userId,JSON.stringify({provider:'google_workspace',accountEmail,capabilities}),JSON.stringify({externalEffect:false,readOnly:true})]
    ).catch(()=>null);
    return reply.redirect(`${state.returnUrl}&status=connected`);
  });

  app.post('/v1/connect/google/sync',async req=>{
    const ctx=await workspaceContext(req,'integrations.manage');
    if(!googleConfigured())throw new ApiError(503,'google_connect_not_configured','Google Connect ainda não está configurado no servidor.');
    const loaded=await loadIntegrationSecret(ctx.workspaceId);
    let secret=await refreshGoogleToken(loaded.secret);
    if(secret.accessToken!==loaded.secret.accessToken||secret.expiresAt!==loaded.secret.expiresAt){
      await query(`update integrations set secret_ref=$3,updated_at=now() where workspace_id=$1 and provider=$2`,[ctx.workspaceId,'google_workspace',encryptConnectorSecret(secret)]);
    }

    let gmailInserted=0,calendarInserted=0,gmailSeen=0,calendarSeen=0;
    const warnings:string[]=[];
    const capabilities=new Set(Array.isArray(loaded.integration.capabilities)?loaded.integration.capabilities:[]);

    if(capabilities.has('email.metadata.read')){
      const list=await googleJson<any>('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&includeSpamTrash=false',secret.accessToken);
      const messages=Array.isArray(list?.messages)?list.messages:[];
      gmailSeen=messages.length;
      for(const item of messages){
        try{
          const message=await googleJson<any>(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(String(item.id))}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Date&metadataHeaders=Message-Id`,secret.accessToken);
          const correlationId=`google:gmail:${String(message.id)}`;
          const exists=(await query<any>(`select 1 from business_events where workspace_id=$1 and source='external.google.gmail' and correlation_id=$2 limit 1`,[ctx.workspaceId,correlationId]))[0];
          if(exists)continue;
          await query(
            `insert into business_events(workspace_id,type,source,subject_type,subject_id,payload,correlation_id,occurred_at)
             values($1,'email.metadata.observed','external.google.gmail','external_message',null,$2,$3,$4)`,
            [ctx.workspaceId,JSON.stringify({
              schemaVersion:'nex-connect-google-v1',
              messageId:String(message.id),
              threadId:message.threadId?String(message.threadId):null,
              labels:Array.isArray(message.labelIds)?message.labelIds.slice(0,30):[],
              subject:header(message,'Subject'),
              from:compactAddress(header(message,'From')),
              to:compactAddress(header(message,'To')),
              cc:compactAddress(header(message,'Cc')),
              headerDate:header(message,'Date')||null,
              rfcMessageId:header(message,'Message-Id')||null,
              privacy:'metadata_only',
              bodyStored:false,
              attachmentsStored:false
            }),correlationId,isoFromInternalDate(message.internalDate)]
          );
          gmailInserted++;
        }catch(error){warnings.push(`Gmail: ${error instanceof Error?error.message:String(error)}`)}
      }
    }

    if(capabilities.has('calendar.read')){
      const timeMin=new Date(Date.now()-30*86400_000).toISOString();
      const timeMax=new Date(Date.now()+180*86400_000).toISOString();
      const url=new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
      url.searchParams.set('singleEvents','true');
      url.searchParams.set('orderBy','startTime');
      url.searchParams.set('maxResults','100');
      url.searchParams.set('timeMin',timeMin);
      url.searchParams.set('timeMax',timeMax);
      const list=await googleJson<any>(url.toString(),secret.accessToken);
      const events=Array.isArray(list?.items)?list.items:[];
      calendarSeen=events.length;
      for(const event of events){
        try{
          const correlationId=`google:calendar:${String(event.id)}:${String(event.updated||event.etag||'')}`;
          const exists=(await query<any>(`select 1 from business_events where workspace_id=$1 and source='external.google.calendar' and correlation_id=$2 limit 1`,[ctx.workspaceId,correlationId]))[0];
          if(exists)continue;
          await query(
            `insert into business_events(workspace_id,type,source,subject_type,subject_id,payload,correlation_id,occurred_at)
             values($1,'calendar.event.observed','external.google.calendar','external_calendar_event',null,$2,$3,$4)`,
            [ctx.workspaceId,JSON.stringify({
              schemaVersion:'nex-connect-google-v1',
              eventId:String(event.id),
              status:event.status?String(event.status):null,
              summary:String(event.summary||'Compromisso sem título').slice(0,500),
              descriptionPresent:Boolean(event.description),
              location:event.location?String(event.location).slice(0,500):null,
              organizerEmail:event.organizer?.email?String(event.organizer.email).toLowerCase():null,
              attendeeEmails:Array.isArray(event.attendees)?event.attendees.map((attendee:any)=>String(attendee?.email||'').toLowerCase()).filter(Boolean).slice(0,50):[],
              start:event.start||null,
              end:event.end||null,
              recurringEventId:event.recurringEventId?String(event.recurringEventId):null,
              htmlLinkPresent:Boolean(event.htmlLink),
              privacy:'calendar_readonly',
              externalModificationAllowed:false
            }),correlationId,calendarDate(event)]
          );
          calendarInserted++;
        }catch(error){warnings.push(`Calendar: ${error instanceof Error?error.message:String(error)}`)}
      }
    }

    const profile=await googleJson<any>('https://gmail.googleapis.com/gmail/v1/users/me/profile',secret.accessToken).catch(()=>null);
    const lastSyncAt=new Date().toISOString();
    const nextConfig={
      ...(loaded.integration.config&&typeof loaded.integration.config==='object'?loaded.integration.config:{}),
      gmailHistoryId:profile?.historyId?String(profile.historyId):(loaded.integration.config?.gmailHistoryId||null),
      lastSyncAt,
      lastSync:{gmailSeen,gmailInserted,calendarSeen,calendarInserted,warnings:warnings.slice(0,10)}
    };
    await query(
      `update integrations set status='connected',config=$3,updated_at=now() where workspace_id=$1 and provider=$2`,
      [ctx.workspaceId,'google_workspace',JSON.stringify(nextConfig)]
    );
    await auditLog(ctx,'nex_connect.google_synced','workspace',ctx.workspaceId,null,{
      provider:'google_workspace',gmailSeen,gmailInserted,calendarSeen,calendarInserted,warnings:warnings.slice(0,10),externalEffect:false,readOnly:true
    });
    return{
      provider:'google_workspace',
      gmail:{seen:gmailSeen,inserted:gmailInserted,privacy:'metadata_only'},
      calendar:{seen:calendarSeen,inserted:calendarInserted,mode:'readonly'},
      warnings:warnings.slice(0,10),
      safety:{readOnly:true,sendEmail:false,modifyMailbox:false,modifyCalendar:false,externalEffects:false}
    };
  });

  app.post('/v1/connect/google/disconnect',async req=>{
    const ctx=await workspaceContext(req,'integrations.manage');
    await query(
      `update integrations set status='disconnected',external_account_ref=null,secret_ref=null,capabilities='{}',config=config||$3::jsonb,updated_at=now() where workspace_id=$1 and provider=$2`,
      [ctx.workspaceId,'google_workspace',JSON.stringify({disconnectedAt:new Date().toISOString()})]
    );
    await auditLog(ctx,'nex_connect.google_disconnected','workspace',ctx.workspaceId,null,{provider:'google_workspace',tokensRemoved:true,externalEffect:false});
    return{provider:'google_workspace',status:'disconnected',tokensRemoved:true};
  });
}
