import {createHash,timingSafeEqual} from 'node:crypto';
import type {FastifyInstance,FastifyRequest} from 'fastify';
import {z} from 'zod';
import {ApiError,authenticate} from './auth.js';
import {query} from './db.js';

const DAY=86_400_000;
const PAST_DUE_GRACE_DAYS=7;
const WOOVI_BILLING_EVENTS=['PIX_AUTOMATIC_APPROVED','PIX_AUTOMATIC_REJECTED','PIX_AUTOMATIC_COBR_COMPLETED','PIX_AUTOMATIC_COBR_REJECTED'] as const;

type WooviBillingEvent=typeof WOOVI_BILLING_EVENTS[number];

async function billingContext(req:FastifyRequest,manage=false){
  const user=await authenticate(req);
  const raw=req.headers['x-workspace-id'];
  if(Array.isArray(raw))throw new ApiError(400,'invalid_workspace','Workspace inválido.');
  const requested=raw?String(raw):null;
  const rows=await query<any>(requested
    ? `select w.id workspace_id,w.name workspace_name,m.role,m.permissions from workspace_members m join workspaces w on w.id=m.workspace_id where m.user_id=$1 and m.workspace_id=$2 and m.active=true limit 1`
    : `select w.id workspace_id,w.name workspace_name,m.role,m.permissions from workspace_members m join workspaces w on w.id=m.workspace_id where m.user_id=$1 and m.active=true order by case m.role when 'owner' then 1 when 'admin' then 2 else 3 end,w.created_at limit 1`,requested?[user.id,requested]:[user.id]);
  if(!rows.length)throw new ApiError(403,'workspace_access_denied','Você não tem acesso a esse workspace.');
  if(manage&&!['owner','admin'].includes(rows[0].role))throw new ApiError(403,'permission_denied','Somente proprietários e administradores podem gerenciar a assinatura.');
  return {user,workspaceId:rows[0].workspace_id,workspaceName:rows[0].workspace_name,role:rows[0].role};
}

async function getBilling(workspaceId:string){
  let rows=await query<any>(`select * from workspace_billing where workspace_id=$1 limit 1`,[workspaceId]);
  if(!rows.length){
    await query(`insert into workspace_billing(workspace_id,status) values($1,'trialing') on conflict(workspace_id) do nothing`,[workspaceId]);
    rows=await query<any>(`select * from workspace_billing where workspace_id=$1 limit 1`,[workspaceId]);
  }
  return rows[0];
}

function metadataOf(row:any){
  if(!row?.metadata)return {} as Record<string,any>;
  if(typeof row.metadata==='object')return row.metadata as Record<string,any>;
  try{return JSON.parse(String(row.metadata)) as Record<string,any>}catch{return {}}
}

function summary(row:any){
  const now=Date.now();
  const trialEnd=new Date(row.trial_ends_at).getTime();
  const periodEnd=row.current_period_ends_at?new Date(row.current_period_ends_at).getTime():0;
  const metadata=metadataOf(row);
  const pastDueAt=metadata.pastDueAt?new Date(metadata.pastDueAt).getTime():0;
  const graceEnd=pastDueAt?pastDueAt+PAST_DUE_GRACE_DAYS*DAY:0;
  const trialRemainingMs=Math.max(0,trialEnd-now);
  const trialDaysRemaining=row.status==='trialing'?Math.max(0,Math.ceil(trialRemainingMs/DAY)):0;
  const cancelledPaidThrough=row.status==='cancelled'&&periodEnd>now;
  const pastDueGrace=row.status==='past_due'&&graceEnd>now;
  const access=row.status==='active'||row.status==='exempt'||cancelledPaidThrough||pastDueGrace||(row.status==='trialing'&&trialRemainingMs>0);
  return {
    provider:row.provider,
    planCode:row.plan_code,
    planName:'NexOffice Pro',
    priceMinor:Number(row.price_minor),
    currency:row.currency,
    status:row.status,
    access,
    trialStartedAt:row.trial_started_at,
    trialEndsAt:row.trial_ends_at,
    trialDaysRemaining,
    providerSubscriptionId:row.provider_subscription_id||null,
    currentPeriodEndsAt:row.current_period_ends_at||null,
    cancelledAt:row.cancelled_at||null,
    cancelAtPeriodEnd:cancelledPaidThrough,
    pastDueGraceEndsAt:pastDueGrace?new Date(graceEnd).toISOString():null,
    billingConfigured:String(process.env.NEXOFFICE_BILLING_ENABLED||'false').toLowerCase()==='true'&&Boolean(process.env.WOOVI_APP_ID),
    webhookConfigured:Boolean(String(process.env.WOOVI_WEBHOOK_TOKEN||'').trim()&&String(process.env.WOOVI_WEBHOOK_URL||'').trim())
  };
}

