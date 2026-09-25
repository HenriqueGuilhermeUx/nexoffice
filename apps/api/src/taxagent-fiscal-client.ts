import {ApiError} from './auth.js';
import {query} from './db.js';

export type TaxAgentMapping={status:string;companyId:string|null;environment:'test'|'production';config:Record<string,any>;secretRef:string|null};

export async function getTaxAgentMapping(workspaceId:string):Promise<TaxAgentMapping|null>{
  const row=(await query<any>(`select status,external_account_ref,config,secret_ref from integrations where workspace_id=$1 and provider='taxagent' limit 1`,[workspaceId]))[0];
  if(!row)return null;
  return {status:String(row.status||'configured'),companyId:row.external_account_ref?String(row.external_account_ref):null,environment:String(row.config?.environment||'test')==='production'?'production':'test',config:row.config||{},secretRef:row.secret_ref?String(row.secret_ref):null};
}

export function taxAgentPartnerConfigured():boolean{return Boolean(String(process.env.TAXAGENT_BASE_URL||'').trim()&&String(process.env.TAXAGENT_NEXOFFICE_KEY||'').trim())}

export async function taxAgentPartnerRequest<T=any>(path:string,method:'GET'|'POST'='GET',body?:unknown,extraHeaders:Record<string,string>={}):Promise<T>{
  const base=String(process.env.TAXAGENT_BASE_URL||'').trim().replace(/\/$/,'');const key=String(process.env.TAXAGENT_NEXOFFICE_KEY||'').trim();
  if(!base||!key)throw new ApiError(503,'taxagent_partner_not_configured','Integração fiscal TaxAgent ainda não está configurada no servidor.');
  const headers:Record<string,string>={accept:'application/json','x-taxagent-nexoffice-key':key,...extraHeaders};if(body!==undefined)headers['content-type']='application/json';
  let response:Response;try{response=await fetch(`${base}/${String(path).replace(/^\//,'')}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(25000)})}catch(error){throw new ApiError(502,'taxagent_unreachable',error instanceof Error?error.message:'TaxAgent indisponível.')}
  const text=await response.text();let payload:any=text;try{payload=text?JSON.parse(text):{}}catch{}
  if(!response.ok){const message=typeof payload==='string'?payload.slice(0,1200):String(payload?.message||payload?.error||`TaxAgent HTTP ${response.status}`);throw new ApiError(response.status>=500?502:response.status,'taxagent_upstream_error',message)}
  return payload as T;
}

export async function upsertPartnerMapping(workspaceId:string,companyId:string,environment:'test'|'production'){
  const config={environment,requiresHumanApproval:true,authMode:'nexoffice-partner'};
  const rows=await query<any>(`insert into integrations(workspace_id,provider,status,external_account_ref,capabilities,config,secret_ref,connected_at)
    values($1,'taxagent','connected',$2,$3,$4,'TAXAGENT_NEXOFFICE_KEY',now())
    on conflict(workspace_id,provider) do update set status='connected',external_account_ref=excluded.external_account_ref,capabilities=excluded.capabilities,config=excluded.config,secret_ref='TAXAGENT_NEXOFFICE_KEY',connected_at=coalesce(integrations.connected_at,now()),last_error=null,updated_at=now()
    returning *`,[workspaceId,companyId,['nfse','tax_engine','readiness','fiscal_ledger','idempotency','safety_gates','secure_onboarding'],JSON.stringify(config)]);
  return rows[0];
}
