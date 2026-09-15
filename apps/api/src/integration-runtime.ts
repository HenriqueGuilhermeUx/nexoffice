import {query} from './db.js';

export const CAPABILITIES = {
  docwallet: {label:'DocWallet', baseEnv:'DOCWALLET_BASE_URL', keyEnv:'DOCWALLET_API_KEY', health:'/api/internal/nexoffice/health', capabilities:['documents','ocr','signature','approval']},
  staff: {label:'Staff', baseEnv:'STAFF_BASE_URL', keyEnv:'STAFF_API_KEY', health:'/.netlify/functions/nexoffice-assistant', capabilities:['business_conversation','voice_orchestration','workspace_context']},
  smartbots: {label:'SmartBots', baseEnv:'SMARTBOTS_BASE_URL', keyEnv:'SMARTBOTS_API_KEY', health:'/api/internal/nexoffice/health', capabilities:['whatsapp','service','qualification','follow-up','human_approval']},
  nextgen: {label:'NextGen', baseEnv:'NEXTGEN_BASE_URL', keyEnv:'NEXTGEN_API_KEY', health:'/health', capabilities:['pix','charges','reconciliation']},
  modo: {label:'MODO', baseEnv:'MODO_BASE_URL', keyEnv:'MODO_API_KEY', health:'/health', capabilities:['growth','content','campaigns','intelligence']},
  taxagent: {label:'TaxAgent', baseEnv:'TAXAGENT_BASE_URL', keyEnv:'TAXAGENT_API_KEY', health:'/health', capabilities:['nfse','tax']}
} as const;

export type Provider = keyof typeof CAPABILITIES;

function providerKey(provider:Provider){
  if(provider==='docwallet')return String(process.env.DOCWALLET_SERVICE_KEY||process.env.DOCWALLET_API_KEY||'');
  const c=CAPABILITIES[provider];return String(process.env[c.keyEnv]||'');
}

export function providerCatalog(){
  return Object.entries(CAPABILITIES).map(([provider,c])=>({provider,label:c.label,capabilities:[...c.capabilities],baseUrlConfigured:Boolean(process.env[c.baseEnv]),credentialConfigured:Boolean(providerKey(provider as Provider))}));
}

export async function probeProvider(workspaceId:string,provider:Provider){
  const c=CAPABILITIES[provider];const base=String(process.env[c.baseEnv]||'').replace(/\/$/,'');
  if(!base)return {provider,ok:false,status:'not_configured',error:`${c.baseEnv} não configurada`};
  const workspaceScoped=provider==='docwallet'||provider==='staff'||provider==='smartbots';
  const headers={...providerHeaders(provider),...(workspaceScoped?{'X-NexOffice-Workspace-ID':workspaceId}:{})};
  try{
    const response=await fetch(`${base}${c.health}`,{headers,signal:AbortSignal.timeout(8000)});const text=await response.text();const payload=(()=>{try{return JSON.parse(text)}catch{return {text:text.slice(0,500)}}})();
    const workspaceDisconnected=provider==='docwallet'&&response.ok&&(payload as any)?.workspaceConnected===false;
    const status=workspaceDisconnected?'disconnected':response.ok?'connected':'error';const ok=response.ok&&!workspaceDisconnected;
    await upsertIntegrationHealth(workspaceId,provider,status,response.ok?null:`HTTP ${response.status}`);return {provider,ok,status,httpStatus:response.status,payload};
  }catch(error){const message=error instanceof Error?error.message:String(error);await upsertIntegrationHealth(workspaceId,provider,'error',message);return {provider,ok:false,status:'error',error:message}}
}

async function upsertIntegrationHealth(workspaceId:string,provider:string,status:string,error:string|null){
  const capabilities=(CAPABILITIES as any)[provider]?.capabilities||[];
  await query(`insert into integrations(workspace_id,provider,status,capabilities,last_health_at,last_health_status,last_error) values($1,$2,$3,$4,now(),$3,$5) on conflict(workspace_id,provider) do update set status=excluded.status,capabilities=excluded.capabilities,last_health_at=now(),last_health_status=excluded.last_health_status,last_error=excluded.last_error,updated_at=now()`,[workspaceId,provider,status,capabilities,error]);
}

