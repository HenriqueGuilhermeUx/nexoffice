import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {ApiError,workspaceContext} from './auth.js';
import {query,transaction} from './db.js';
import {auditLog} from './events.js';

const uuid=z.string().uuid();
const createOperationInput=z.object({
  dealId:uuid.optional().nullable(),
  documentRefId:uuid.optional().nullable(),
  title:z.string().trim().min(2).max(200).optional(),
  description:z.string().trim().min(3).max(2500).optional(),
  amountMinor:z.number().int().min(0),
  dueAt:z.string().datetime().optional().nullable()
});

const activeWorkStatuses=['accepted','in_progress','completed'];

export async function registerNetworkWorkExecutionRoutes(app:FastifyInstance){
  app.post('/v1/network/requests/:id/operation',async req=>{
    const ctx=await workspaceContext(req,'workspace.write');
    const requestId=uuid.parse((req.params as any).id),input=createOperationInput.parse(req.body||{});
    const request=(await query<any>(`select r.*,s.title service_title from provider_requests r left join provider_services s on s.id=r.service_id where r.id=$1 and r.requester_workspace_id=$2`,[requestId,ctx.workspaceId]))[0];
    if(!request)throw new ApiError(404,'request_not_found','Solicitação da Rede não encontrada neste workspace.');
    if(!activeWorkStatuses.includes(String(request.status)))throw new ApiError(409,'active_work_required','A Operação Comercial só pode ser criada depois que o prestador aceitar o trabalho.');
    if(!request.contact_id)throw new ApiError(409,'request_contact_required','Vincule um contato ao trabalho antes de criar a Operação Comercial.');
    const existing=(await query<any>(`select * from business_operations where workspace_id=$1 and provider_request_id=$2 order by created_at asc limit 1`,[ctx.workspaceId,requestId]))[0];
    if(existing)return {created:false,reused:true,operation:existing,externalEffect:false};
    if(!((await query<any>(`select id from crm_contacts where id=$1 and workspace_id=$2`,[request.contact_id,ctx.workspaceId]))[0]))throw new ApiError(409,'request_contact_unavailable','O contato vinculado ao trabalho não está disponível neste workspace.');
    if(input.dealId&&!((await query<any>(`select id from crm_deals where id=$1 and workspace_id=$2`,[input.dealId,ctx.workspaceId]))[0]))throw new ApiError(404,'deal_not_found','Oportunidade não encontrada neste workspace.');
    const requestedDocumentId=input.documentRefId||request.document_ref_id||null;
    if(requestedDocumentId&&!((await query<any>(`select id from document_refs where id=$1 and workspace_id=$2`,[requestedDocumentId,ctx.workspaceId]))[0]))throw new ApiError(404,'document_not_found','Contrato/documento não encontrado neste workspace.');
    const title=input.title||request.service_title||request.title;
    const description=input.description||request.need_summary;
    const status=requestedDocumentId?'contract_ready':'draft';
    const rows=await query<any>(`insert into business_operations(workspace_id,contact_id,deal_id,provider_request_id,document_ref_id,title,description,amount_minor,due_at,status,metadata) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,[ctx.workspaceId,request.contact_id,input.dealId||null,requestId,requestedDocumentId,title,description,input.amountMinor,input.dueAt||null,status,JSON.stringify({source:'network_provider_request',networkRequestId:requestId,contractEngine:'docwallet',fiscalEngine:'taxagent',collectionMode:'owner_pix',communicationEngine:'smartbots'})]);
    await auditLog(ctx,'network.request.operation_created','business_operation',rows[0].id,null,{providerRequestId:requestId,documentLinked:Boolean(requestedDocumentId),externalEffect:false});
    return {created:true,reused:false,operation:rows[0],externalEffect:false};
  });

  app.post('/v1/network/requests/:id/link-operation',async req=>{
    const ctx=await workspaceContext(req,'workspace.write');
    const requestId=uuid.parse((req.params as any).id),input=z.object({operationId:uuid}).parse(req.body||{});
    const request=(await query<any>(`select * from provider_requests where id=$1 and requester_workspace_id=$2`,[requestId,ctx.workspaceId]))[0];
    if(!request)throw new ApiError(404,'request_not_found','Solicitação da Rede não encontrada neste workspace.');
    if(!activeWorkStatuses.includes(String(request.status)))throw new ApiError(409,'active_work_required','A Operação Comercial só pode ser vinculada depois que o prestador aceitar o trabalho.');
    const before=(await query<any>(`select * from business_operations where id=$1 and workspace_id=$2`,[input.operationId,ctx.workspaceId]))[0];
    if(!before)throw new ApiError(404,'operation_not_found','Operação Comercial não encontrada neste workspace.');
    if(before.provider_request_id&&String(before.provider_request_id)!==requestId)throw new ApiError(409,'operation_already_linked','Esta Operação Comercial já pertence a outro trabalho da Rede.');
    const linked=await transaction(async client=>{
      const operation=(await client.query(`update business_operations set provider_request_id=$3,metadata=metadata||$4::jsonb,updated_at=now() where id=$1 and workspace_id=$2 returning *`,[input.operationId,ctx.workspaceId,requestId,JSON.stringify({source:'network_provider_request',networkRequestId:requestId})])).rows[0];
      if(!request.document_ref_id&&operation.document_ref_id)await client.query(`update provider_requests set document_ref_id=$3,updated_at=now() where id=$1 and requester_workspace_id=$2`,[requestId,ctx.workspaceId,operation.document_ref_id]);
      return operation;
    });
    await auditLog(ctx,'network.request.operation_linked','business_operation',input.operationId,before,{providerRequestId:requestId,externalEffect:false});
    return {operation:linked,externalEffect:false};
  });

  app.get('/v1/network/requests/:id/lineage',async req=>{
    const ctx=await workspaceContext(req,'workspace.read');
    const requestId=uuid.parse((req.params as any).id);
    const request=(await query<any>(`select id,requester_workspace_id,provider_workspace_id,status,document_ref_id from provider_requests where id=$1 and (requester_workspace_id=$2 or provider_workspace_id=$2)`,[requestId,ctx.workspaceId]))[0];
    if(!request)throw new ApiError(404,'request_not_found','Trabalho da Rede não encontrado.');
    const operation=(await query<any>(`select id,status,due_at,document_ref_id,fiscal_status,invoice_action_id,ledger_entry_id,communication_action_id,updated_at from business_operations where workspace_id=$1 and provider_request_id=$2 order by created_at asc limit 1`,[request.requester_workspace_id,requestId]))[0]||null;
    const documentId=operation?.document_ref_id||request.document_ref_id||null;
    const document=documentId?(await query<any>(`select status,signature_status,updated_at from document_refs where id=$1 and workspace_id=$2`,[documentId,request.requester_workspace_id]))[0]||null:null;
    const ledger=operation?.ledger_entry_id?(await query<any>(`select status,due_at,paid_at,updated_at from ledger_entries where id=$1 and workspace_id=$2`,[operation.ledger_entry_id,request.requester_workspace_id]))[0]||null:null;
    const communication=operation?.communication_action_id?(await query<any>(`select status,updated_at from command_actions where id=$1 and workspace_id=$2`,[operation.communication_action_id,request.requester_workspace_id]))[0]||null:null;
    const outcomeCount=Number((await query<any>(`select count(*)::int count from provider_outcomes where request_id=$1`,[requestId]))[0]?.count||0);
    const delegation=(await query<any>(`select status,expires_at,scopes,case when status='revoked' then 'revoked' when expires_at<=now() then 'expired' when $2 not in ('accepted','in_progress') then 'inactive' else 'active' end effective_status from provider_delegations where request_id=$1`,[requestId,request.status]))[0]||null;
    const steps={
      request:{done:true,status:request.status},
      operation:{done:Boolean(operation),status:operation?.status||null},
      contract:{done:Boolean(document),status:document?.status||null,signatureStatus:document?.signature_status||null},
      fiscal:{done:operation?.fiscal_status==='authorized',status:operation?.fiscal_status||null},
      collection:{done:Boolean(ledger),status:ledger?.status||null},
      communication:{done:Boolean(communication),status:communication?.status||null},
      payment:{done:ledger?.status==='paid',status:ledger?.status||null},
      outcome:{done:outcomeCount>0,count:outcomeCount}
    };
    const nextAction=!operation?'create_operation':!document?'formalize_contract':operation.fiscal_status!=='authorized'?'prepare_or_sync_invoice':!ledger?'prepare_collection':ledger.status!=='paid'?'collect_or_follow_up':outcomeCount===0&&request.status==='completed'?'record_outcome':'review_work';
    return {requestId,requestStatus:request.status,steps,nextAction,delegatedAccess:delegation?{status:delegation.effective_status,expiresAt:delegation.expires_at,scopeCount:Array.isArray(delegation.scopes)?delegation.scopes.length:0}:null,privacy:{amountExposed:false,pixSecretExposed:false,documentContentExposed:false,fiscalExternalRefExposed:false,providerWorkspaceMembershipGranted:false},externalEffect:false};
  });
}