function wooviConfig(){
  const appId=String(process.env.WOOVI_APP_ID||'');
  const enabled=String(process.env.NEXOFFICE_BILLING_ENABLED||'false').toLowerCase()==='true';
  if(!enabled||!appId)throw new ApiError(503,'billing_not_configured','Cobrança ainda não foi habilitada neste ambiente.');
  return {appId,base:String(process.env.WOOVI_API_BASE||'https://api.woovi.com').replace(/\/$/,'')};
}

function webhookConfig(){
  return {token:String(process.env.WOOVI_WEBHOOK_TOKEN||'').trim(),url:String(process.env.WOOVI_WEBHOOK_URL||'').trim()};
}

async function woovi(path:string,init:RequestInit={}){
  const {appId,base}=wooviConfig();
  const headers=new Headers(init.headers||{});headers.set('authorization',appId);headers.set('content-type','application/json');
  const response=await fetch(`${base}${path}`,{...init,headers});
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new ApiError(502,'billing_provider_error',body?.message||body?.error||`Woovi respondeu ${response.status}`);
  return body;
}

function isAuthorizedNotFound(status:number,body:any){
  const providerMessage=String(body?.message||body?.error||'').toLowerCase();
  return (status===400||status===404)&&(providerMessage.includes('não encontr')||providerMessage.includes('not found'));
}

async function safeWooviPermissionProbe(path:string,init:RequestInit={}){
  const {appId,base}=wooviConfig();
  const headers=new Headers(init.headers||{});headers.set('authorization',appId);headers.set('content-type','application/json');
  const response=await fetch(`${base}${path}`,{...init,headers});
  const body=await response.json().catch(()=>({}));
  if(response.ok||isAuthorizedNotFound(response.status,body))return true;
  throw new ApiError(502,'billing_provider_error',body?.message||body?.error||`Woovi respondeu ${response.status}`);
}

async function probeWooviPermissions(){
  const probeId='nexoffice-provider-health-probe-not-found';
  await safeWooviPermissionProbe(`/api/v1/subscriptions/${probeId}`);
  await safeWooviPermissionProbe(`/api/v1/subscriptions/${probeId}/cancel`,{method:'PUT'});
  const webhook=webhookConfig();
  return {
    provider:'woovi',
    configured:true,
    reachable:true,
    subscriptionReadAuthorized:true,
    subscriptionCancelAuthorized:true,
    webhookConfigured:Boolean(webhook.token&&webhook.url),
    webhookUrl:webhook.url||null,
    webhookEvents:[...WOOVI_BILLING_EVENTS]
  };
}

function safeEqual(received:string,expected:string){
  const a=Buffer.from(received);const b=Buffer.from(expected);
  return a.length===b.length&&timingSafeEqual(a,b);
}

function eventId(payload:any,event:string){
  return createHash('sha256').update(JSON.stringify({event,subscription:payload?.paymentSubscriptionGlobalID||payload?.globalID||'',installment:payload?.globalID||'',installmentNumber:payload?.installmentNumber||null,status:payload?.status||'',createdAt:payload?.createdAt||'',correlationID:payload?.correlationID||''})).digest('hex');
}

