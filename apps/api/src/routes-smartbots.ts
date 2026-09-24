import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {ApiError,workspaceContext} from './auth.js';
import {query} from './db.js';
import {auditLog} from './events.js';
import {bindSmartBotsWorkspace,probeProvider,smartBotsAddonRequest} from './integration-runtime.js';

const SMARTBOTS_CAPABILITIES=['whatsapp','service','qualification','follow-up','human_approval','workspace_binding','idempotent_dispatch'];
const PARTNER_PRICE_MINOR=7900;
const REGULAR_PRICE_MINOR=14900;
const TRIAL_DAYS=7;
const DAY=86_400_000;

type BillingRow={status:string|null;trial_ends_at:string|null;current_period_ends_at:string|null;metadata:any};
function asObject(value:any):Record<string,any>{if(!value)return{};if(typeof value==='object')return value;try{return JSON.parse(String(value))}catch{return{}}}
function mainSubscriptionEligible(row:BillingRow|null){
  if(!row)return false;
  const status=String(row.status||'').toLowerCase();const now=Date.now();
  if(status==='active'||status==='exempt')return true;
  if(status==='cancelled'&&row.current_period_ends_at&&new Date(row.current_period_ends_at).getTime()>now)return true;
  if(status==='past_due'){
    const meta=asObject(row.metadata);const pastDueAt=meta.pastDueAt?new Date(String(meta.pastDueAt)).getTime():0;
    return pastDueAt>0&&pastDueAt+7*DAY>now;
  }
  return false;
}
async function billingEligibility(workspaceId:string){
  const row=(await query<BillingRow>(`select status,trial_ends_at,current_period_ends_at,metadata from workspace_billing where workspace_id=$1 limit 1`,[workspaceId]))[0]||null;
  return {eligible:mainSubscriptionEligible(row),billing:row};
}
function websiteFromMetadata(metadata:Record<string,any>){
  const candidates=[metadata.website,metadata.site,metadata.url,metadata?.brand?.website,metadata?.marketing?.website,metadata?.commercial?.website];
  return String(candidates.find(v=>typeof v==='string'&&v.trim())||'').trim().slice(0,500);
}
async function businessPayload(ctx:any){
  const profile=(await query<any>(`select * from business_profiles where workspace_id=$1 limit 1`,[ctx.workspaceId]))[0]||{};
  const metadata=asObject(profile.metadata);
  const summary=[
    profile.sector?`Setor: ${profile.sector}`:'',profile.subsector?`Subsetor: ${profile.subsector}`:'',profile.revenue_model?`Modelo de receita: ${profile.revenue_model}`:'',
    profile.primary_sales_channel?`Canal comercial principal: ${profile.primary_sales_channel}`:'',profile.seasonality?`Sazonalidade: ${profile.seasonality}`:'',
    profile.main_dependency?`Dependência principal: ${profile.main_dependency}`:'',profile.notes?`Notas: ${profile.notes}`:''
  ].filter(Boolean).join('\n');
  return {
    companyName:ctx.workspaceName,
    ownerName:ctx.user.name,
    ownerEmail:ctx.user.email,
    website:websiteFromMetadata(metadata),
    businessSummary:summary.slice(0,12000),
    businessProfile:{
      sector:profile.sector||null,subsector:profile.subsector||null,revenue_model:profile.revenue_model||null,primary_sales_channel:profile.primary_sales_channel||null,
      seasonality:profile.seasonality||null,main_dependency:profile.main_dependency||null,notes:profile.notes||null,
      metadata:{marketing:asObject(metadata.marketing),commercial:asObject(metadata.commercial),brand:asObject(metadata.brand)}
    }
  };
}
async function localState(workspaceId:string){
  const [integration,entitlement]=await Promise.all([
    query<any>(`select id,provider,status,external_account_ref,capabilities,config,connected_at,last_health_at,last_health_status,last_error,updated_at from integrations where workspace_id=$1 and provider='smartbots' limit 1`,[workspaceId]),
    query<any>(`select id,status,valid_from,valid_until,metadata,updated_at from entitlements where workspace_id=$1 and capability='addon.smartbots' and source='nexoffice' limit 1`,[workspaceId])
  ]);
  return {integration:integration[0]||null,entitlement:entitlement[0]||null};
}
async function upsertEntitlement(workspaceId:string){
  const existing=(await query<any>(`select * from entitlements where workspace_id=$1 and capability='addon.smartbots' and source='nexoffice' limit 1`,[workspaceId]))[0]||null;
  const now=new Date();const existingEnd=existing?.valid_until?new Date(existing.valid_until).getTime():0;
  const validUntil=existing?.valid_until||new Date(now.getTime()+TRIAL_DAYS*DAY).toISOString();
  const status=existingEnd>Date.now()||!existing?'trial':'active';
  const metadata={...asObject(existing?.metadata),product:'smartbots',partner:'nexoffice',priceMinor:PARTNER_PRICE_MINOR,regularPriceMinor:REGULAR_PRICE_MINOR,currency:'BRL',billingOwner:'smartbots',trialDays:TRIAL_DAYS};
  return (await query<any>(`insert into entitlements(workspace_id,capability,status,source,valid_from,valid_until,metadata,updated_at)
    values($1,'addon.smartbots',$2,'nexoffice',now(),$3,$4,now())
    on conflict(workspace_id,capability,source) do update set status=excluded.status,valid_until=coalesce(entitlements.valid_until,excluded.valid_until),metadata=excluded.metadata,updated_at=now()
    returning *`,[workspaceId,status,validUntil,JSON.stringify(metadata)]))[0];
}
async function saveIntegration(workspaceId:string,botId:string,remote:any){
  const config={botId,partner:'nexoffice',partnerPriceMinor:PARTNER_PRICE_MINOR,regularPriceMinor:REGULAR_PRICE_MINOR,workspaceBindingVerified:true,firstOutboundRequiresHumanApproval:true};
  return (await query<any>(`insert into integrations(workspace_id,provider,status,external_account_ref,capabilities,config,connected_at,last_error)
    values($1,'smartbots','connected',$2,$3,$4,now(),null)
    on conflict(workspace_id,provider) do update set status='connected',external_account_ref=excluded.external_account_ref,capabilities=excluded.capabilities,config=excluded.config,connected_at=coalesce(integrations.connected_at,now()),last_error=null,updated_at=now()
    returning *`,[workspaceId,botId,SMARTBOTS_CAPABILITIES,JSON.stringify({...config,botStatus:remote?.botStatus||null})]))[0];
}
async function remoteStatus(workspaceId:string){
  const result=await smartBotsAddonRequest(workspaceId,'status');
  return result.ok?((result as any).payload as any):null;
}
async function startOrHandoff(ctx:any){
  const eligibility=await billingEligibility(ctx.workspaceId);
  if(!eligibility.eligible)throw new ApiError(402,'nexoffice_subscription_required','O benefício SmartBots de R$ 79/mês é exclusivo para assinantes NexOffice ativos.');
  const before=await localState(ctx.workspaceId);
  const payload=await businessPayload(ctx);
  const existingBotId=String(before.integration?.external_account_ref||before.integration?.config?.botId||'').trim();
  const result=await smartBotsAddonRequest(ctx.workspaceId,'start',{eligible:true,existingBotId:existingBotId||undefined,...payload});
  if(!result.ok){const error:any=new Error(String((result as any).error||'smartbots_addon_start_failed'));error.code='smartbots_addon_start_failed';error.statusCode=Number((result as any).httpStatus||502);error.payload=(result as any).payload||null;throw error}
  const remote=(result as any).payload as any;
  const botId=String(remote?.botId||'').trim();if(!botId)throw new ApiError(502,'smartbots_addon_invalid_response','SmartBots não retornou o vínculo do workspace.');
  const [entitlement,integration]=await Promise.all([upsertEntitlement(ctx.workspaceId),saveIntegration(ctx.workspaceId,botId,remote)]);
  await auditLog(ctx,'integration.smartbots.addon_activated','integration',integration.id,before,{provider:'smartbots',botId,entitlementStatus:entitlement.status},{partner:'nexoffice',priceMinor:PARTNER_PRICE_MINOR,regularPriceMinor:REGULAR_PRICE_MINOR,secretStored:false,clientTokenPersisted:false,workspaceBindingVerified:true});
  return {...remote,entitlement:{status:entitlement.status,validUntil:entitlement.valid_until},offer:{partnerAmountCents:PARTNER_PRICE_MINOR,regularAmountCents:REGULAR_PRICE_MINOR,trialDays:TRIAL_DAYS}};
}

