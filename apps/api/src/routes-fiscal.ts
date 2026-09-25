import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {workspaceContext,ApiError} from './auth.js';
import {query} from './db.js';
import {auditLog,emitBusinessEvent} from './events.js';
import {getTaxAgentMapping,taxAgentPartnerConfigured,taxAgentPartnerRequest,upsertPartnerMapping} from './taxagent-fiscal-client.js';

const SecretRef=z.string().trim().regex(/^[A-Z][A-Z0-9_]{2,100}$/,'Use apenas o nome de uma variável server-side, nunca a API key.');
const Customer=z.object({taxId:z.string().trim().min(5).max(32),name:z.string().trim().min(1).max(200),cityCode:z.string().regex(/^\d{7}$/)});
const Service=z.object({
  description:z.string().trim().min(1).max(2000),amount:z.number().positive(),nationalServiceCode:z.string().trim().max(40).optional(),serviceLocationCityCode:z.string().regex(/^\d{7}$/).optional(),
  issTaxation:z.enum(['1','2','3','4']).optional(),issWithholding:z.enum(['1','2','3']).optional(),issRate:z.number().min(0).max(9.99).optional(),finalConsumption:z.enum(['0','1']).optional(),
  operationIndicator:z.string().trim().max(60).optional(),taxSituation:z.string().trim().max(60).optional(),taxClassification:z.string().trim().max(120).optional()
});
const Activation=z.object({organizationName:z.string().trim().min(2).max(160),companyName:z.string().trim().min(2).max(200),taxId:z.string().trim().min(11).max(32),cityCode:z.string().regex(/^\d{7}$/),municipalRegistration:z.string().trim().max(80).optional(),taxRegime:z.string().trim().min(2).max(80).default('regular'),environment:z.enum(['test','production']).default('test')});
const Profile=z.object({city_code:z.string().regex(/^\d{7}$/).optional(),municipal_registration:z.string().trim().min(1).max(80).optional(),tax_regime:z.string().trim().min(1).max(80).optional()}).refine(v=>Object.keys(v).length>0,'Informe ao menos um campo fiscal.');
const Certificate=z.object({pfxBase64:z.string().min(32).max(8_000_000),password:z.string().min(1).max(500)});
const ProviderCredentials=z.object({provider:z.string().regex(/^[a-z0-9][a-z0-9-]{1,39}$/),credentials:z.record(z.string(),z.string().max(2000)),note:z.string().max(500).optional()});
const Cancellation=z.object({reason_code:z.enum(['1','2','9']),reason:z.string().trim().min(5).max(255)});

