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

function credentialConfigured(secretRef?:string|null){
  const ref=String(secretRef||'').trim();
  const workspaceKey=ref?String(process.env[ref]||'').trim():'';
  const fallback=String(process.env.TAXAGENT_API_KEY||'').trim();
  return Boolean(workspaceKey||fallback);
}

function fiscalRuntime(){
  const base=String(process.env.TAXAGENT_BASE_URL||'').trim().replace(/\/+$/,'');
  const apiKey=String(process.env.TAXAGENT_API_KEY||'').trim();
  const authHeader=String(process.env.TAXAGENT_AUTH_HEADER||'X-TaxAgent-NexOffice-Key').trim()||'X-TaxAgent-NexOffice-Key';
  if(!base||!apiKey)throw new ApiError(503,'fiscal_connection_not_configured','A conexão fiscal ainda não está disponível neste ambiente.');
  return{base,apiKey,authHeader};
}

async function fiscalRequest(path:string,init:RequestInit={}){
  const runtime=fiscalRuntime();
  const headers=new Headers(init.headers||{});
  headers.set(runtime.authHeader,runtime.apiKey);
  headers.set('accept','application/json');
  if(init.body)headers.set('content-type','application/json');
  const response=await fetch(`${runtime.base}${path}`,{...init,headers});
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new ApiError(502,'fiscal_connection_error',body?.message||body?.error||`O serviço fiscal respondeu ${response.status}.`);
  return body;
}

async function saveFiscalIntegration(ctx:any,companyId:string,environment:'test'|'production',secretRef='TAXAGENT_API_KEY'){
  const before=(await query<any>(`select * from integrations where workspace_id=$1 and provider='taxagent' limit 1`,[ctx.workspaceId]))[0]||null;
  const rows=await query<any>(`insert into integrations(workspace_id,provider,status,external_account_ref,capabilities,config,secret_ref,connected_at) values($1,'taxagent','configured',$2,$3,$4,$5,now()) on conflict(workspace_id,provider) do update set status='configured',external_account_ref=excluded.external_account_ref,capabilities=excluded.capabilities,config=excluded.config,secret_ref=excluded.secret_ref,connected_at=coalesce(integrations.connected_at,now()),last_error=null,updated_at=now() returning *`,[ctx.workspaceId,companyId,['nfse','tax_engine','readiness','fiscal_ledger','idempotency'],JSON.stringify({environment,requiresHumanApproval:true}),secretRef]);
  await auditLog(ctx,'integration.taxagent.configured','integration',rows[0].id,before,{provider:'taxagent',companyId,environment,secretRef},{secretValueStored:false});
  return rows[0];
}

