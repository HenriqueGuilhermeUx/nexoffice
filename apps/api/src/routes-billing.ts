import type {FastifyInstance,FastifyRequest} from 'fastify';
import {z} from 'zod';
import {ApiError,authenticate} from './auth.js';
import {query} from './db.js';

const DAY=86_400_000;

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

function summary(row:any){
  const now=Date.now();
  const trialEnd=new Date(row.trial_ends_at).getTime();
  const periodEnd=row.current_period_ends_at?new Date(row.current_period_ends_at).getTime():0;
  const trialRemainingMs=Math.max(0,trialEnd-now);
  const trialDaysRemaining=row.status==='trialing'?Math.max(0,Math.ceil(trialRemainingMs/DAY)):0;
  const cancelledPaidThrough=row.status==='cancelled'&&periodEnd>now;
  const access=row.status==='active'||row.status==='exempt'||cancelledPaidThrough||(row.status==='trialing'&&trialRemainingMs>0);
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
    billingConfigured:String(process.env.NEXOFFICE_BILLING_ENABLED||'false').toLowerCase()==='true'&&Boolean(process.env.WOOVI_APP_ID)
  };
}

function wooviConfig(){
  const appId=String(process.env.WOOVI_APP_ID||'');
  const enabled=String(process.env.NEXOFFICE_BILLING_ENABLED||'false').toLowerCase()==='true';
  if(!enabled||!appId)throw new ApiError(503,'billing_not_configured','Cobrança ainda não foi habilitada neste ambiente.');
  return {appId,base:String(process.env.WOOVI_API_BASE||'https://api.woovi.com').replace(/\/$/,'')};
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
  return {
    provider:'woovi',
    configured:true,
    reachable:true,
    subscriptionReadAuthorized:true,
    subscriptionCancelAuthorized:true
  };
}

export async function registerBillingRoutes(app:FastifyInstance){
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
    await query(`update workspace_billing set status='pending_activation',provider_subscription_id=$2,metadata=$3,updated_at=now() where workspace_id=$1`,[ctx.workspaceId,globalID,JSON.stringify({journey,recurrencyId:pixRecurring?.recurrencyId||null})]);
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
    if(approved){
      await query(`update workspace_billing set status='active',activated_at=coalesce(activated_at,now()),current_period_started_at=coalesce(current_period_started_at,now()),current_period_ends_at=coalesce(current_period_ends_at,now()+interval '1 month'),updated_at=now() where workspace_id=$1`,[ctx.workspaceId]);
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
