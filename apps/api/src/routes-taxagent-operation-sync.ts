import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {ApiError,workspaceContext} from './auth.js';
import {query} from './db.js';
import {auditLog} from './events.js';

const uuid=z.string().uuid();
const preCollectionStatuses=new Set(['draft','contract_ready','invoice_pending','invoice_queued','invoice_authorized','attention']);

function safeBase(value:string){
  const raw=String(value||'').trim();if(!raw)return null;
  try{const url=new URL(raw);if(!['https:','http:'].includes(url.protocol))return null;return url.toString().replace(/\/$/,'')}catch{return null}
}

function providerHeaders(credential:string){
  const custom=String(process.env.TAXAGENT_AUTH_HEADER||'').trim();
  return custom?{[custom]:credential}:{Authorization:`Bearer ${credential}`};
}

async function taxAgentConfig(workspaceId:string){
  const mapping=(await query<any>(`select external_account_ref,config,secret_ref from integrations where workspace_id=$1 and provider='taxagent' limit 1`,[workspaceId]))[0];
  const companyId=String(mapping?.external_account_ref||'').trim();
  const secretRef=String(mapping?.secret_ref||'').trim();
  const credential=(secretRef?String(process.env[secretRef]||''):'')||String(process.env.TAXAGENT_API_KEY||'');
  const base=safeBase(String(process.env.TAXAGENT_BASE_URL||''));
  if(!base||!credential||!companyId)throw new ApiError(409,'taxagent_not_connected','Conecte/configure o TaxAgent para este workspace antes de sincronizar a nota.');
  return{base,credential,companyId};
}

async function recoverExternalRef(workspaceId:string,operation:any){
  if(operation.fiscal_external_ref)return String(operation.fiscal_external_ref);
  if(!operation.invoice_action_id)return null;
  const run=(await query<any>(`select output from agent_runs where workspace_id=$1 and action_id=$2 and status='succeeded' order by finished_at desc nulls last,created_at desc limit 1`,[workspaceId,operation.invoice_action_id]))[0];
  const ref=String(run?.output?.payload?.id||run?.output?.payload?.invoice_id||'').trim();
  if(!ref)return null;
  await query(`update business_operations set fiscal_external_ref=$3,fiscal_provider='taxagent',fiscal_status=coalesce(fiscal_status,$4),updated_at=now() where id=$1 and workspace_id=$2`,[operation.id,workspaceId,ref,String(run?.output?.payload?.status||'queued')]);
  return ref;
}

function nextOperationStatus(current:string,fiscalStatus:string){
  if(!preCollectionStatuses.has(current))return current;
  if(fiscalStatus==='authorized')return 'invoice_authorized';
  if(fiscalStatus==='rejected'||fiscalStatus==='cancelled'||fiscalStatus==='cancellation_failed')return 'attention';
  if(['queued','processing','retrying','cancelling'].includes(fiscalStatus))return 'invoice_queued';
  return current;
}

export async function registerTaxAgentOperationSyncRoutes(app:FastifyInstance){
  app.post('/v1/business-operations/:id/sync-invoice',async req=>{
    const ctx=await workspaceContext(req,'workspace.write');
    const id=uuid.parse((req.params as any).id);
    const operation=(await query<any>(`select * from business_operations where id=$1 and workspace_id=$2`,[id,ctx.workspaceId]))[0];
    if(!operation)throw new ApiError(404,'not_found','Operação Comercial não encontrada.');
    if(!operation.invoice_action_id)throw new ApiError(409,'invoice_not_prepared','Prepare a emissão fiscal antes de sincronizar.');
    const externalRef=await recoverExternalRef(ctx.workspaceId,operation);
    if(!externalRef)throw new ApiError(409,'invoice_not_dispatched','A emissão ainda não retornou um ID do TaxAgent. Aprove/executa a ação fiscal e tente novamente.');
    const cfg=await taxAgentConfig(ctx.workspaceId);
    let response:Response;
    try{response=await fetch(`${cfg.base}/invoices/${encodeURIComponent(externalRef)}`,{headers:{accept:'application/json',...providerHeaders(cfg.credential)},signal:AbortSignal.timeout(12_000)})}
    catch{throw new ApiError(502,'taxagent_unreachable','TaxAgent indisponível neste momento.');}
    const payload=await response.json().catch(()=>({})) as any;
    if(!response.ok){
      if(response.status===404)throw new ApiError(409,'taxagent_invoice_not_found','A referência fiscal ainda não está disponível no TaxAgent.');
      if(response.status===401||response.status===403)throw new ApiError(502,'taxagent_bridge_unauthorized','TaxAgent recusou a credencial configurada para este workspace.');
      throw new ApiError(502,'taxagent_sync_failed',String(payload?.message||payload?.error||'Não foi possível sincronizar a nota.'));
    }
    if(payload?.company_id&&String(payload.company_id)!==cfg.companyId)throw new ApiError(409,'taxagent_company_mismatch','A nota retornada não pertence à empresa TaxAgent vinculada a este workspace.');
    const fiscalStatus=String(payload?.status||'unknown').toLowerCase();
    const nextStatus=nextOperationStatus(String(operation.status),fiscalStatus);
    const rejection=payload?.rejection&&typeof payload.rejection==='object'?payload.rejection:{};
    const metadata={
      fiscalSyncedAt:new Date().toISOString(),
      fiscalProvider:String(payload?.provider||payload?.provider_name||'taxagent'),
      fiscalDocumentAvailable:Boolean(payload?.access_key),
      ...(rejection?.code?{fiscalErrorCode:String(rejection.code).slice(0,120)}:{}),
      ...(rejection?.message?{fiscalErrorMessage:String(rejection.message).slice(0,500)}:{})
    };
    const updated=(await query<any>(`update business_operations set fiscal_external_ref=$3,fiscal_provider='taxagent',fiscal_status=$4,status=$5,metadata=metadata||$6::jsonb,updated_at=now() where id=$1 and workspace_id=$2 returning *`,[id,ctx.workspaceId,externalRef,fiscalStatus,nextStatus,JSON.stringify(metadata)]))[0];
    await auditLog(ctx,'business_operation.invoice_synced','business_operation',id,operation,{fiscalExternalRef:externalRef,fiscalStatus,nextStatus,documentAvailable:Boolean(payload?.access_key),externalEffect:false});
    return {operation:updated,fiscal:{id:externalRef,status:fiscalStatus,environment:payload?.environment||null,provider:metadata.fiscalProvider,documentAvailable:metadata.fiscalDocumentAvailable,rejection:rejection?.code?{code:rejection.code,message:rejection.message||null}:null},externalEffect:false};
  });
}
