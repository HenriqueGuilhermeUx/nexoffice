import {query} from './db.js';

export const CAPABILITIES = {
  docwallet: {label:'DocWallet', baseEnv:'DOCWALLET_BASE_URL', keyEnv:'DOCWALLET_API_KEY', health:'/api/health', capabilities:['documents','ocr','signature','approval']},
  staff: {label:'Staff', baseEnv:'STAFF_BASE_URL', keyEnv:'STAFF_API_KEY', health:'/health', capabilities:['voice','conversation','memory','agenda']},
  smartbots: {label:'SmartBots', baseEnv:'SMARTBOTS_BASE_URL', keyEnv:'SMARTBOTS_API_KEY', health:'/health', capabilities:['whatsapp','service','qualification','follow-up']},
  nextgen: {label:'NextGen', baseEnv:'NEXTGEN_BASE_URL', keyEnv:'NEXTGEN_API_KEY', health:'/health', capabilities:['pix','charges','reconciliation']},
  modo: {label:'MODO', baseEnv:'MODO_BASE_URL', keyEnv:'MODO_API_KEY', health:'/health', capabilities:['growth','content','campaigns','intelligence']},
  taxagent: {label:'TaxAgent', baseEnv:'TAXAGENT_BASE_URL', keyEnv:'TAXAGENT_API_KEY', health:'/health', capabilities:['nfse','tax']}
} as const;

export type Provider = keyof typeof CAPABILITIES;

export function providerCatalog(){
  return Object.entries(CAPABILITIES).map(([provider,c])=>({
    provider,label:c.label,capabilities:[...c.capabilities],baseUrlConfigured:Boolean(process.env[c.baseEnv]),credentialConfigured:Boolean(process.env[c.keyEnv])
  }));
}

export async function probeProvider(workspaceId:string,provider:Provider){
  const c=CAPABILITIES[provider];
  const base=String(process.env[c.baseEnv]||'').replace(/\/$/,'');
  if(!base)return {provider,ok:false,status:'not_configured',error:`${c.baseEnv} não configurada`};
  const key=String(process.env[c.keyEnv]||'');
  const headers:Record<string,string>={accept:'application/json'};
  if(key){
    if(provider==='nextgen')headers['X-API-Key']=key;
    else headers.authorization=`Bearer ${key}`;
  }
  try{
    const response=await fetch(`${base}${c.health}`,{headers,signal:AbortSignal.timeout(8000)});
    const text=await response.text();
    const payload=(()=>{try{return JSON.parse(text)}catch{return {text:text.slice(0,500)}}})();
    const ok=response.ok;
    await upsertIntegrationHealth(workspaceId,provider,ok?'connected':'error',ok?null:`HTTP ${response.status}`);
    return {provider,ok,status:ok?'connected':'error',httpStatus:response.status,payload};
  }catch(error){
    const message=error instanceof Error?error.message:String(error);
    await upsertIntegrationHealth(workspaceId,provider,'error',message);
    return {provider,ok:false,status:'error',error:message};
  }
}

async function upsertIntegrationHealth(workspaceId:string,provider:string,status:string,error:string|null){
  const capabilities=(CAPABILITIES as any)[provider]?.capabilities||[];
  await query(`insert into integrations(workspace_id,provider,status,capabilities,last_health_at,last_health_status,last_error)
    values($1,$2,$3,$4,now(),$3,$5)
    on conflict(workspace_id,provider) do update set status=excluded.status,capabilities=excluded.capabilities,last_health_at=now(),last_health_status=excluded.last_health_status,last_error=excluded.last_error,updated_at=now()`,
    [workspaceId,provider,status,capabilities,error]);
}

export function routeForAction(actionType:string):string|null{
  if(actionType.startsWith('message.send'))return 'smartbots.message.send';
  if(actionType.startsWith('payment.charge')||actionType.startsWith('collection.charge'))return 'nextgen.charge.create';
  if(actionType.startsWith('document.'))return 'docwallet.document.action';
  if(actionType.startsWith('campaign.')||actionType.startsWith('growth.'))return 'modo.growth.action';
  if(actionType.startsWith('voice.')||actionType.startsWith('assistant.'))return 'staff.assistant.action';
  if(actionType.startsWith('invoice.issue'))return 'taxagent.invoice.issue';
  return null;
}

export async function dispatchOutbox(topic:string,payload:any){
  if(String(process.env.NEXOFFICE_EXTERNAL_ACTIONS||'false')!=='true')return {ok:true,dryRun:true,topic};
  if(topic==='nextgen.charge.create')return createNextGenCharge(payload);
  return {ok:false,error:`adapter_not_ready:${topic}`};
}

async function createNextGenCharge(payload:any){
  const base=String(process.env.NEXTGEN_BASE_URL||'https://api.nextgenassets.com.br').replace(/\/$/,'');
  const apiKey=String(process.env.NEXTGEN_API_KEY||'');
  if(!apiKey)return {ok:false,error:'NEXTGEN_API_KEY_not_configured'};
  const amountMinor=Number(payload?.amountMinor||payload?.valueMinor||0);
  if(!Number.isFinite(amountMinor)||amountMinor<=0)return {ok:false,error:'invalid_amount'};
  const correlationID=String(payload?.correlationId||payload?.externalRef||`nexoffice-${Date.now()}`);
  const response=await fetch(`${base}/v1/admin/webhooks/woovi-test`,{
    method:'POST',headers:{'content-type':'application/json','X-API-Key':apiKey},
    body:JSON.stringify({totalCents:amountMinor,nextgenCents:0,partnerCents:0,correlationID,comment:payload?.description||'Cobrança NexOffice',customer:payload?.customer||undefined}),
    signal:AbortSignal.timeout(15000)
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok)return {ok:false,error:(result as any)?.error||`HTTP ${response.status}`,payload:result};
  return {ok:true,payload:result};
}
