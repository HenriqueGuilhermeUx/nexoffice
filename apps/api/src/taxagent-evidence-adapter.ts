import {ApiError} from './auth.js';
import {query} from './db.js';

type Mapping={companyId:string;environment:'test'|'production';secretRef:string|null};

async function mapping(workspaceId:string):Promise<Mapping|null>{
  const row=(await query<any>(`select external_account_ref,config,secret_ref from integrations where workspace_id=$1 and provider='taxagent' and status in ('configured','connected') limit 1`,[workspaceId]))[0];
  if(!row?.external_account_ref)return null;
  return {companyId:String(row.external_account_ref),environment:String(row.config?.environment||'test')==='production'?'production':'test',secretRef:row.secret_ref?String(row.secret_ref):null};
}

function legacyKey(secretRef:string|null):string{
  if(secretRef){const value=String(process.env[secretRef]||'').trim();if(value)return value}
  return String(process.env.TAXAGENT_API_KEY||'').trim();
}

export async function taxAgentEvidenceContext(workspaceId:string){
  const map=await mapping(workspaceId);
  return {
    mapped:Boolean(map),
    companyId:map?.companyId||null,
    environment:map?.environment||'test',
    configured:Boolean(map&&String(process.env.TAXAGENT_BASE_URL||'').trim()&&(String(process.env.TAXAGENT_NEXOFFICE_KEY||'').trim()||legacyKey(map.secretRef))),
  };
}

export async function taxAgentEvidenceRequest<T=any>(workspaceId:string,suffix:string):Promise<T>{
  const map=await mapping(workspaceId);
  if(!map)throw new ApiError(409,'taxagent_not_connected','Conecte o Fiscal/TaxAgent a este workspace.');
  const base=String(process.env.TAXAGENT_BASE_URL||'').trim().replace(/\/$/,'');
  if(!base)throw new ApiError(503,'taxagent_not_configured','TaxAgent não está configurado no servidor.');
  const partnerKey=String(process.env.TAXAGENT_NEXOFFICE_KEY||'').trim();
  const normalized=String(suffix||'').startsWith('/')?String(suffix):`/${String(suffix||'')}`;
  const headers:Record<string,string>={accept:'application/json'};
  let url:string;
  if(partnerKey){
    headers['x-taxagent-nexoffice-key']=partnerKey;
    url=`${base}/v1/partners/nexoffice/companies/${encodeURIComponent(map.companyId)}/evidence${normalized==='/'?'':normalized}`;
  }else{
    const key=legacyKey(map.secretRef);
    if(!key)throw new ApiError(503,'taxagent_not_configured','Credencial TaxAgent não configurada no servidor.');
    headers.authorization=`Bearer ${key}`;
    url=`${base}/v1/portal/companies/${encodeURIComponent(map.companyId)}/evidence${normalized==='/'?'':normalized}`;
  }
  const join=url.includes('?')?'&':'?';url+=`${join}environment=${encodeURIComponent(map.environment)}`;
  let response:Response;
  try{response=await fetch(url,{headers,signal:AbortSignal.timeout(15000),cache:'no-store'})}
  catch(error){throw new ApiError(502,'taxagent_unreachable',error instanceof Error?error.message:'TaxAgent indisponível.')}
  const text=await response.text();let payload:any=text;try{payload=text?JSON.parse(text):{}}catch{}
  if(!response.ok){const message=typeof payload==='string'?payload.slice(0,800):String(payload?.message||payload?.error||`TaxAgent HTTP ${response.status}`);throw new ApiError(response.status>=500?502:response.status,'taxagent_evidence_error',message)}
  return payload as T;
}

export async function safeTaxAgentEvidence<T=any>(workspaceId:string,suffix:string):Promise<{status:'ok'|'not_configured'|'unavailable';data:T|null}>{
  try{return {status:'ok',data:await taxAgentEvidenceRequest<T>(workspaceId,suffix)}}catch(error){
    if(error instanceof ApiError&&(error.code==='taxagent_not_connected'||error.code==='taxagent_not_configured'))return {status:'not_configured',data:null};
    return {status:'unavailable',data:null};
  }
}