export async function registerFiscalRoutes(app:FastifyInstance){
  app.get('/v1/integrations/taxagent',async req=>{
    const ctx=await workspaceContext(req,'integrations.read');
    const row=(await query<any>(`select provider,status,external_account_ref,capabilities,config,secret_ref,connected_at,last_health_at,last_health_status,last_error,updated_at from integrations where workspace_id=$1 and provider='taxagent' limit 1`,[ctx.workspaceId]))[0]||null;
    if(!row)return {provider:'taxagent',status:'disconnected',companyId:null,environment:'test',secretConfigured:false};
    const secretConfigured=credentialConfigured(row.secret_ref);
    const {secret_ref:_secretRef,...safe}=row;
    return {...safe,companyId:row.external_account_ref||null,environment:row.config?.environment||'test',secretConfigured};
  });

  app.post('/v1/integrations/taxagent/activate',async req=>{
    const ctx=await workspaceContext(req,'integrations.manage');
    const input=z.object({
      companyId:z.string().trim().min(3).max(160).optional(),
      taxId:z.string().trim().min(5).max(32).optional(),
      cityCode:z.string().regex(/^\d{7}$/).optional(),
      municipalRegistration:z.string().trim().max(80).optional(),
      taxRegime:z.string().trim().max(80).optional()
    }).parse(req.body||{});
    fiscalRuntime();
    const existing=(await query<any>(`select external_account_ref,config from integrations where workspace_id=$1 and provider='taxagent' limit 1`,[ctx.workspaceId]))[0]||null;
    if(existing?.external_account_ref){
      await fiscalRequest(`/v1/partners/nexoffice/companies/${encodeURIComponent(String(existing.external_account_ref))}/fiscal?environment=${encodeURIComponent(String(existing.config?.environment||'test'))}`);
      return{connected:true,companyId:existing.external_account_ref,environment:existing.config?.environment||'test',alreadyConnected:true};
    }
    const homologCompany=String(process.env.TAXAGENT_HOMOLOG_COMPANY_ID||'').trim();
    let companyId=String(input.companyId||homologCompany||'').trim();
    let assessment:any=null;
    if(companyId){
      assessment=await fiscalRequest(`/v1/partners/nexoffice/companies/${encodeURIComponent(companyId)}/fiscal?environment=test`);
    }else{
      if(!input.taxId||!input.cityCode)throw new ApiError(400,'fiscal_identity_required','Para conectar o Fiscal, complete o CNPJ/CPF e o município da empresa.');
      const provision=await fiscalRequest('/v1/partners/nexoffice/provision?environment=test',{method:'POST',body:JSON.stringify({organization_name:ctx.workspaceName,company_name:ctx.workspaceName,tax_id:input.taxId,city_code:input.cityCode,municipal_registration:input.municipalRegistration||undefined,tax_regime:input.taxRegime||undefined,pilot_label:`NexOffice · ${ctx.workspaceName}`,source:'nexoffice'})});
      companyId=String(provision?.company?.id||provision?.company?.company_id||'').trim();
      assessment=provision?.fiscal_status||provision;
      if(!companyId)throw new ApiError(502,'fiscal_provision_invalid_response','A conexão fiscal não retornou a empresa vinculada.');
    }
    await saveFiscalIntegration(ctx,companyId,'test','TAXAGENT_API_KEY');
    return{connected:true,companyId,environment:'test',assessment,safeguards:{humanApprovalRequired:true,secretStored:false,productionEffect:false}};
  });

  app.put('/v1/integrations/taxagent',async req=>{
    const ctx=await workspaceContext(req,'integrations.manage');
    const input=z.object({companyId:z.string().trim().min(3).max(160),environment:z.enum(['test','production']).default('test'),secretRef:SecretRef}).parse(req.body);
    if(/^ta_(test|live)_/i.test(input.secretRef))throw new ApiError(400,'secret_value_not_allowed','Informe somente o nome da variável server-side, nunca a API key do TaxAgent.');
    const row=await saveFiscalIntegration(ctx,input.companyId,input.environment,input.secretRef);
    return {provider:'taxagent',status:row.status,companyId:row.external_account_ref,environment:row.config?.environment||input.environment,secretConfigured:Boolean(row.secret_ref)};
  });

  app.get('/v1/fiscal/status',async req=>{
    const ctx=await workspaceContext(req,'finance.read');
    const [integrationRows,actions]=await Promise.all([
      query<any>(`select status,external_account_ref company_id,config,secret_ref,last_health_status,last_error,updated_at from integrations where workspace_id=$1 and provider='taxagent' limit 1`,[ctx.workspaceId]),
      query<any>(`select id,title,summary,status,autonomy,approval_id,created_at,updated_at,metadata from command_actions where workspace_id=$1 and primary_action->>'type'='invoice.issue' order by created_at desc limit 50`,[ctx.workspaceId])
    ]);
    const row=integrationRows[0]||null;
    const integration=row?{status:row.status,company_id:row.company_id,config:row.config,secret_configured:credentialConfigured(row.secret_ref),last_health_status:row.last_health_status,last_error:row.last_error,updated_at:row.updated_at}:null;
    return {integration,recentActions:actions};
  });

  app.post('/v1/fiscal/invoices/prepare',async req=>{
    const ctx=await workspaceContext(req,'finance.write');
    const mapping=(await query<any>(`select external_account_ref,config,secret_ref from integrations where workspace_id=$1 and provider='taxagent' limit 1`,[ctx.workspaceId]))[0];
    if(!mapping?.external_account_ref)throw new ApiError(409,'taxagent_not_connected','Conecte o Fiscal desta empresa antes de preparar a emissão.');
    const input=z.object({competence:z.string().date().optional(),taxDecisionId:z.string().trim().optional(),preparedDpsId:z.string().trim().optional(),customer:Customer,service:Service}).parse(req.body);
    const payload={
      companyId:String(mapping.external_account_ref),
      environment:String(mapping.config?.environment||'test'),
      competence:input.competence||null,
      taxDecisionId:input.taxDecisionId||null,
      preparedDpsId:input.preparedDpsId||null,
      customer:input.customer,
      service:input.service,
      credentialConfigured:credentialConfigured(mapping.secret_ref)
    };
    const emitted=await emitBusinessEvent(ctx.workspaceId,'invoice.issue','nexoffice.fiscal','workspace',ctx.workspaceId,payload);
    await auditLog(ctx,'fiscal.invoice.prepared','workspace',ctx.workspaceId,null,{environment:payload.environment,companyId:payload.companyId,amount:input.service.amount,credentialConfigured:payload.credentialConfigured},{externalEffect:false,approvalRequired:true});
    return {...emitted,prepared:true,externalEffect:false,credentialConfigured:payload.credentialConfigured};
  });
}