export function routeForAction(actionType:string):string|null{
  if(actionType.startsWith('message.send')||actionType==='collection.reminder.send')return 'smartbots.message.send';
  if(actionType.startsWith('payment.charge')||actionType.startsWith('collection.charge'))return 'nextgen.charge.create';
  if(actionType==='document.analyze'||actionType==='document.signature_request'||actionType.startsWith('document.'))return 'docwallet.document.action';
  if(actionType.startsWith('campaign.')||actionType.startsWith('growth.'))return 'modo.growth.action';
  if(actionType.startsWith('voice.')||actionType.startsWith('assistant.'))return 'staff.assistant.action';
  if(actionType.startsWith('invoice.issue'))return 'taxagent.invoice.issue';
  return null;
}

export async function dispatchOutbox(topic:string,payload:any,workspaceId?:string){
  if(String(process.env.NEXOFFICE_EXTERNAL_ACTIONS||'false')!=='true')return {ok:true,dryRun:true,topic,payload:{correlationId:payload?.correlationId}};
  if(topic==='nextgen.charge.create')return createNextGenCharge(payload);
  if(topic==='docwallet.document.action')return dispatchDocWallet(payload,workspaceId);
  if(topic==='smartbots.message.send')return dispatchSmartBots(payload,workspaceId);
  if(topic==='staff.assistant.action')return dispatchStaff(payload,workspaceId);
  if(topic==='modo.growth.action')return dispatchConfigurable('modo',process.env.MODO_ACTION_PATH,payload);
  if(topic==='taxagent.invoice.issue')return dispatchConfigurable('taxagent',process.env.TAXAGENT_INVOICE_PATH,payload);
  return {ok:false,error:`adapter_not_ready:${topic}`};
}

export async function callStaffBusiness(workspaceId:string,payload:any){
  return dispatchStaff(payload,workspaceId);
}

async function dispatchDocWallet(payload:any,workspaceId?:string){
  const externalRef=String(payload?.externalRef||payload?.documentRef||'');if(!externalRef)return {ok:false,error:'docwallet_external_ref_required'};
  if(!workspaceId)return {ok:false,error:'docwallet_workspace_required'};
  const actionType=String(payload?.actionType||'');const idempotencyKey=String(payload?.correlationId||payload?.commandActionId||'');
  const headers={'X-NexOffice-Workspace-ID':workspaceId,'X-Idempotency-Key':idempotencyKey||`nexoffice-${actionType}-${externalRef}`};
  if(actionType==='document.analyze')return providerRequest('docwallet',`/api/internal/nexoffice/documents/${encodeURIComponent(externalRef)}/analyze`,'POST',{},headers);
  if(actionType==='document.signature_request'){
    const signature=payload?.signature||{};const parties=signature.parties||signature.signers||[];
    return providerRequest('docwallet',`/api/internal/nexoffice/documents/${encodeURIComponent(externalRef)}/signature-request`,'POST',{...signature,parties},headers);
  }
  const override=String(process.env.DOCWALLET_ACTION_PATH||'');if(override)return providerRequest('docwallet',override,'POST',payload,headers);
  return {ok:false,error:`docwallet_action_not_supported:${actionType}`};
}

async function dispatchStaff(payload:any,workspaceId?:string){
  if(!workspaceId)return {ok:false,error:'staff_workspace_required'};
  const path=String(process.env.STAFF_ACTION_PATH||'/.netlify/functions/nexoffice-assistant');
  const message=String(payload?.message||payload?.prompt||payload?.instruction||'').trim();
  if(!message)return {ok:false,error:'staff_message_required'};
  return providerRequest('staff',path,'POST',{...payload,message,context:{...(payload?.context||{}),workspace:{...(payload?.context?.workspace||{}),id:workspaceId}}},{'X-NexOffice-Workspace-ID':workspaceId});
}

