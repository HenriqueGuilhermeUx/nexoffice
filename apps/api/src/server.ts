import 'dotenv/config';
import Fastify from 'fastify';
import {db} from './db.js';
import {runMigrations} from './migrations.js';
import {modoMarketingConfigured,modoMarketingRequest} from './modo-marketing-adapter.js';
import {ensureDailyFinancialIntelligence} from './financial-intelligence-daily.js';
import {registerAuthRoutes} from './routes-auth.js';
import {registerCrmRoutes} from './routes-crm.js';
import {registerOpsRoutes} from './routes-ops.js';
import {registerFinanceRoutes} from './routes-finance.js';
import {registerFinancialIntelligenceRoutes} from './routes-financial-intelligence.js';
import {registerCommandRoutes} from './routes-command.js';
import {registerCommandIntelligenceRoutes} from './routes-command-intelligence.js';
import {registerRuntimeRoutes} from './routes-runtime.js';
import {registerCapabilityRoutes} from './routes-capabilities.js';
import {registerDocumentIntelligenceRoutes} from './routes-document-intelligence.js';
import {registerAssistantRoutes} from './routes-assistant.js';
import {registerCollectionsRoutes} from './routes-collections.js';
import {registerReconciliationRoutes} from './routes-reconciliation.js';
import {registerStatementImportRoutes} from './routes-statement-import.js';
import {registerStaffRoutes} from './routes-staff.js';
import {registerSmartBotsRoutes} from './routes-smartbots.js';
import {registerFiscalRoutes} from './routes-fiscal.js';
import {registerVerticalRoutes} from './routes-vertical.js';
import {registerFlexibleRoutes} from './routes-flexible.js';
import {registerMarketingRoutes} from './routes-marketing.js';
import {registerPlatformRoutes} from './routes-platform.js';
import {registerPlatformHealthRoutes} from './routes-platform-health.js';
import {registerPlatformLegalRoutes} from './routes-platform-legal.js';
import {registerPlatformCondoRoutes} from './routes-platform-condo.js';
import {registerPlatformCommerceRoutes} from './routes-platform-commerce.js';
import {registerSignalRoutes} from './routes-signals.js';
import {registerAutomationRoutes} from './routes-automation.js';
import {registerUsageRoutes} from './routes-usage.js';
import {registerStandaloneRoutes} from './routes-standalone.js';
import {registerBillingRoutes} from './routes-billing.js';

if(String(process.env.AUTO_MIGRATE||'false').toLowerCase()==='true')await runMigrations();

const app=Fastify({logger:true});
const port=Number(process.env.PORT||4000);
const allowedOrigins=String(process.env.ALLOWED_ORIGINS||'*').split(',').map(x=>x.trim()).filter(Boolean);

app.addHook('onSend',async(req,reply,payload)=>{
  const origin=String(req.headers.origin||'');
  if(allowedOrigins.includes('*'))reply.header('access-control-allow-origin','*');
  else if(origin&&allowedOrigins.includes(origin))reply.header('access-control-allow-origin',origin);
  reply.header('access-control-allow-headers','content-type, authorization, x-workspace-id, x-nexoffice-key');
  reply.header('access-control-allow-methods','GET,POST,PATCH,PUT,DELETE,OPTIONS');
  reply.header('access-control-max-age','86400');
  return payload;
});
app.addHook('onResponse',async(req,reply)=>{
  if(req.method!=='GET'||!req.url.startsWith('/v1/dashboard')||reply.statusCode>=300)return;
  const workspaceId=String(req.headers['x-workspace-id']||'').trim();
  if(!workspaceId)return;
  void ensureDailyFinancialIntelligence(workspaceId).then(result=>{
    if(result.created)app.log.info({workspaceId,snapshotId:result.snapshotId},'Daily financial intelligence captured');
  }).catch(error=>app.log.warn({workspaceId,error:error instanceof Error?error.message:String(error)},'Daily financial intelligence capture failed'));
});
app.options('*',async(_req,reply)=>reply.code(204).send());

