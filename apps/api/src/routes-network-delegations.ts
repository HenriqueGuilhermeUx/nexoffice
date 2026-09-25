import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {ApiError,workspaceContext} from './auth.js';
import {query} from './db.js';
import {auditLog} from './events.js';

const uuid=z.string().uuid();
const scope=z.enum(['contact_read','deal_read','operation_read','document_status_read','fiscal_status_read','finance_status_read']);
const grantSchema=z.object({scopes:z.array(scope).max(6).default([]),expiresInDays:z.number().int().min(1).max(180).default(30)});

function uniq(values:string[]){return [...new Set(values)]}

export async function registerNetworkDelegationRoutes(app:FastifyInstance){
  app.get('/v1/network/delegations',async req=>{
    const ctx=await workspaceContext(req,'workspace.read');
    return query<any>(`select d.id,d.request_id,d.requester_workspace_id,d.provider_workspace_id,d.scopes,d.status,d.expires_at,d.revoked_at,d.created_at,d.updated_at,r.title request_title,r.status request_status,pp.display_name provider_name,rw.name requester_name,
      case when d.status='revoked' then 'revoked' when d.expires_at<=now() then 'expired' when r.status not in ('accepted','in_progress') then 'inactive' else 'active' end effective_status
      from provider_delegations d
      join provider_requests r on r.id=d.request_id
      join workspaces rw on rw.id=d.requester_workspace_id
      left join provider_profiles pp on pp.workspace_id=d.provider_workspace_id
      where d.requester_workspace_id=$1 or d.provider_workspace_id=$1
      order by d.updated_at desc limit 300`,[ctx.workspaceId]);
  });

  app.post('/v1/network/requests/:id/delegation',async req=>{
    const ctx=await workspaceContext(req,'workspace.write'),requestId=uuid.parse((req.params as any).id),input=grantSchema.parse(req.body||{});
    const request=(await query<any>(`select id,requester_workspace_id,provider_workspace_id,status from provider_requests where id=$1 and requester_workspace_id=$2`,[requestId,ctx.workspaceId]))[0];
    if(!request)throw new ApiError(404,'request_not_found','Solicitação da Rede não encontrada neste workspace.');
    if(!['accepted','in_progress'].includes(String(request.status)))throw new ApiError(409,'active_engagement_required','O acesso só pode ser delegado depois que o prestador aceitar o trabalho e enquanto ele estiver ativo.');
    const scopes=uniq(input.scopes),expiresAt=new Date(Date.now()+input.expiresInDays*86400000).toISOString();
    const before=(await query<any>(`select * from provider_delegations where request_id=$1`,[requestId]))[0]||null;
    const rows=await query<any>(`insert into provider_delegations(request_id,requester_workspace_id,provider_workspace_id,granted_by,scopes,status,expires_at) values($1,$2,$3,$4,$5,'active',$6) on conflict(request_id) do update set granted_by=excluded.granted_by,scopes=excluded.scopes,status='active',expires_at=excluded.expires_at,revoked_at=null,updated_at=now() returning *`,[requestId,ctx.workspaceId,request.provider_workspace_id,ctx.user.id,scopes,expiresAt]);
    await auditLog(ctx,'network.delegation.granted','provider_delegation',rows[0].id,before,{requestId,providerWorkspaceId:request.provider_workspace_id,scopes,expiresAt,readOnly:true});
    return {...rows[0],readOnly:true,broadWorkspaceMembershipGranted:false};
  });

  app.post('/v1/network/delegations/:id/revoke',async req=>{
    const ctx=await workspaceContext(req,'workspace.write'),id=uuid.parse((req.params as any).id);
    const before=(await query<any>(`select * from provider_delegations where id=$1 and requester_workspace_id=$2`,[id,ctx.workspaceId]))[0];if(!before)throw new ApiError(404,'delegation_not_found','Delegação não encontrada.');
    const rows=await query<any>(`update provider_delegations set status='revoked',revoked_at=now(),updated_at=now() where id=$1 and requester_workspace_id=$2 returning *`,[id,ctx.workspaceId]);
    await auditLog(ctx,'network.delegation.revoked','provider_delegation',id,before,{status:'revoked',revokedAt:rows[0].revoked_at});return rows[0];
  });

  app.get('/v1/network/delegations/:id/context',async req=>{
    const ctx=await workspaceContext(req,'workspace.read'),id=uuid.parse((req.params as any).id);
    const delegation=(await query<any>(`select d.*,r.title request_title,r.need_summary,r.status request_status,r.contact_id,r.document_ref_id,r.service_id,r.budget_minor,r.currency from provider_delegations d join provider_requests r on r.id=d.request_id where d.id=$1 and d.provider_workspace_id=$2 and d.status='active' and d.expires_at>now() and r.status in ('accepted','in_progress')`,[id,ctx.workspaceId]))[0];
    if(!delegation)throw new ApiError(404,'delegation_not_active','Delegação não encontrada, expirada, revogada ou fora de um trabalho ativo.');
    const scopes=new Set<string>(Array.isArray(delegation.scopes)?delegation.scopes:[]),clientWorkspaceId=String(delegation.requester_workspace_id);
    const operations=await query<any>(`select id,deal_id,document_ref_id,ledger_entry_id,title,description,status,due_at,fiscal_status,updated_at from business_operations where workspace_id=$1 and provider_request_id=$2 order by updated_at desc limit 5`,[clientWorkspaceId,delegation.request_id]);
    const primaryOperation=operations[0]||null;
    const context:any={
      request:{id:delegation.request_id,title:delegation.request_title,needSummary:delegation.need_summary,status:delegation.request_status,serviceId:delegation.service_id||null},
      grantedScopes:[...scopes],
      expiresAt:delegation.expires_at,
      readOnly:true
    };

    if(scopes.has('contact_read')&&delegation.contact_id){
      context.contact=(await query<any>(`select id,name,email,phone,company_name from crm_contacts where id=$1 and workspace_id=$2`,[delegation.contact_id,clientWorkspaceId]))[0]||null;
    }
    if(scopes.has('deal_read')&&primaryOperation?.deal_id){
      context.deal=(await query<any>(`select id,title,stage,next_action,expected_close_at,source,updated_at from crm_deals where id=$1 and workspace_id=$2`,[primaryOperation.deal_id,clientWorkspaceId]))[0]||null;
    }
    if(scopes.has('operation_read')){
      context.operations=operations.map((o:any)=>({id:o.id,title:o.title,description:o.description,status:o.status,dueAt:o.due_at,updatedAt:o.updated_at}));
    }
    if(scopes.has('document_status_read')){
      const documentIds=uniq([delegation.document_ref_id,...operations.map((o:any)=>o.document_ref_id)].filter(Boolean).map(String));
      context.documents=documentIds.length?await query<any>(`select id,title,status,document_type,signature_status,provider,updated_at from document_refs where workspace_id=$1 and id=any($2::uuid[]) order by updated_at desc`,[clientWorkspaceId,documentIds]):[];
    }
    if(scopes.has('fiscal_status_read')){
      context.fiscal=operations.map((o:any)=>({operationId:o.id,status:o.fiscal_status||null,operationalStatus:o.status,updatedAt:o.updated_at}));
    }
    if(scopes.has('finance_status_read')){
      const ledgerIds=uniq(operations.map((o:any)=>o.ledger_entry_id).filter(Boolean).map(String));
      context.finance=ledgerIds.length?await query<any>(`select id,status,amount_minor,currency,due_at,paid_at,updated_at from ledger_entries where workspace_id=$1 and id=any($2::uuid[]) order by updated_at desc`,[clientWorkspaceId,ledgerIds]):[];
    }

    await query(`insert into audit_log(workspace_id,actor_type,actor_ref,action,subject_type,subject_id,metadata) values($1,'workspace',$2,'network.delegation.context_read','provider_delegation',$3,$4)`,[clientWorkspaceId,ctx.workspaceId,id,JSON.stringify({requestId:delegation.request_id,scopes:[...scopes],readOnly:true})]);
    return {delegationId:id,requestId:delegation.request_id,clientWorkspaceId,context,privacy:{broadWorkspaceAccess:false,pixSecretExposed:false,rawDocumentContentExposed:false,fiscalPayloadExposed:false,auditLogged:true}};
  });
}
