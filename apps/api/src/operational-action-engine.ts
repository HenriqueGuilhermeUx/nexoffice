import {createHash} from 'node:crypto';
import {query} from './db.js';
import {buildOperationalPriorities,safeOperationalSignal} from './operational-signals.js';

function stableKey(vertical:string,periodKey:string,title:string){
  const normalized=title.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\d+(?:[.,]\d+)?/g,'#').replace(/\s+/g,' ').trim();
  return createHash('sha256').update(`${vertical}|${periodKey}|${normalized}`).digest('hex').slice(0,32);
}

export async function syncOperationalActions(workspaceId:string){
  const [workspace,rows]=await Promise.all([
    query<any>(`select vertical from workspaces where id=$1 limit 1`,[workspaceId]),
    query<any>(`select id,source_product,signal_type,period_start,period_end,metrics,dimensions,created_at from workspace_operational_signals where workspace_id=$1 order by period_end desc,created_at desc limit 80`,[workspaceId])
  ]);
  const vertical=String(workspace[0]?.vertical||'general');
  const signals=rows.map(safeOperationalSignal);
  if(!signals.length)return {created:0,updated:0,priorities:0};
  const priorities=buildOperationalPriorities(vertical,signals);
  const newestPeriod=signals.reduce((latest,current)=>new Date(current.period_end)>new Date(latest.period_end)?current:latest,signals[0]);
  const periodKey=newestPeriod.period_end.slice(0,10);
  let created=0,updated=0;

  for(const priority of priorities){
    const key=stableKey(vertical,periodKey,priority.title);
    const existing=(await query<any>(`select id,status from command_actions where workspace_id=$1 and metadata->>'operationalPriorityKey'=$2 limit 1`,[workspaceId,key]))[0];
    const metadata={source:'operational_signals',operationalPriorityKey:key,periodKey,privacy:'aggregate_only',vertical};
    const primaryAction={type:'operational.review',payload:{periodKey,vertical,target:priority.target}};
    if(existing){
      await query(`update command_actions set title=$3,summary=$4,priority=$5,primary_action=$6,metadata=metadata||$7::jsonb,updated_at=now() where id=$1 and workspace_id=$2`,[existing.id,workspaceId,priority.title,priority.detail,priority.level==='high'?'high':'normal',JSON.stringify(primaryAction),JSON.stringify(metadata)]);
      updated++;
      continue;
    }
    await query(`insert into command_actions(workspace_id,agent_role,title,summary,priority,status,autonomy,primary_action,secondary_actions,metadata) values($1,'controller',$2,$3,$4,'open','notify',$5,'[]'::jsonb,$6)`,[workspaceId,priority.title,priority.detail,priority.level==='high'?'high':'normal',JSON.stringify(primaryAction),JSON.stringify(metadata)]);
    created++;
  }
  return {created,updated,priorities:priorities.length,periodKey};
}