async function billingForWebhook(payload:any){
  const subscriptionId=String(payload?.paymentSubscriptionGlobalID||payload?.globalID||'').trim();
  if(subscriptionId){
    const byProvider=await query<any>(`select * from workspace_billing where provider='woovi' and provider_subscription_id=$1 limit 1`,[subscriptionId]);
    if(byProvider.length)return byProvider[0];
  }
  const correlation=String(payload?.correlationID||'');
  if(correlation.startsWith('nexoffice-')){
    const workspaceId=correlation.slice('nexoffice-'.length);
    const byWorkspace=await query<any>(`select * from workspace_billing where workspace_id=$1 limit 1`,[workspaceId]);
    if(byWorkspace.length)return byWorkspace[0];
  }
  return null;
}

async function mergeBillingMetadata(workspaceId:string,data:Record<string,any>){
  await query(`update workspace_billing set metadata=coalesce(metadata,'{}'::jsonb)||$2::jsonb,updated_at=now() where workspace_id=$1`,[workspaceId,JSON.stringify(data)]);
}

async function processWooviBillingEvent(payload:any,event:WooviBillingEvent){
  const billing=await billingForWebhook(payload);
  const workspaceId=billing?.workspace_id||null;
  const providerEventId=eventId(payload,event);
  const inserted=await query<any>(`insert into billing_events(workspace_id,provider,event_type,provider_event_id,payload) values($1,'woovi',$2,$3,$4::jsonb) on conflict(provider,provider_event_id) do nothing returning id`,[workspaceId,event,providerEventId,JSON.stringify(payload)]);
  if(!inserted.length)return {ok:true,duplicate:true,event};
  if(!billing){
    await query(`update billing_events set processed_at=now() where provider='woovi' and provider_event_id=$1`,[providerEventId]);
    return {ok:true,ignored:true,event,reason:'subscription_not_found'};
  }

  if(event==='PIX_AUTOMATIC_APPROVED'){
    await query(`update workspace_billing set status='active',activated_at=coalesce(activated_at,now()),current_period_started_at=coalesce(current_period_started_at,case when trial_ends_at>now() then trial_ends_at else now() end),current_period_ends_at=coalesce(current_period_ends_at,case when trial_ends_at>now() then trial_ends_at else now()+interval '1 month' end),metadata=(coalesce(metadata,'{}'::jsonb)-'pastDueAt')||$2::jsonb,updated_at=now() where workspace_id=$1`,[workspaceId,JSON.stringify({lastBillingEvent:event,lastBillingEventAt:new Date().toISOString()})]);
    await query(`update workspaces set status='active',plan='pro',updated_at=now() where id=$1`,[workspaceId]);
  }else if(event==='PIX_AUTOMATIC_REJECTED'){
    await query(`update workspace_billing set status=case when trial_ends_at>now() then 'trialing' else 'expired' end,metadata=coalesce(metadata,'{}'::jsonb)||$2::jsonb,updated_at=now() where workspace_id=$1`,[workspaceId,JSON.stringify({lastBillingEvent:event,lastBillingEventAt:new Date().toISOString()})]);
  }else if(event==='PIX_AUTOMATIC_COBR_COMPLETED'){
    const paidAt=payload?.dateGenerateCharge&&Number.isFinite(new Date(payload.dateGenerateCharge).getTime())?new Date(payload.dateGenerateCharge).toISOString():new Date().toISOString();
    await query(`update workspace_billing set status='active',activated_at=coalesce(activated_at,now()),current_period_started_at=$2::timestamptz,current_period_ends_at=$2::timestamptz+interval '1 month',metadata=(coalesce(metadata,'{}'::jsonb)-'pastDueAt')||$3::jsonb,updated_at=now() where workspace_id=$1`,[workspaceId,paidAt,JSON.stringify({lastBillingEvent:event,lastBillingEventAt:new Date().toISOString(),lastPaidInstallment:Number(payload?.installmentNumber||0)})]);
    await query(`update workspaces set status='active',plan='pro',updated_at=now() where id=$1`,[workspaceId]);
  }else if(event==='PIX_AUTOMATIC_COBR_REJECTED'){
    await mergeBillingMetadata(workspaceId,{pastDueAt:new Date().toISOString(),lastBillingEvent:event,lastBillingEventAt:new Date().toISOString(),failedInstallment:Number(payload?.installmentNumber||0)});
    await query(`update workspace_billing set status='past_due',updated_at=now() where workspace_id=$1`,[workspaceId]);
  }
  await query(`update billing_events set processed_at=now() where provider='woovi' and provider_event_id=$1`,[providerEventId]);
  return {ok:true,event,workspaceId,status:(await getBilling(workspaceId)).status};
}