export async function registerFiscalRoutes(app:FastifyInstance){
  app.get('/v1/integrations/taxagent',async req=>{
    const ctx=await workspaceContext(req,'integrations.read');
    const row=(await query<any>(`select provider,status,external_account_ref,capabilities,config,secret_ref,connected_at,last_health_at,last_health_status,last_error,updated_at from integrations where workspace_id=$1 and provider='taxagent' limit 1`,[ctx.workspaceId]))[0]||null;
    if(!row)return {provider:'taxagent',status:'disconnected',companyId:null,environment:'test',secretConfigured:false,partnerConfigured:taxAgentPartnerConfigured()};
    return {...row,companyId:row.external_account_ref||null,environment:row.config?.environment||'test',secretConfigured:Boolean(row.secret_ref),partnerConfigured:taxAgentPartnerConfigured()};
  });

  app.put('/v1/integrations/taxagent',async req=>{
    const ctx=await workspaceContext(req,'integrations.manage');
    const input=z.object({companyId:z.string().trim().min(3).max(160),environment:z.enum(['test','production']).default('test'),secretRef:SecretRef}).parse(req.body);
    if(/^ta_(test|live)_/i.test(input.secretRef))throw new ApiError(400,'secret_value_not_allowed','Informe somente o nome da variável server-side, nunca a API key do TaxAgent.');
    const before=(await query<any>(`select * from integrations where workspace_id=$1 and provider='taxagent' limit 1`,[ctx.workspaceId]))[0]||null;
    const rows=await query<any>(`insert into integrations(workspace_id,provider,status,external_account_ref,capabilities,config,secret_ref,connected_at) values($1,'taxagent','configured',$2,$3,$4,$5,now()) on conflict(workspace_id,provider) do update set status='configured',external_account_ref=excluded.external_account_ref,capabilities=excluded.capabilities,config=excluded.config,secret_ref=excluded.secret_ref,connected_at=coalesce(integrations.connected_at,now()),last_error=null,updated_at=now() returning *`,[ctx.workspaceId,input.companyId,['nfse','tax_engine','readiness','fiscal_ledger','idempotency'],JSON.stringify({environment:input.environment,requiresHumanApproval:true,authMode:'company-api-key'}),input.secretRef]);
    await auditLog(ctx,'integration.taxagent.configured','integration',rows[0].id,before,{provider:'taxagent',companyId:input.companyId,environment:input.environment,secretRef:input.secretRef},{secretValueStored:false});
    return {provider:'taxagent',status:rows[0].status,companyId:rows[0].external_account_ref,environment:rows[0].config?.environment||input.environment,secretConfigured:Boolean(rows[0].secret_ref),partnerConfigured:taxAgentPartnerConfigured()};
  });

  app.post('/v1/fiscal/onboarding/activate',async req=>{
    const ctx=await workspaceContext(req,'finance.write');const input=Activation.parse(req.body);
    const provision=await taxAgentPartnerRequest<any>(`/v1/partners/nexoffice/provision?environment=${input.environment}`,'POST',{
      organization_name:input.organizationName,company_name:input.companyName,tax_id:input.taxId,city_code:input.cityCode,municipal_registration:input.municipalRegistration||undefined,tax_regime:input.taxRegime,pilot_label:`NexOffice · ${ctx.workspaceName}`,source:'nexoffice'
    });
    const companyId=String(provision?.company?.id||'');if(!companyId)throw new ApiError(502,'taxagent_invalid_provision_response','TaxAgent não retornou a Company provisionada.');
    const before=await getTaxAgentMapping(ctx.workspaceId);await upsertPartnerMapping(ctx.workspaceId,companyId,input.environment);
    await auditLog(ctx,'fiscal.onboarding.activated','workspace',ctx.workspaceId,before,{companyId,environment:input.environment,route:provision?.route||null},{externalEffect:false,partnerCredential:true,secretValueStored:false});
    return {connected:true,companyId,environment:input.environment,...provision};
  });

  app.get('/v1/fiscal/onboarding',async req=>{
    const ctx=await workspaceContext(req,'finance.read');const mapping=await getTaxAgentMapping(ctx.workspaceId);
    if(!mapping?.companyId)return {connected:false,partnerConfigured:taxAgentPartnerConfigured(),fiscal_status:'NOT_CONFIGURED',stages:[],blockers:[],next_action:{action:'Ativar o Fiscal para este workspace.'}};
    const journey=await taxAgentPartnerRequest<any>(`/v1/partners/nexoffice/companies/${encodeURIComponent(mapping.companyId)}/fiscal?environment=${mapping.environment}`);
    return {connected:true,companyId:mapping.companyId,environment:mapping.environment,...journey};
  });

  app.post('/v1/fiscal/onboarding/profile',async req=>{
    const ctx=await workspaceContext(req,'finance.write');const mapping=await requireMapping(ctx.workspaceId);const input=Profile.parse(req.body);
    const result=await taxAgentPartnerRequest<any>(`/v1/partners/nexoffice/companies/${encodeURIComponent(mapping.companyId!)}/fiscal/profile?environment=${mapping.environment}`,'POST',input);
    await auditLog(ctx,'fiscal.profile.updated','workspace',ctx.workspaceId,null,{companyId:mapping.companyId,fields:Object.keys(input)},{externalEffect:false,secretValueStored:false});return result;
  });

  app.post('/v1/fiscal/onboarding/advance',async req=>{
    const ctx=await workspaceContext(req,'finance.write');const mapping=await requireMapping(ctx.workspaceId);
    const result=await taxAgentPartnerRequest<any>(`/v1/partners/nexoffice/companies/${encodeURIComponent(mapping.companyId!)}/fiscal/advance?environment=${mapping.environment}`,'POST',{});
    await auditLog(ctx,'fiscal.onboarding.advanced','workspace',ctx.workspaceId,null,{companyId:mapping.companyId,status:result?.fiscal_status||null},{externalEffect:false,fiscalTransmissionAttempted:false});return result;
  });

  app.post('/v1/fiscal/onboarding/certificate',async req=>{
    const ctx=await workspaceContext(req,'finance.write');const mapping=await requireMapping(ctx.workspaceId);const input=Certificate.parse(req.body);
    const result=await taxAgentPartnerRequest<any>(`/v1/partners/nexoffice/companies/${encodeURIComponent(mapping.companyId!)}/certificate`,'POST',{pfx_base64:input.pfxBase64,password:input.password});
    await auditLog(ctx,'fiscal.certificate.forwarded','workspace',ctx.workspaceId,null,{companyId:mapping.companyId},{externalEffect:false,secretForwardedToTaxAgentVault:true,secretValueStored:false});return result;
  });

  app.post('/v1/fiscal/onboarding/provider-credentials',async req=>{
    const ctx=await workspaceContext(req,'finance.write');const mapping=await requireMapping(ctx.workspaceId);const input=ProviderCredentials.parse(req.body);
    const result=await taxAgentPartnerRequest<any>(`/v1/partners/nexoffice/companies/${encodeURIComponent(mapping.companyId!)}/provider-credentials`,'POST',{provider:input.provider,environment:mapping.environment,credentials:input.credentials,note:input.note||'NexOffice Fiscal Center'});
    await auditLog(ctx,'fiscal.provider_credentials.forwarded','workspace',ctx.workspaceId,null,{companyId:mapping.companyId,provider:input.provider},{externalEffect:false,secretForwardedToTaxAgentVault:true,secretValueStored:false});return result;
  });

  app.get('/v1/fiscal/status',async req=>{
    const ctx=await workspaceContext(req,'finance.read');
    const [integration,actions]=await Promise.all([
      query<any>(`select status,external_account_ref company_id,config,secret_ref is not null secret_configured,last_health_status,last_error,updated_at from integrations where workspace_id=$1 and provider='taxagent' limit 1`,[ctx.workspaceId]),
      query<any>(`select id,title,summary,status,autonomy,approval_id,created_at,updated_at,metadata from command_actions where workspace_id=$1 and primary_action->>'type'='invoice.issue' order by created_at desc limit 50`,[ctx.workspaceId])
    ]);
    return {integration:integration[0]||null,recentActions:actions,partnerConfigured:taxAgentPartnerConfigured()};
  });

  app.post('/v1/fiscal/invoices/prepare',async req=>{
    const ctx=await workspaceContext(req,'finance.write');const mapping=await getTaxAgentMapping(ctx.workspaceId);
    if(!mapping?.companyId)throw new ApiError(409,'taxagent_not_connected','Ative o Fiscal para este workspace antes de preparar a emissão.');
    const input=z.object({competence:z.string().date().optional(),taxDecisionId:z.string().trim().optional(),preparedDpsId:z.string().trim().optional(),customer:Customer,service:Service}).parse(req.body);
    const payload={companyId:mapping.companyId,environment:mapping.environment,competence:input.competence||null,taxDecisionId:input.taxDecisionId||null,preparedDpsId:input.preparedDpsId||null,customer:input.customer,service:input.service,secretRefConfigured:Boolean(mapping.secretRef),partnerAuthConfigured:taxAgentPartnerConfigured()};
    const emitted=await emitBusinessEvent(ctx.workspaceId,'invoice.issue','nexoffice.fiscal','workspace',ctx.workspaceId,payload);
    await auditLog(ctx,'fiscal.invoice.prepared','workspace',ctx.workspaceId,null,{environment:payload.environment,companyId:payload.companyId,amount:input.service.amount},{externalEffect:false,approvalRequired:true});
    return {...emitted,prepared:true,externalEffect:false};
  });

  app.get('/v1/fiscal/invoices/:invoiceId',async req=>{
    const ctx=await workspaceContext(req,'finance.read');const mapping=await requireMapping(ctx.workspaceId);const {invoiceId}=req.params as {invoiceId:string};
    return taxAgentPartnerRequest<any>(`/v1/partners/nexoffice/companies/${encodeURIComponent(mapping.companyId!)}/invoices/${encodeURIComponent(invoiceId)}`);
  });

  app.post('/v1/fiscal/invoices/:invoiceId/cancel',async req=>{
    const ctx=await workspaceContext(req,'finance.write');const mapping=await requireMapping(ctx.workspaceId);const {invoiceId}=req.params as {invoiceId:string};const input=Cancellation.parse(req.body);
    const result=await taxAgentPartnerRequest<any>(`/v1/partners/nexoffice/companies/${encodeURIComponent(mapping.companyId!)}/invoices/${encodeURIComponent(invoiceId)}/cancel`,'POST',input);
    await auditLog(ctx,'fiscal.invoice.cancellation_requested','workspace',ctx.workspaceId,null,{companyId:mapping.companyId,invoiceId,reasonCode:input.reason_code},{externalEffect:true,approvalContext:'workspace-authorized'});return result;
  });
}

async function requireMapping(workspaceId:string){const mapping=await getTaxAgentMapping(workspaceId);if(!mapping?.companyId)throw new ApiError(409,'taxagent_not_connected','Ative o Fiscal para este workspace primeiro.');return mapping;}