export async function registerSmartBotsRoutes(app:FastifyInstance){
  app.get('/v1/integrations/smartbots',async req=>{
    const ctx=await workspaceContext(req,'integrations.read');
    const [local,eligibility,remote]=await Promise.all([localState(ctx.workspaceId),billingEligibility(ctx.workspaceId),remoteStatus(ctx.workspaceId).catch(()=>null)]);
    return {
      provider:'smartbots',
      status:remote?.provisioned?(remote?.whatsapp?.connected?'connected':'onboarding'):(local.integration?.status||'disconnected'),
      provisioned:Boolean(remote?.provisioned||local.integration?.external_account_ref),
      subscriberEligible:eligibility.eligible,
      botStatus:remote?.botStatus||null,
      billingStatus:remote?.billingStatus||null,
      trialEndsAt:remote?.trialEndsAt||null,
      subscription:remote?.subscription||null,
      whatsapp:remote?.whatsapp||{connected:false,phone:null,autoReply:false,messageWebhookActive:false},
      entitlement:local.entitlement?{status:local.entitlement.status,validFrom:local.entitlement.valid_from,validUntil:local.entitlement.valid_until}:null,
      offer:{partnerAmountCents:PARTNER_PRICE_MINOR,regularAmountCents:REGULAR_PRICE_MINOR,trialDays:TRIAL_DAYS},
      health:{lastHealthAt:local.integration?.last_health_at||null,lastHealthStatus:local.integration?.last_health_status||null,lastError:local.integration?.last_error||null}
    };
  });

  app.post('/v1/integrations/smartbots/activate',async req=>{
    const ctx=await workspaceContext(req,'integrations.manage');
    return startOrHandoff(ctx);
  });

  app.post('/v1/integrations/smartbots/handoff',async req=>{
    const ctx=await workspaceContext(req,'integrations.manage');
    return startOrHandoff(ctx);
  });

  app.put('/v1/integrations/smartbots',async req=>{
    const ctx=await workspaceContext(req,'integrations.manage');
    const input=z.object({botId:z.string().trim().min(3).max(160),clientToken:z.string().trim().min(12).max(300)}).parse(req.body);
    const binding=await bindSmartBotsWorkspace(ctx.workspaceId,input.botId,input.clientToken);
    if(!binding.ok){const error:any=new Error(String(binding.error||'smartbots_binding_failed'));error.code='smartbots_binding_failed';error.statusCode=Number((binding as any).httpStatus||502);error.payload=(binding as any).payload||null;throw error}
    const before=(await query<any>(`select * from integrations where workspace_id=$1 and provider='smartbots' limit 1`,[ctx.workspaceId]))[0]||null;
    const rows=await query<any>(`insert into integrations(workspace_id,provider,status,external_account_ref,capabilities,config,connected_at,last_error) values($1,'smartbots','connected',$2,$3,$4,now(),null) on conflict(workspace_id,provider) do update set status='connected',external_account_ref=excluded.external_account_ref,capabilities=excluded.capabilities,config=excluded.config,connected_at=coalesce(integrations.connected_at,now()),last_error=null,updated_at=now() returning *`,[ctx.workspaceId,input.botId,SMARTBOTS_CAPABILITIES,JSON.stringify({botId:input.botId,firstOutboundRequiresHumanApproval:true,workspaceBindingVerified:true,manualBinding:true})]);
    await auditLog(ctx,'integration.smartbots.connected','integration',rows[0].id,before,{provider:'smartbots',botId:input.botId},{secretStored:false,clientTokenPersisted:false,workspaceBindingVerified:true,firstOutboundRequiresHumanApproval:true,manualBinding:true});
    const health=await probeProvider(ctx.workspaceId,'smartbots');
    return {provider:'smartbots',status:health.ok?'connected':health.status,botId:rows[0].external_account_ref,capabilities:rows[0].capabilities,workspaceBindingVerified:true,health};
  });
}
