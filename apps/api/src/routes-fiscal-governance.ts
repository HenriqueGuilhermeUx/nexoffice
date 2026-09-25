import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {ApiError,workspaceContext} from './auth.js';
import {query} from './db.js';
import {auditLog,emitBusinessEvent} from './events.js';
import {getTaxAgentMapping,taxAgentPartnerConfigured,taxAgentPartnerRequest} from './taxagent-fiscal-client.js';

const Cancellation=z.object({reason_code:z.enum(['1','2','9']),reason:z.string().trim().min(5).max(255)});

export async function registerFiscalGovernanceRoutes(app:FastifyInstance){
  app.get('/v1/fiscal/bridge-health',async req=>{
    const ctx=await workspaceContext(req,'finance.read');
    const mapping=await getTaxAgentMapping(ctx.workspaceId);
    if(!taxAgentPartnerConfigured())return {provider:'taxagent',ok:false,status:'not_configured',mapped:Boolean(mapping?.companyId),companyId:mapping?.companyId||null,environment:mapping?.environment||'test',secretsReturned:false};
    if(!mapping?.companyId)return {provider:'taxagent',ok:false,status:'not_mapped',mapped:false,companyId:null,environment:'test',secretsReturned:false};
    try{
      const journey=await taxAgentPartnerRequest<any>(`/v1/partners/nexoffice/companies/${encodeURIComponent(mapping.companyId)}/fiscal?environment=${mapping.environment}`);
      await query(`update integrations set status='connected',last_health_at=now(),last_health_status='connected',last_error=null,updated_at=now() where workspace_id=$1 and provider='taxagent'`,[ctx.workspaceId]);
      return {provider:'taxagent',ok:true,status:'connected',mapped:true,companyId:mapping.companyId,environment:mapping.environment,fiscalStatus:journey?.fiscal_status||null,onboardingStatus:journey?.onboarding_status||null,route:journey?.route?.resolved_route||null,fiscalProvider:journey?.route?.resolved_provider||null,checkedAt:new Date().toISOString(),secretsReturned:false};
    }catch(error){
      const message=error instanceof Error?error.message:String(error);
      await query(`update integrations set status='error',last_health_at=now(),last_health_status='error',last_error=$2,updated_at=now() where workspace_id=$1 and provider='taxagent'`,[ctx.workspaceId,message.slice(0,500)]).catch(()=>null);
      return {provider:'taxagent',ok:false,status:'error',mapped:true,companyId:mapping.companyId,environment:mapping.environment,error:message.slice(0,500),checkedAt:new Date().toISOString(),secretsReturned:false};
    }
  });

  app.post('/v1/fiscal/invoices/:invoiceId/cancel/prepare',async req=>{
    const ctx=await workspaceContext(req,'finance.write');
    const mapping=await getTaxAgentMapping(ctx.workspaceId);
    if(!mapping?.companyId)throw new ApiError(409,'taxagent_not_connected','Ative o Fiscal para este workspace antes de preparar um cancelamento.');
    const invoiceId=String((req.params as any).invoiceId||'').trim();
    if(!invoiceId||invoiceId.length>160)throw new ApiError(400,'invalid_invoice_id','Identificador da NFS-e inválido.');
    const input=Cancellation.parse(req.body);
    const payload={companyId:mapping.companyId,environment:mapping.environment,invoiceId,reasonCode:input.reason_code,reason:input.reason};
    const emitted=await emitBusinessEvent(ctx.workspaceId,'invoice.cancel','nexoffice.fiscal','workspace',ctx.workspaceId,payload);
    await auditLog(ctx,'fiscal.invoice.cancellation_prepared','workspace',ctx.workspaceId,null,{companyId:mapping.companyId,invoiceId,reasonCode:input.reason_code},{externalEffect:false,approvalRequired:true});
    return {...emitted,prepared:true,externalEffect:false,approvalRequired:true};
  });

  app.get('/v1/fiscal/cancellations',async req=>{
    const ctx=await workspaceContext(req,'finance.read');
    return query<any>(`select id,title,summary,status,autonomy,approval_id,primary_action,created_at,updated_at,metadata from command_actions where workspace_id=$1 and primary_action->>'type'='invoice.cancel' order by created_at desc limit 100`,[ctx.workspaceId]);
  });
}
