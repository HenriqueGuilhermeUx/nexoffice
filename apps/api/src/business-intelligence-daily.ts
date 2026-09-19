import {query} from './db.js';
import {buildBusinessIntelligence} from './business-intelligence.js';
import {syncAndEvaluateIntelligenceActions} from './business-intelligence-learning.js';

export async function ensureDailyBusinessIntelligence(workspaceId:string){
  const claimed=await query<any>(`insert into intelligence_daily_state(workspace_id,last_snapshot_at) values($1,now())
    on conflict(workspace_id) do update set last_snapshot_at=excluded.last_snapshot_at
    where intelligence_daily_state.last_snapshot_at is null or intelligence_daily_state.last_snapshot_at<date_trunc('day',now())
    returning workspace_id`,[workspaceId]);
  if(!claimed.length){await syncAndEvaluateIntelligenceActions(workspaceId,false);return{created:false,reason:'already_captured_today'}}
  try{
    const result=await buildBusinessIntelligence(workspaceId);
    await syncAndEvaluateIntelligenceActions(workspaceId,false);
    return{created:true,snapshotId:result?.snapshot?.id||null};
  }catch(error){
    await query(`update intelligence_daily_state set last_snapshot_at=null where workspace_id=$1`,[workspaceId]);
    throw error;
  }
}