export async function ensureWooviBillingWebhooks(){
  const {token,url}=webhookConfig();
  if(!token||!url)return {configured:false,created:0,existing:0,events:[] as string[]};
  wooviConfig();
  const listed=await woovi(`/api/v1/webhook?url=${encodeURIComponent(url)}`);
  const candidates=Array.isArray(listed)?listed:Array.isArray(listed?.webhooks)?listed.webhooks:Array.isArray(listed?.data)?listed.data:[];
  let created=0,existing=0;
  for(const event of WOOVI_BILLING_EVENTS){
    const found=candidates.some((item:any)=>String(item?.event||item?.webhook?.event||'')===event&&String(item?.url||item?.webhook?.url||'')===url);
    if(found){existing++;continue}
    try{
      await woovi('/api/v1/webhook?validate=false',{method:'POST',body:JSON.stringify({webhook:{name:`NexOffice Billing · ${event}`,event,url,authorization:token,isActive:true}})});
      created++;
    }catch(error:any){
      const message=String(error?.message||'').toLowerCase();
      if(message.includes('duplic')||message.includes('unique')||message.includes('already'))existing++;
      else throw error;
    }
  }
  return {configured:true,created,existing,events:[...WOOVI_BILLING_EVENTS],url};
}

export async function registerBillingRoutes(app:FastifyInstance){
  app.post('/v1/billing/webhooks/woovi',async(req,reply)=>{
    const {token}=webhookConfig();
    if(!token)return reply.code(503).send({error:'billing_webhook_not_configured'});
    const received=String(req.headers['x-openpix-authorization']||req.headers.authorization||'').trim();
    if(!received||!safeEqual(received,token))return reply.code(401).send({error:'invalid_webhook_authorization'});
    const payload=req.body as any;
    const parsed=z.object({event:z.string().min(1)}).passthrough().parse(payload);
    if(!WOOVI_BILLING_EVENTS.includes(parsed.event as WooviBillingEvent))return {ok:true,ignored:true,event:parsed.event};
    return processWooviBillingEvent(parsed,parsed.event as WooviBillingEvent);
  });

  app.get('/v1/billing/summary',async req=>{
    const ctx=await billingContext(req);
    return {...summary(await getBilling(ctx.workspaceId)),workspace:{id:ctx.workspaceId,name:ctx.workspaceName},user:{name:ctx.user.name,email:ctx.user.email}};
  });

  app.get('/v1/billing/provider-health',async req=>{
    await billingContext(req,true);
    return probeWooviPermissions();
  });

  app.post('/v1/billing/subscribe',async req=>{
    const ctx=await billingContext(req,true);
    const input=z.object({
      customer:z.object({
        name:z.string().min(2),taxID:z.string().min(11).max(18),email:z.string().email(),phone:z.string().min(10),
        address:z.object({zipcode:z.string().min(8),street:z.string().min(2),number:z.string().min(1),neighborhood:z.string().min(2),city:z.string().min(2),state:z.string().length(2),complement:z.string().optional()})
      })
    }).parse(req.body);
    const billing=await getBilling(ctx.workspaceId);
    if(billing.status==='active')return {...summary(billing),alreadyActive:true};
    const trialEnd=new Date(billing.trial_ends_at);
    const delayed=trialEnd.getTime()-Date.now()>=3*DAY;
    const journey=delayed?'ONLY_RECURRENCY':'PAYMENT_ON_APPROVAL';
    const dayGenerateCharge=delayed?trialEnd.toISOString():new Date().toISOString();
    const correlationID=`nexoffice-${ctx.workspaceId}`;
    const payload={
      name:'NexOffice Pro',value:Number(billing.price_minor),customer:input.customer,correlationID,comment:'NexOffice Pro',frequency:'MONTHLY',type:'PIX_RECURRING',
      pixRecurringOptions:{journey,retryPolicy:'THREE_RETRIES_7_DAYS'},dayGenerateCharge,dayDue:7
    };
    const data=await woovi('/api/v1/subscriptions',{method:'POST',body:JSON.stringify(payload)});
    const subscription=data?.subscription||data;
    const globalID=String(subscription?.globalID||'');
    if(!globalID)throw new ApiError(502,'billing_provider_error','A Woovi não retornou o identificador da assinatura.');
    const pixRecurring=subscription?.pixRecurring||{};
    await query(`update workspace_billing set status='pending_activation',provider_subscription_id=$2,metadata=coalesce(metadata,'{}'::jsonb)||$3::jsonb,updated_at=now() where workspace_id=$1`,[ctx.workspaceId,globalID,JSON.stringify({journey,recurrencyId:pixRecurring?.recurrencyId||null})]);
    const updated=await getBilling(ctx.workspaceId);
    return {...summary(updated),checkout:{provider:'woovi',globalID,journey,emv:pixRecurring?.emv||null,pixRecurringStatus:pixRecurring?.status||subscription?.status||null}};
  });

  app.post('/v1/billing/refresh',async req=>{
    const ctx=await billingContext(req,true);
    const billing=await getBilling(ctx.workspaceId);
    if(!billing.provider_subscription_id)throw new ApiError(400,'subscription_missing','Nenhuma assinatura Woovi foi iniciada para este workspace.');
    const data=await woovi(`/api/v1/subscriptions/${encodeURIComponent(billing.provider_subscription_id)}`);
    const subscription=data?.subscription||data;
    const pixStatus=String(subscription?.pixRecurring?.status||'').toUpperCase();
    const providerStatus=String(subscription?.status||'').toUpperCase();
    const approved=pixStatus==='APPROVED'||providerStatus==='APPROVED'||providerStatus==='ACTIVE';
    if(approved&&billing.status!=='past_due'){
      await query(`update workspace_billing set status='active',activated_at=coalesce(activated_at,now()),current_period_started_at=coalesce(current_period_started_at,case when trial_ends_at>now() then trial_ends_at else now() end),current_period_ends_at=coalesce(current_period_ends_at,case when trial_ends_at>now() then trial_ends_at else now()+interval '1 month' end),updated_at=now() where workspace_id=$1`,[ctx.workspaceId]);
      await query(`update workspaces set status='active',plan='pro',updated_at=now() where id=$1`,[ctx.workspaceId]);
    }
    const updated=await getBilling(ctx.workspaceId);
    return {...summary(updated),providerStatus,pixRecurringStatus:pixStatus};
  });

  app.post('/v1/billing/cancel',async req=>{
    const ctx=await billingContext(req,true);
    const billing=await getBilling(ctx.workspaceId);
    if(billing.status==='cancelled')return {...summary(billing),alreadyCancelled:true};
    if(!billing.provider_subscription_id)throw new ApiError(400,'subscription_missing','Nenhuma assinatura ativa foi encontrada para cancelar.');
    await woovi(`/api/v1/subscriptions/${encodeURIComponent(billing.provider_subscription_id)}/cancel`,{method:'PUT'});
    await query(`update workspace_billing set status='cancelled',cancelled_at=now(),updated_at=now() where workspace_id=$1`,[ctx.workspaceId]);
    const updated=await getBilling(ctx.workspaceId);
    return {...summary(updated),cancelled:true};
  });
}
