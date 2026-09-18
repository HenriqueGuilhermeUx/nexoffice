import {createHash} from 'node:crypto';
import {query} from './db.js';

type BillingRow={
  workspace_id:string;
  status:string;
  trial_ends_at:string;
  provider_subscription_id:string;
  current_period_ends_at?:string|null;
  metadata?:Record<string,unknown>|string|null;
};

type SyncResult={
  configured:boolean;
  scanned:number;
  updated:number;
  errors:number;
  details:Array<{workspaceId:string;subscriptionId:string;status:string;changed:boolean;error?:string}>;
};

const enabled=()=>String(process.env.NEXOFFICE_BILLING_ENABLED||'false').toLowerCase()==='true'&&Boolean(String(process.env.WOOVI_APP_ID||'').trim());

function config(){
  return {
    appId:String(process.env.WOOVI_APP_ID||'').trim(),
    base:String(process.env.WOOVI_API_BASE||'https://api.woovi.com').replace(/\/$/,'')
  };
}

async function woovi(path:string){
  const {appId,base}=config();
  const response=await fetch(`${base}${path}`,{
    headers:{authorization:appId,accept:'application/json'},
    signal:AbortSignal.timeout(12_000)
  });
  const body=await response.json().catch(()=>({} as any)) as any;
  if(!response.ok)throw new Error(String(body?.message||body?.error||`Woovi respondeu ${response.status}`));
  return body;
}

function metadataOf(row:BillingRow){
  if(!row.metadata)return {} as Record<string,any>;
  if(typeof row.metadata==='object')return row.metadata as Record<string,any>;
  try{return JSON.parse(String(row.metadata)) as Record<string,any>}catch{return {}}
}

function statusOf(value:unknown){return String(value||'').trim().toUpperCase()}

function validDate(value:unknown){
  const date=new Date(String(value||''));
  return Number.isFinite(date.getTime())?date.toISOString():new Date().toISOString();
}

function pollingEventId(kind:string,subscriptionId:string,payload:any){
  return createHash('sha256').update(JSON.stringify({kind,subscriptionId,payload})).digest('hex');
}

async function recordSnapshot(workspaceId:string,kind:string,subscriptionId:string,payload:any){
  const id=pollingEventId(kind,subscriptionId,payload);
  const inserted=await query<{id:string}>(`insert into billing_events(workspace_id,provider,event_type,provider_event_id,payload,processed_at) values($1,'woovi',$2,$3,$4::jsonb,now()) on conflict(provider,provider_event_id) do nothing returning id`,[workspaceId,kind,id,JSON.stringify(payload)]);
  return inserted.length>0;
}

async function activateFromMandate(row:BillingRow,pixStatus:string,providerStatus:string){
  if(row.status==='cancelled'||row.status==='past_due')return false;
  const approved=pixStatus==='APPROVED'||providerStatus==='APPROVED'||providerStatus==='ACTIVE';
  if(!approved)return false;
  await query(`update workspace_billing set status='active',activated_at=coalesce(activated_at,now()),current_period_started_at=coalesce(current_period_started_at,case when trial_ends_at>now() then trial_ends_at else now() end),current_period_ends_at=coalesce(current_period_ends_at,case when trial_ends_at>now() then trial_ends_at else now()+interval '1 month' end),metadata=(coalesce(metadata,'{}'::jsonb)-'pastDueAt')||$2::jsonb,updated_at=now() where workspace_id=$1`,[row.workspace_id,JSON.stringify({lastBillingSyncAt:new Date().toISOString(),lastProviderStatus:providerStatus,lastPixRecurringStatus:pixStatus})]);
  await query(`update workspaces set status='active',plan='pro',updated_at=now() where id=$1`,[row.workspace_id]);
  return row.status!=='active';
}

