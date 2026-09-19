import {query} from './db.js';
import {buildBusinessIntelligence} from './business-intelligence.js';

export async function ensureDailyBusinessIntelligence(workspaceId:string){
  const state=(await query<any>(`select last_snapshot_at from intelligence_daily_state where workspace_id=$1`,[workspaceId]))[0];
  const last=state?.last_snapshot_at?new Date(state.last_snapshot_at):null;const now=new Date();
  if(last&&last.getUTCFullYear()===now.getUTCFullYear()&&last.getUTCMonth()===now.getUTCMonth()&&last.getUTCDate()===now.getUTCDate())return{created:false};
  const result=await buildBusinessIntelligence(workspaceId);
  await query(`insert into intelligence_daily_state(workspace_id,last_snapshot_at) values($1,now()) on conflict(workspace_id) do update set last_snapshot_at=excluded.last_snapshot_at`,[workspaceId]);
  return{created:true,snapshotId:result?.snapshot?.id||null};
}