async function dispatchSmartBots(payload:any,workspaceId?:string){
  if(!workspaceId)return {ok:false,error:'smartbots_workspace_required'};
  const actionId=String(payload?.commandActionId||'').trim();
  if(!actionId)return {ok:false,error:'smartbots_command_action_required'};
  const proof=(await query<any>(`select a.id,p.id approval_id,p.status approval_status,p.decided_by,exists(select 1 from audit_log l where l.workspace_id=a.workspace_id and l.subject_type='command_action' and l.subject_id=a.id::text and l.action='command.decision' and l.metadata->>'decision'='approved') audit_approved from command_actions a left join approval_requests p on p.id=a.approval_id where a.id=$1 and a.workspace_id=$2 limit 1`,[actionId,workspaceId]))[0];
  const humanApproved=Boolean((proof?.approval_status==='approved'&&proof?.decided_by)||proof?.audit_approved);
  if(!humanApproved)return {ok:false,error:'smartbots_human_approval_required'};
  const mapping=(await query<any>(`select external_account_ref,config from integrations where workspace_id=$1 and provider='smartbots' limit 1`,[workspaceId]))[0];
  const botId=String(mapping?.external_account_ref||mapping?.config?.botId||process.env.SMARTBOTS_BOT_ID||'').trim();
  if(!botId)return {ok:false,error:'smartbots_bot_not_connected'};
  const path=String(process.env.SMARTBOTS_SEND_PATH||'/api/internal/nexoffice/message');
  const correlationId=String(payload?.correlationId||actionId).trim();
  return providerRequest('smartbots',path,'POST',{
    botId,
    channel:payload?.channel||'whatsapp',
    recipient:payload?.recipient,
    message:payload?.message,
    contactName:payload?.contactName,
    correlationId,
    commandActionId:actionId,
    approvalId:proof?.approval_id||null,
    humanApproved:true,
    metadata:{ledgerEntryId:payload?.ledgerEntryId||null}
  },{'X-NexOffice-Workspace-ID':workspaceId,'Idempotency-Key':correlationId});
}

async function dispatchConfigurable(provider:Provider,path:string|undefined,payload:any){
  if(!path)return {ok:false,error:`${provider.toUpperCase()}_ACTION_PATH_not_configured`};
  return providerRequest(provider,path,'POST',payload);
}

async function providerRequest(provider:Provider,path:string,method:'GET'|'POST'|'PATCH'='POST',body?:unknown,extraHeaders:Record<string,string>={}){
  const c=CAPABILITIES[provider];const base=String(process.env[c.baseEnv]||'').replace(/\/$/,'');if(!base)return {ok:false,error:`${c.baseEnv}_not_configured`};
  const headers:Record<string,string>={accept:'application/json',...providerHeaders(provider),...extraHeaders};if(body!==undefined)headers['content-type']='application/json';
  try{const response=await fetch(`${base}/${String(path).replace(/^\//,'')}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(25000)});const text=await response.text();const result=(()=>{try{return JSON.parse(text)}catch{return {text:text.slice(0,2000)}}})();if(!response.ok)return {ok:false,error:(result as any)?.error||(result as any)?.message||`HTTP ${response.status}`,httpStatus:response.status,payload:result};return {ok:true,httpStatus:response.status,payload:result}}catch(error){return {ok:false,error:error instanceof Error?error.message:String(error)}}
}

function providerHeaders(provider:Provider):Record<string,string>{
  const key=providerKey(provider);if(!key)return {};
  if(provider==='nextgen')return {'X-API-Key':key};
  if(provider==='docwallet'||provider==='smartbots')return {'X-NexOffice-Key':key};
  const customName=String(process.env[`${provider.toUpperCase()}_AUTH_HEADER`]||'').trim();if(customName)return {[customName]:key};
  return {Authorization:`Bearer ${key}`};
}

async function createNextGenCharge(payload:any){
  const base=String(process.env.NEXTGEN_BASE_URL||'https://api.nextgenassets.com.br').replace(/\/$/,'');const apiKey=String(process.env.NEXTGEN_API_KEY||'');if(!apiKey)return {ok:false,error:'NEXTGEN_API_KEY_not_configured'};
  const amountMinor=Number(payload?.amountMinor||payload?.valueMinor||0);if(!Number.isFinite(amountMinor)||amountMinor<=0)return {ok:false,error:'invalid_amount'};
  const correlationID=String(payload?.correlationId||payload?.externalRef||`nexoffice-${Date.now()}`);
  const response=await fetch(`${base}/v1/admin/webhooks/woovi-test`,{method:'POST',headers:{'content-type':'application/json','X-API-Key':apiKey},body:JSON.stringify({totalCents:amountMinor,nextgenCents:0,partnerCents:0,correlationID,comment:payload?.description||'Cobrança NexOffice',customer:payload?.customer||undefined}),signal:AbortSignal.timeout(15000)});
  const result=await response.json().catch(()=>({}));if(!response.ok)return {ok:false,error:(result as any)?.error||`HTTP ${response.status}`,payload:result};return {ok:true,payload:result};
}