async function deactivateFromMandate(row:BillingRow,pixStatus:string,providerStatus:string){
  const mandateEnded=['REJECTED','CANCELED','CANCELLED'].includes(pixStatus)||providerStatus==='INACTIVE';
  if(!mandateEnded)return {changed:false,terminal:false};
  if(row.status==='cancelled')return {changed:false,terminal:true};
  if(row.status==='active'||row.status==='past_due'){
    await query(`update workspace_billing set status='cancelled',cancelled_at=coalesce(cancelled_at,now()),metadata=coalesce(metadata,'{}'::jsonb)||$2::jsonb,updated_at=now() where workspace_id=$1`,[row.workspace_id,JSON.stringify({lastBillingSyncAt:new Date().toISOString(),lastProviderStatus:providerStatus,lastPixRecurringStatus:pixStatus,cancelSource:'provider_sync'})]);
  }else{
    await query(`update workspace_billing set status=case when trial_ends_at>now() then 'trialing' else 'expired' end,metadata=coalesce(metadata,'{}'::jsonb)||$2::jsonb,updated_at=now() where workspace_id=$1`,[row.workspace_id,JSON.stringify({lastBillingSyncAt:new Date().toISOString(),lastProviderStatus:providerStatus,lastPixRecurringStatus:pixStatus})]);
  }
  return {changed:true,terminal:true};
}

async function markProviderExpired(row:BillingRow,providerStatus:string){
  if(providerStatus!=='EXPIRED'||row.status==='cancelled')return false;
  const metadata=metadataOf(row);
  const pastDueAt=metadata.pastDueAt||new Date().toISOString();
  await query(`update workspace_billing set status=case when status='active' or status='past_due' then 'past_due' else 'expired' end,metadata=coalesce(metadata,'{}'::jsonb)||$2::jsonb,updated_at=now() where workspace_id=$1`,[row.workspace_id,JSON.stringify({pastDueAt,lastBillingSyncAt:new Date().toISOString(),lastProviderStatus:providerStatus})]);
  return row.status!=='past_due'&&row.status!=='expired';
}

function latestInstallment(data:any){
  const items=Array.isArray(data?.installments)?data.installments:Array.isArray(data?.data)?data.data:[];
  if(!items.length)return null;
  return [...items].sort((a:any,b:any)=>Number(b?.installmentNumber||0)-Number(a?.installmentNumber||0))[0] as any;
}

async function syncInstallment(row:BillingRow,subscriptionId:string){
  const data=await woovi(`/api/v1/subscriptions/${encodeURIComponent(subscriptionId)}/installments`);
  const installment=latestInstallment(data);
  if(!installment)return false;
  const installmentStatus=statusOf(installment?.status);
  const cobrStatus=statusOf(installment?.cobr?.status);
  const installmentId=String(installment?.globalID||installment?.cobr?.installmentId||installment?.installmentNumber||'latest');
  const snapshot={installmentId,installmentNumber:Number(installment?.installmentNumber||0),installmentStatus,cobrStatus};
  const fresh=await recordSnapshot(row.workspace_id,'WOOVI_POLL_INSTALLMENT',subscriptionId,snapshot);
  if(!fresh)return false;

  const paid=installmentStatus==='COMPLETED'||cobrStatus==='CONCLUDED';
  const rejected=['EXPIRED','CANCELED','CANCELLED'].includes(installmentStatus)||['REJECTED','CANCELED','CANCELLED'].includes(cobrStatus);
  if(paid&&row.status!=='cancelled'){
    const paidAt=validDate(installment?.dateGenerateCharge||installment?.createdAt);
    await query(`update workspace_billing set status='active',activated_at=coalesce(activated_at,now()),current_period_started_at=$2::timestamptz,current_period_ends_at=$2::timestamptz+interval '1 month',metadata=(coalesce(metadata,'{}'::jsonb)-'pastDueAt')||$3::jsonb,updated_at=now() where workspace_id=$1`,[row.workspace_id,paidAt,JSON.stringify({lastBillingSyncAt:new Date().toISOString(),lastSyncedInstallment:installmentId,lastPaidInstallment:Number(installment?.installmentNumber||0),lastInstallmentStatus:installmentStatus,lastCobrStatus:cobrStatus})]);
    await query(`update workspaces set status='active',plan='pro',updated_at=now() where id=$1`,[row.workspace_id]);
    return true;
  }
  if(rejected&&row.status!=='cancelled'){
    const metadata=metadataOf(row);
    const pastDueAt=metadata.pastDueAt||new Date().toISOString();
    await query(`update workspace_billing set status='past_due',metadata=coalesce(metadata,'{}'::jsonb)||$2::jsonb,updated_at=now() where workspace_id=$1`,[row.workspace_id,JSON.stringify({pastDueAt,lastBillingSyncAt:new Date().toISOString(),lastSyncedInstallment:installmentId,failedInstallment:Number(installment?.installmentNumber||0),lastInstallmentStatus:installmentStatus,lastCobrStatus:cobrStatus})]);
    return row.status!=='past_due';
  }
  await query(`update workspace_billing set metadata=coalesce(metadata,'{}'::jsonb)||$2::jsonb,updated_at=now() where workspace_id=$1`,[row.workspace_id,JSON.stringify({lastBillingSyncAt:new Date().toISOString(),lastSyncedInstallment:installmentId,lastInstallmentStatus:installmentStatus,lastCobrStatus:cobrStatus})]);
  return false;
}

