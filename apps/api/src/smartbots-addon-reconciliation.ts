import {query} from './db.js';
import {smartBotsAddonRequest} from './integration-runtime.js';

const DAY=86_400_000;

type Row={
  workspace_id:string;
  entitlement_status:string;
  valid_until:string|null;
  billing_status:string|null;
  current_period_ends_at:string|null;
  billing_metadata:any;
  workspace_status:string|null;
  bot_id:string|null;
};

function asObject(value:any):Record<string,any>{if(!value)return{};if(typeof value==='object')return value;try{return JSON.parse(String(value))}catch{return{}}}
function eligible(row:Row){
  if(String(row.workspace_status||'active')==='suspended')return false;
  const status=String(row.billing_status||'').toLowerCase();const now=Date.now();
  if(status==='active'||status==='exempt')return true;
  if(status==='cancelled'&&row.current_period_ends_at&&new Date(row.current_period_ends_at).getTime()>now)return true;
  if(status==='past_due'){
    const meta=asObject(row.billing_metadata);const pastDueAt=meta.pastDueAt?new Date(String(meta.pastDueAt)).getTime():0;
    return pastDueAt>0&&pastDueAt+7*DAY>now;
  }
  return false;
}

export async function reconcileSmartBotsAddonEntitlements(){
  const rows=await query<Row>(`select e.workspace_id,e.status entitlement_status,e.valid_until,b.status billing_status,b.current_period_ends_at,b.metadata billing_metadata,w.status workspace_status,i.external_account_ref bot_id
    from entitlements e
    join workspaces w on w.id=e.workspace_id
    left join workspace_billing b on b.workspace_id=e.workspace_id
    left join integrations i on i.workspace_id=e.workspace_id and i.provider='smartbots'
    where e.capability='addon.smartbots' and e.source='nexoffice'`);
  let activated=0,paused=0,errors=0,unchanged=0;
  for(const row of rows){
    const isEligible=eligible(row);const botId=String(row.bot_id||'').trim();
    if(!botId){unchanged++;continue}
    try{
      const remote=await smartBotsAddonRequest(row.workspace_id,'sync',{eligible:isEligible,existingBotId:botId});
      if(!remote.ok)throw new Error(String(remote.error||'smartbots_addon_sync_failed'));
      if(isEligible){
        const trialEnd=row.valid_until?new Date(row.valid_until).getTime():0;
        const nextStatus=trialEnd>Date.now()?'trial':'active';
        if(row.entitlement_status!==nextStatus){await query(`update entitlements set status=$2,updated_at=now() where workspace_id=$1 and capability='addon.smartbots' and source='nexoffice'`,[row.workspace_id,nextStatus]);activated++}else unchanged++;
        await query(`update integrations set status='connected',last_error=null,updated_at=now() where workspace_id=$1 and provider='smartbots'`,[row.workspace_id]);
      }else{
        if(row.entitlement_status!=='paused'){await query(`update entitlements set status='paused',updated_at=now() where workspace_id=$1 and capability='addon.smartbots' and source='nexoffice'`,[row.workspace_id]);paused++}else unchanged++;
        await query(`update integrations set status='disconnected',last_error='nexoffice_subscription_ineligible',updated_at=now() where workspace_id=$1 and provider='smartbots'`,[row.workspace_id]);
      }
    }catch(error){
      errors++;
      await query(`update integrations set last_error=$2,updated_at=now() where workspace_id=$1 and provider='smartbots'`,[row.workspace_id,`addon_reconciliation:${error instanceof Error?error.message:String(error)}`.slice(0,1000)]).catch(()=>null);
    }
  }
  return {scanned:rows.length,activated,paused,unchanged,errors};
}
