import {query} from './db.js';

function taxAgentBase(){return String(process.env.TAXAGENT_BASE_URL||'').trim().replace(/\/$/,'')}
function invoiceBasePath(){return `/${String(process.env.TAXAGENT_INVOICE_PATH||'/v1/invoices').replace(/^\/+|\/+$/g,'')}`}

async function taxAgentCredential(workspaceId:string){
  const mapping=(await query<any>(`select external_account_ref,config,secret_ref from integrations where workspace_id=$1 and provider='taxagent' limit 1`,[workspaceId]))[0];
  if(!mapping)return {ok:false as const,error:'taxagent_not_connected'};
  const companyId=String(mapping.external_account_ref||'').trim();
  if(!companyId)return {ok:false as const,error:'taxagent_company_not_connected'};
  const secretRef=String(mapping.secret_ref||'').trim();
  const workspaceKey=secretRef?String(process.env[secretRef]||'').trim():'';
  const credential=workspaceKey||String(process.env.TAXAGENT_API_KEY||'').trim();
  if(!credential)return {ok:false as const,error:'taxagent_workspace_credential_not_configured'};
  return {ok:true as const,companyId,credential};
}

function authHeaders(credential:string):Record<string,string>{
  const custom=String(process.env.TAXAGENT_AUTH_HEADER||'').trim();
  return custom?{[custom]:credential}:{Authorization:`Bearer ${credential}`};
}

function operationalStatus(fiscalStatus:string,currentStatus:string){
  if(['paid','closed','cancelled'].includes(currentStatus))return currentStatus;
  if(fiscalStatus==='authorized')return currentStatus==='collection_ready'||currentStatus==='communication_pending'?currentStatus:'invoice_authorized';
  if(['rejected','cancelled'].includes(fiscalStatus))return 'attention';
  if(['queued','processing','retrying','created'].includes(fiscalStatus))return currentStatus==='collection_ready'||currentStatus==='communication_pending'?currentStatus:'invoice_queued';
  return currentStatus;
}

export async function discoverTaxAgentInvoiceRef(workspaceId:string,operation:any){
  if(operation.fiscal_external_ref)return String(operation.fiscal_external_ref);
  if(!operation.invoice_action_id)return null;
  const run=(await query<any>(`select output from agent_runs where workspace_id=$1 and action_id=$2 and status='succeeded' order by finished_at desc nulls last,created_at desc limit 1`,[workspaceId,operation.invoice_action_id]))[0];
  const invoiceId=String(run?.output?.payload?.id||'').trim();
  if(!invoiceId)return null;
  const initialStatus=String(run?.output?.payload?.status||'queued').trim()||'queued';
  await query(`update business_operations set fiscal_external_ref=$3,fiscal_status=$4,status=$5,metadata=metadata||$6::jsonb,updated_at=now() where id=$1 and workspace_id=$2`,[operation.id,workspaceId,invoiceId,initialStatus,operationalStatus(initialStatus,operation.status),JSON.stringify({taxAgentInvoiceCapturedAt:new Date().toISOString(),taxAgentEnvironment:run?.output?.payload?.environment||null})]);
  return invoiceId;
}

export async function syncTaxAgentOperation(workspaceId:string,operationId:string){
  let operation=(await query<any>(`select * from business_operations where id=$1 and workspace_id=$2`,[operationId,workspaceId]))[0];
  if(!operation)return {ok:false as const,error:'operation_not_found'};
  const invoiceId=await discoverTaxAgentInvoiceRef(workspaceId,operation);
  if(!invoiceId)return {ok:false as const,error:'taxagent_invoice_not_issued_yet'};
  const base=taxAgentBase();if(!base)return {ok:false as const,error:'taxagent_base_url_not_configured'};
  const credentials=await taxAgentCredential(workspaceId);if(!credentials.ok)return credentials;
  let response:Response;
  try{response=await fetch(`${base}${invoiceBasePath()}/${encodeURIComponent(invoiceId)}`,{headers:{accept:'application/json',...authHeaders(credentials.credential)},signal:AbortSignal.timeout(12000)})}
  catch{return {ok:false as const,error:'taxagent_unreachable'}}
  const payload=await response.json().catch(()=>({})) as any;
  if(!response.ok)return {ok:false as const,error:String(payload?.message||payload?.error||`taxagent_http_${response.status}`),httpStatus:response.status};
  if(String(payload?.company_id||'')&&String(payload.company_id)!==credentials.companyId)return {ok:false as const,error:'taxagent_company_mismatch'};
  const fiscalStatus=String(payload?.status||'unknown');
  const nextStatus=operationalStatus(fiscalStatus,operation.status);
  const summary={
    taxAgentInvoiceId:invoiceId,
    taxAgentStatus:fiscalStatus,
    taxAgentProvider:payload?.provider||null,
    taxAgentAccessKey:payload?.access_key||null,
    taxAgentProviderReference:payload?.provider_reference||null,
    taxAgentLastSyncedAt:new Date().toISOString(),
    taxAgentRejection:payload?.rejection?{code:payload.rejection.code||null,message:payload.rejection.message||null}:null,
  };
  const rows=await query<any>(`update business_operations set fiscal_external_ref=$3,fiscal_status=$4,status=$5,metadata=metadata||$6::jsonb,updated_at=now() where id=$1 and workspace_id=$2 returning *`,[operationId,workspaceId,invoiceId,fiscalStatus,nextStatus,JSON.stringify(summary)]);
  operation=rows[0];
  return {ok:true as const,operation,fiscal:{id:invoiceId,status:fiscalStatus,provider:payload?.provider||null,accessKey:payload?.access_key||null,providerReference:payload?.provider_reference||null,rejection:summary.taxAgentRejection},externalEffect:false};
}