async function syncOne(row:BillingRow){
  const subscriptionId=String(row.provider_subscription_id||'').trim();
  const data=await woovi(`/api/v1/subscriptions/${encodeURIComponent(subscriptionId)}`);
  const subscription=data?.subscription||data;
  const pixStatus=statusOf(subscription?.pixRecurring?.status);
  const providerStatus=statusOf(subscription?.status);
  const fresh=await recordSnapshot(row.workspace_id,'WOOVI_POLL_SUBSCRIPTION',subscriptionId,{pixStatus,providerStatus});
  let changed=false;
  if(fresh){
    const ended=await deactivateFromMandate(row,pixStatus,providerStatus);
    changed=changed||ended.changed;
    if(ended.terminal)return {changed,status:ended.changed?'cancelled':row.status};
    changed=(await activateFromMandate(row,pixStatus,providerStatus))||changed;
    changed=(await markProviderExpired(row,providerStatus))||changed;
  }else if(['REJECTED','CANCELED','CANCELLED'].includes(pixStatus)||providerStatus==='INACTIVE'){
    return {changed:false,status:row.status};
  }

  const refreshed=(await query<BillingRow>(`select workspace_id,status,trial_ends_at,provider_subscription_id,current_period_ends_at,metadata from workspace_billing where workspace_id=$1 limit 1`,[row.workspace_id]))[0]||row;
  if(refreshed.status==='cancelled')return {changed,status:'cancelled'};
  changed=(await syncInstallment(refreshed,subscriptionId))||changed;
  const final=(await query<{status:string}>(`select status from workspace_billing where workspace_id=$1 limit 1`,[row.workspace_id]))[0];
  return {changed,status:final?.status||refreshed.status};
}

export async function reconcileWooviBillingSubscriptions():Promise<SyncResult>{
  if(!enabled())return {configured:false,scanned:0,updated:0,errors:0,details:[]};
  const rows=await query<BillingRow>(`select workspace_id,status,trial_ends_at,provider_subscription_id,current_period_ends_at,metadata from workspace_billing where provider='woovi' and provider_subscription_id is not null and status in ('trialing','pending_activation','active','past_due','expired') order by updated_at asc limit 200`);
  const result:SyncResult={configured:true,scanned:rows.length,updated:0,errors:0,details:[]};
  for(const row of rows){
    try{
      const synced=await syncOne(row);
      if(synced.changed)result.updated++;
      result.details.push({workspaceId:row.workspace_id,subscriptionId:row.provider_subscription_id,status:synced.status,changed:synced.changed});
    }catch(error){
      result.errors++;
      result.details.push({workspaceId:row.workspace_id,subscriptionId:row.provider_subscription_id,status:row.status,changed:false,error:error instanceof Error?error.message:String(error)});
    }
  }
  return result;
}
