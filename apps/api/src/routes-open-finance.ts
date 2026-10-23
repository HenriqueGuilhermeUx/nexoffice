import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import type {OpenFinanceResource} from '@nexoffice/integrations';
import {ApiError,workspaceContext} from './auth.js';
import {auditLog} from './events.js';
import {belvoOpenFinance} from './open-finance-adapter.js';

const resources=z.enum([
  'ACCOUNTS','OWNERS','TRANSACTIONS','BILLS','INVESTMENTS','INVESTMENT_TRANSACTIONS','INCOMES','RECURRING_EXPENSES','RISK_INSIGHTS'
]);

const connectSchema=z.object({
  cpf:z.string().trim().min(11).max(18),
  cpfName:z.string().trim().min(2).max(180),
  cnpj:z.string().trim().min(14).max(24),
  companyName:z.string().trim().min(2).max(180),
  resources:z.array(resources).max(9).optional(),
  consentDurationDays:z.union([z.literal(92),z.literal(183),z.literal(275),z.literal(366)]).optional().default(366)
});

function webBaseUrl(){
  return String(process.env.NEXOFFICE_WEB_URL||process.env.PUBLIC_WEB_URL||'https://nexoffices.com.br').trim().replace(/\/$/,'');
}

function callbackUrls(){
  const base=webBaseUrl();
  return {
    success:`${base}/?app=1&openfinance=success`,
    exit:`${base}/?app=1&openfinance=exit`,
    event:`${base}/?app=1&openfinance=error`
  };
}

function termsUrl(){
  return String(process.env.BELVO_TERMS_URL||`${webBaseUrl()}/?legal=terms`).trim();
}

export async function registerOpenFinanceRoutes(app:FastifyInstance){
  app.get('/v1/open-finance/status',async req=>{
    const ctx=await workspaceContext(req,'finance.read');
    const capabilities=belvoOpenFinance.capabilities();
    return{
      workspaceId:ctx.workspaceId,
      provider:'belvo',
      configured:capabilities.configured,
      environment:capabilities.environment,
      resources:capabilities.resources,
      connectWidget:capabilities.connectWidget,
      externalMoneyMovement:false,
      productionEnabled:String(process.env.BELVO_PRODUCTION_ENABLED||'false').toLowerCase()==='true',
      safety:{
        credentialsServerSideOnly:true,
        moneyMovement:false,
        connectRequiresExplicitUserAction:true,
        dataRetrievalRequiresConsent:true
      }
    };
  });

  app.post('/v1/open-finance/connect-session',async req=>{
    const ctx=await workspaceContext(req,'finance.write');
    const input=connectSchema.parse(req.body||{});
    const capabilities=belvoOpenFinance.capabilities();
    if(!capabilities.configured)throw new ApiError(503,'open_finance_not_configured','Belvo Open Finance ainda não está configurado neste ambiente.');
    if(capabilities.environment==='production'&&String(process.env.BELVO_PRODUCTION_ENABLED||'false').toLowerCase()!=='true'){
      throw new ApiError(403,'open_finance_production_disabled','A conexão Open Finance de produção está bloqueada até a certificação e habilitação explícita.');
    }

    const requested=(input.resources?.length?input.resources:capabilities.resources) as OpenFinanceResource[];
    const result=await belvoOpenFinance.createConnectSession(
      {workspaceId:ctx.workspaceId,actorUserId:ctx.user.id},
      {
        identifications:[
          {type:'CPF',number:input.cpf,name:input.cpfName},
          {type:'CNPJ',number:input.cnpj,name:input.companyName}
        ],
        purpose:'Consolidar dados financeiros para conciliação, fluxo de caixa e inteligência operacional.',
        termsAndConditionsUrl:termsUrl(),
        callbackUrls:callbackUrls(),
        resources:requested,
        consentDurationDays:input.consentDurationDays,
        externalId:`nexoffice:${ctx.workspaceId}`,
        institutionTypes:['business']
      }
    );
    if(!result.ok||!result.data)throw new ApiError(502,'open_finance_provider_error',result.error||'Não foi possível iniciar a conexão Open Finance.');

    await auditLog(ctx,'open_finance.connect_session.created','workspace',ctx.workspaceId,null,{
      provider:'belvo',
      environment:result.data.environment,
      resources:result.data.requestedResources,
      consentDurationDays:input.consentDurationDays,
      externalEffect:false
    });

    return{
      provider:result.data.provider,
      environment:result.data.environment,
      widgetUrl:result.data.widgetUrl,
      accessToken:result.data.accessToken,
      expiresInSeconds:result.data.expiresInSeconds,
      requestedResources:result.data.requestedResources,
      safety:{moneyMovement:false,userConsentRequired:true}
    };
  });
}