app.get('/health',async()=>({status:'ok',service:'nexoffice-api',version:'0.26.0',database:Boolean(db),autoMigrate:String(process.env.AUTO_MIGRATE||'false').toLowerCase()==='true'}));

await registerAuthRoutes(app);
await registerCrmRoutes(app);
await registerOpsRoutes(app);
await registerFinanceRoutes(app);
await registerFinancialIntelligenceRoutes(app);
await registerCommandRoutes(app);
await registerCommandIntelligenceRoutes(app);
await registerRuntimeRoutes(app);
await registerCapabilityRoutes(app);
await registerDocumentIntelligenceRoutes(app);
await registerAssistantRoutes(app);
await registerStaffRoutes(app);
await registerSmartBotsRoutes(app);
await registerFiscalRoutes(app);
await registerFlexibleRoutes(app);
await registerVerticalRoutes(app);
await registerMarketingRoutes(app);
await registerPlatformRoutes(app);
await registerPlatformHealthRoutes(app);
await registerPlatformLegalRoutes(app);
await registerPlatformCondoRoutes(app);
await registerPlatformCommerceRoutes(app);
await registerSignalRoutes(app);
await registerAutomationRoutes(app);
await registerUsageRoutes(app);
await registerCollectionsRoutes(app);
await registerReconciliationRoutes(app);
await registerStatementImportRoutes(app);
await registerStandaloneRoutes(app);
await registerBillingRoutes(app);

app.setErrorHandler((error,_req,reply)=>{
  app.log.error(error);
  const anyError=error as any;
  const status=Number(anyError?.statusCode||anyError?.status||(anyError?.issues?400:500));
  reply.code(status).send({error:anyError?.code||'request_failed',message:error instanceof Error?error.message:String(error),issues:anyError?.issues,payload:anyError?.payload});
});

await app.listen({port,host:'0.0.0.0'});

const staffBase=String(process.env.STAFF_BASE_URL||'').replace(/\/$/,'');
const staffKey=String(process.env.STAFF_API_KEY||'');
if(staffBase&&staffKey){
  void fetch(`${staffBase}/.netlify/functions/nexoffice-assistant`,{
    headers:{Authorization:`Bearer ${staffKey}`,'X-NexOffice-Workspace-ID':'nexoffice-system-health',accept:'application/json'},
    signal:AbortSignal.timeout(8000)
  }).then(async response=>{
    const payload=await response.json().catch(()=>({} as any)) as any;
    const privacyOk=payload?.privacyMode==='business_context_only'&&payload?.personalMemoryAccess===false&&payload?.externalActions===false;
    if(!response.ok||!privacyOk)throw new Error(`HTTP ${response.status}; privacy_contract=${privacyOk?'ok':'invalid'}`);
    app.log.info({integration:'staff',service:payload?.service||null,privacyMode:payload?.privacyMode||null,personalMemoryAccess:payload?.personalMemoryAccess,externalActions:payload?.externalActions,capabilities:Array.isArray(payload?.capabilities)?payload.capabilities:[]},'Staff business bridge health OK');
  }).catch(error=>app.log.error({integration:'staff',error:error instanceof Error?error.message:String(error)},'Staff business bridge health FAILED'));
}else app.log.warn({integration:'staff'},'Staff business bridge not configured');

if(modoMarketingConfigured()){
  void modoMarketingRequest<any>('system-health','health').then(result=>{
    app.log.info({integration:'modo',contract:result?.contract||null,workflow:result?.workflow||[],googleAds:result?.googleAds||null,externalCampaignActivation:result?.externalCampaignActivation},'MODO marketing bridge health OK');
  }).catch(error=>{
    app.log.error({integration:'modo',error:error instanceof Error?error.message:String(error)},'MODO marketing bridge health FAILED');
  });
}else app.log.warn({integration:'modo'},'MODO marketing bridge not configured');