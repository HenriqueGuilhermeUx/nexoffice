import {query} from './db.js';
import {buildFinancialIntelligence} from './financial-intelligence.js';

export async function ensureDailyFinancialIntelligence(workspaceId:string){
  const claimed=await query<any>(`insert into finance_daily_state(workspace_id,last_snapshot_at) values($1,now()) on conflict(workspace_id) do update set last_snapshot_at=excluded.last_snapshot_at where finance_daily_state.last_snapshot_at is null or finance_daily_state.last_snapshot_at<date_trunc('day',now()) returning workspace_id`,[workspaceId]);
  if(!claimed.length)return {created:false,reason:'already_captured_today'};
  try{
    const result=await buildFinancialIntelligence(workspaceId);
    return {created:true,snapshotId:result?.snapshot?.id||null};
  }catch(error){
    await query(`update finance_daily_state set last_snapshot_at=null where workspace_id=$1`,[workspaceId]);
    throw error;
  }
}
