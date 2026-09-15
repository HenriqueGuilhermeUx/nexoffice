import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {workspaceContext,ApiError} from './auth.js';
import {query} from './db.js';
import {auditLog,emitBusinessEvent} from './events.js';

const SecretRef=z.string().trim().regex(/^[A-Z][A-Z0-9_]{2,100}$/,'Use apenas o nome de uma variável server-side, nunca a API key.');
const Customer=z.object({taxId:z.string().trim().min(5).max(32),name:z.string().trim().min(1).max(200),cityCode:z.string().regex(/^\d{7}$/)});
const Service=z.object({
  description:z.string().trim().min(1).max(2000),
  amount:z.number().positive(),
  nationalServiceCode:z.string().trim().max(40).optional(),
  serviceLocationCityCode:z.string().regex(/^\d{7}$/).optional(),
  issTaxation:z.enum(['1','2','3','4']).optional(),
  issWithholding:z.enum(['1','2','3']).optional(),
  issRate:z.number().min(0).max(9.99).optional(),
  finalConsumption:z.enum(['0','1']).optional(),
  operationIndicator:z.string().trim().max(60).optional(),
  taxSituation:z.string().trim().max(60).optional(),
  taxClassification:z.string().trim().max(120).optional()
});

export async function registerFiscalRoutes(app:FastifyInstance){
  app.get('/v1/integrations/taxagent',async req=>{
    const ctx=await workspaceContext(req,'integrations.read');
    const row=(await query<any>(`select provider,status,external_account_ref,capabilities,config,secret_ref,connected_at,last_health_at,last_health_status,last_error,updated_at from integrations where workspace_id=$1 and provider='taxagent' limit 1`,[ctx.workspaceId]))[0]||null;
    if(!row)return {provider:'taxagent',status:'disconnected',companyId:null,environment:'test',secretConfigured:false};
    return {...row,companyId:row.external_account_ref||null,environment:row.config?.environment||'test',secretConfigured:Boolean(row.secret_ref)};
  });

  app.put('/v1/integrations/taxagent',async req=>{
    const ctx=await workspaceContext(req,'integrations.manage');
    const input=z.object({companyId:z.string().trim().min(3).max(160),environment:z.enum(['test','production']).default('test'),secretRef:SecretRef}).parse(req.body);
    if(/^ta_(test|live)_/i.test(input.secretRef))throw new ApiError(400,'secret_value_not_allowed','Informe somente o nome da variável server-side, nunca a API key do TaxAgent.');
    const before=(await query<any>(`select * from integrations where workspace_id=$1 and provider='taxagent' limit 1`,[ctx.workspaceId]))[0]||null;
    const rows=await query<any>(`insert into integrations(workspace_id,provider,status,external_account_ref,capabilities,config,secret_ref,connected_at) values($1,'taxagent','configured',$2,$3,$4,$5,now()) on conflict(workspace_id,provider) do update set status='configured',external_account_ref=excluded.external_account_ref,capabilities=excluded.capabilities,config=excluded.config,secret_ref=excluded.secret_ref,connected_at=coalesce(integrations.connected_at,now()),last_error=null,updated_at=now() returning *`,[ctx.workspaceId,input.companyId,['nfse','tax_engine','readiness','fiscal_ledger','idempotency'],JSON.stringify({environment:input.environment,requiresHumanApproval:true}),input.secretRef]);
    await auditLog(ctx,'integration.taxagent.configured','integration',rows[0].id,before,{provider:'taxagent',companyId:input.companyId,environment:input.environment,secretRef:input.secretRef},{secretValueStored:false});
    return {provider:'taxagent',status:rows[0].status,companyId:rows[0].external_account_ref,environment:rows[0].config?.environment||input.environment,secretConfigured:Boolean(rows[0].secret_ref)};
  });

  app.get('/v1/fiscal/status',async req=>{
    const ctx=await workspaceContext(req,'finance.read');
    const [integration,actions]=await Promise.all([
      query<any>(`select status,external_account_ref company_id,config,secret_ref is not null secret_configured,last_health_status,last_error,updated_at from integrations where workspace_id=$1 and provider='taxagent' limit 1`,[ctx.workspaceId]),
      query<any>(`select id,title,summary,status,autonomy,approval_id,created_at,updated_at,metadata from command_actions where workspace_id=$1 and primary_action->>'type'='invoice.issue' order by created_at desc limit 50`,[ctx.workspaceId])
    ]);
    return {integration:integration[0]||null,recentActions:actions};
  });

  app.post('/v1/fiscal/invoices/prepare',async req=>{
    const ctx=await workspaceContext(req,'finance.write');
    const mapping=(await query<any>(`select external_account_ref,config,secret_ref from integrations where workspace_id=$1 and provider='taxagent' limit 1`,[ctx.workspaceId]))[0];
    if(!mapping?.external_account_ref)throw new ApiError(409,'taxagent_not_connected','Configure a Company do TaxAgent para este workspace antes de preparar a emissão.');
    const input=z.object({competence:z.string().date().optional(),taxDecisionId:z.string().trim().optional(),preparedDpsId:z.string().trim().optional(),customer:Customer,service:Service}).parse(req.body);
    const payload={
      companyId:String(mapping.external_account_ref),
      environment:String(mapping.config?.environment||'test'),
      competence:input.competence||null,
      taxDecisionId:input.taxDecisionId||null,
      preparedDpsId:input.preparedDpsId||null,
      customer:input.customer,
      service:input.service,
      secretRefConfigured:Boolean(mapping.secret_ref)
    };
    const emitted=await emitBusinessEvent(ctx.workspaceId,'invoice.issue','nexoffice.fiscal','workspace',ctx.workspaceId,payload);
    await auditLog(ctx,'fiscal.invoice.prepared','workspace',ctx.workspaceId,null,{environment:payload.environment,companyId:payload.companyId,amount:input.service.amount},{externalEffect:false,approvalRequired:true});
    return {...emitted,prepared:true,externalEffect:false};
  });
}
