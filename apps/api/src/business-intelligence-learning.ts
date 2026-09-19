import {query} from './db.js';

const n=(v:unknown)=>Number(v||0);
const round=(v:number,d=2)=>{const p=10**d;return Math.round(v*p)/p};
const obj=(v:any):Record<string,any>=>v&&typeof v==='object'?v:{};

type ActionRow={
  id:string;workspace_id:string;signal_id?:string|null;rule_id?:string|null;task_id?:string|null;status:string;
  completed_at?:string|null;evaluation_due_at?:string|null;evaluated_at?:string|null;metric_key?:string|null;
  baseline_value?:number|string|null;desired_direction?:'up'|'down'|null;baseline_snapshot_id?:string|null;
};

async function hydrateActionBaselines(workspaceId?:string){
  const rows=await query<any>(`select a.id,a.workspace_id,a.signal_id,s.snapshot_id,s.evidence,r.id rule_id,r.metric_key,r.operator
    from intelligence_actions a
    join intelligence_signals s on s.id=a.signal_id
    left join intelligence_rules r on r.id=s.rule_id
    where ($1::uuid is null or a.workspace_id=$1) and (a.rule_id is null or a.metric_key is null or a.baseline_value is null or a.desired_direction is null or a.baseline_snapshot_id is null)
    limit 1000`,[workspaceId||null]);
  for(const row of rows){
    const evidence=obj(row.evidence);const raw=evidence.value??evidence.metricValue??null;const baseline=raw===null||raw===undefined?null:Number(raw);
    const direction=row.operator==='gte'||row.operator==='gt'?'down':row.operator==='lte'||row.operator==='lt'?'up':null;
    await query(`update intelligence_actions set rule_id=coalesce(rule_id,$2),baseline_snapshot_id=coalesce(baseline_snapshot_id,$3),metric_key=coalesce(metric_key,$4),baseline_value=coalesce(baseline_value,$5),desired_direction=coalesce(desired_direction,$6),evaluation_status=case when status='done' and evaluation_status is null then 'waiting' else evaluation_status end where id=$1`,[row.id,row.rule_id||null,row.snapshot_id||null,row.metric_key||evidence.metric||null,Number.isFinite(baseline as number)?baseline:null,direction]);
  }
}

async function syncTaskStatuses(workspaceId?:string){
  await query(`update intelligence_actions a set
      status=case when t.status='done' then 'done' when t.status='cancelled' then 'cancelled' else a.status end,
      completed_at=case when t.status='done' then coalesce(a.completed_at,t.completed_at,t.updated_at,now()) else a.completed_at end,
      evaluation_due_at=case when t.status='done' then coalesce(a.evaluation_due_at,coalesce(t.completed_at,t.updated_at,now())+interval '7 days') else a.evaluation_due_at end,
      evaluation_status=case when t.status='done' and a.evaluation_status is null then 'waiting' else a.evaluation_status end
    from tasks t where a.task_id=t.id and ($1::uuid is null or a.workspace_id=$1) and ((t.status='done' and a.status<>'done') or (t.status='cancelled' and a.status<>'cancelled') or (t.status='done' and a.evaluation_due_at is null))`,[workspaceId||null]);
}

async function observedMetric(action:ActionRow){
  if(!action.metric_key||!action.completed_at)return null;
  const metric=(await query<any>(`select value_numeric,observed_at from intelligence_metrics where workspace_id=$1 and metric_key=$2 and value_numeric is not null and observed_at>$3 order by observed_at desc limit 1`,[action.workspace_id,action.metric_key,action.completed_at]))[0];
  if(metric&&Number.isFinite(Number(metric.value_numeric)))return{value:Number(metric.value_numeric),at:metric.observed_at,source:'metric'};
  const snap=(await query<any>(`select metrics->>$2 value,as_of from intelligence_snapshots where workspace_id=$1 and as_of>$3 and metrics ? $2 order by as_of desc limit 1`,[action.workspace_id,action.metric_key,action.completed_at]))[0];
  if(snap&&Number.isFinite(Number(snap.value)))return{value:Number(snap.value),at:snap.as_of,source:'snapshot'};
  return null;
}

async function evaluateActionRow(action:ActionRow,force=false){
  if(action.status!=='done')return{...action,skipped:'not_done'};
  if(action.evaluated_at&&!force)return action;
  if(!force&&action.evaluation_due_at&&new Date(action.evaluation_due_at).getTime()>Date.now())return{...action,skipped:'waiting'};
  const baseline=Number(action.baseline_value);if(!Number.isFinite(baseline)||!action.metric_key||!action.desired_direction){
    return (await query<any>(`update intelligence_actions set evaluation_status='insufficient_data',evaluated_at=now(),effect_summary='Não havia indicador de referência suficiente para medir esta ação.' where id=$1 returning *`,[action.id]))[0];
  }
  const observed=await observedMetric(action);if(!observed){
    return (await query<any>(`update intelligence_actions set evaluation_status='insufficient_data',evaluated_at=now(),effect_summary='Ainda não há uma nova leitura comparável do indicador após a conclusão da ação.' where id=$1 returning *`,[action.id]))[0];
  }
  const delta=observed.value-baseline;const threshold=Math.max(Math.abs(baseline)*.05,1);let status:'improved'|'stable'|'worsened'='stable';
  if(action.desired_direction==='up'){if(delta>=threshold)status='improved';else if(delta<=-threshold)status='worsened'}
  else {if(delta<=-threshold)status='improved';else if(delta>=threshold)status='worsened'}
  const pct=baseline!==0?round(delta/Math.abs(baseline)*100):null;
  const label=status==='improved'?'melhorou':status==='worsened'?'piorou':'ficou estável';
  const summary=`Depois da ação, o indicador ${action.metric_key} ${label}: ${round(baseline)} → ${round(observed.value)}.`;
  return (await query<any>(`update intelligence_actions set evaluation_status=$2,observed_value=$3,effect_delta=$4,effect_pct=$5,effect_summary=$6,evaluated_at=now(),metadata=coalesce(metadata,'{}'::jsonb)||$7::jsonb where id=$1 returning *`,[action.id,status,observed.value,delta,pct,summary,JSON.stringify({evaluationSource:observed.source,observedAt:observed.at})]))[0];
}

export async function syncAndEvaluateIntelligenceActions(workspaceId?:string,force=false){
  await syncTaskStatuses(workspaceId);await hydrateActionBaselines(workspaceId);
  const actions=await query<ActionRow>(`select * from intelligence_actions where ($1::uuid is null or workspace_id=$1) and status='done' and (evaluated_at is null or $2::boolean=true) and ($2::boolean=true or evaluation_due_at is null or evaluation_due_at<=now()) order by completed_at asc limit 500`,[workspaceId||null,force]);
  let evaluated=0,improved=0,stable=0,worsened=0,insufficient=0;
  for(const action of actions){const result=await evaluateActionRow(action,force);if(result?.evaluated_at){evaluated++;if(result.evaluation_status==='improved')improved++;else if(result.evaluation_status==='stable')stable++;else if(result.evaluation_status==='worsened')worsened++;else if(result.evaluation_status==='insufficient_data')insufficient++}}
  return{evaluated,improved,stable,worsened,insufficient};
}

export async function evaluateIntelligenceAction(actionId:string,force=true){
  await syncTaskStatuses();await hydrateActionBaselines();
  const action=(await query<ActionRow>(`select * from intelligence_actions where id=$1`,[actionId]))[0];if(!action)return null;return evaluateActionRow(action,force);
}

async function createSuggestion(rule:any,type:'increase_weight'|'decrease_weight'|'review_recommendation',sample:number,confidence:number,evidence:Record<string,unknown>,suggested:Record<string,unknown>,rationale:string){
  const existing=(await query<any>(`select id from intelligence_rule_suggestions where source_rule_id=$1 and suggestion_type=$2 and status='pending' limit 1`,[rule.id,type]))[0];if(existing)return existing;
  return (await query<any>(`insert into intelligence_rule_suggestions(source_rule_id,rule_code,rule_version,suggestion_type,sample_size,confidence,evidence,current_config,suggested_config,rationale)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,[rule.id,rule.code,rule.version,type,sample,confidence,JSON.stringify(evidence),JSON.stringify({weight:Number(rule.weight),recommendation:rule.recommendation||null}),JSON.stringify(suggested),rationale]))[0];
}

export async function generateLearningSuggestions(){
  await query(`update intelligence_rule_suggestions s set status='stale',updated_at=now() from intelligence_rules r where s.source_rule_id=r.id and s.status='pending' and r.active=false`);
  const accuracy=await query<any>(`select r.*,count(o.id) filter(where o.verdict in ('confirmed','partial','not_confirmed'))::int reviewed,
      count(o.id) filter(where o.verdict='confirmed')::int confirmed,count(o.id) filter(where o.verdict='partial')::int partial,count(o.id) filter(where o.verdict='not_confirmed')::int not_confirmed
    from intelligence_rules r left join intelligence_signals s on s.rule_id=r.id left join intelligence_outcomes o on o.signal_id=s.id and o.occurred_at>=now()-interval '180 days'
    where r.active=true group by r.id`);
  let created=0;
  for(const rule of accuracy){const reviewed=n(rule.reviewed);if(reviewed<8)continue;const rate=(n(rule.confirmed)+n(rule.partial)*.5)/reviewed;const confidence=Math.min(.95,.55+reviewed/100);
    if(rate>=.75){const next=round(Number(rule.weight||1)*1.1,4);const r=await createSuggestion(rule,'increase_weight',reviewed,confidence,{confirmationRate:round(rate*100,1),confirmed:n(rule.confirmed),partial:n(rule.partial),notConfirmed:n(rule.not_confirmed)},{weight:next},`A regra confirmou ou confirmou parcialmente em ${round(rate*100,1)}% das revisões recentes. Vale testar um peso um pouco maior em uma nova versão.`);if(r?.id)created++}
    else if(rate<.4){const next=Math.max(0,round(Number(rule.weight||1)*.85,4));const r=await createSuggestion(rule,'decrease_weight',reviewed,confidence,{confirmationRate:round(rate*100,1),confirmed:n(rule.confirmed),partial:n(rule.partial),notConfirmed:n(rule.not_confirmed)},{weight:next},`A regra confirmou ou confirmou parcialmente em apenas ${round(rate*100,1)}% das revisões recentes. Vale reduzir seu peso e continuar observando.`);if(r?.id)created++}
  }
  const actionStats=await query<any>(`select r.*,count(a.id) filter(where a.evaluation_status in ('improved','stable','worsened'))::int evaluated,count(a.id) filter(where a.evaluation_status='improved')::int improved,count(a.id) filter(where a.evaluation_status='worsened')::int worsened
    from intelligence_rules r left join intelligence_actions a on a.rule_id=r.id and a.evaluated_at>=now()-interval '180 days' where r.active=true group by r.id`);
  for(const rule of actionStats){const evaluated=n(rule.evaluated);if(evaluated<6)continue;const rate=n(rule.improved)/evaluated;if(rate<.3){const confidence=Math.min(.9,.5+evaluated/100);const r=await createSuggestion(rule,'review_recommendation',evaluated,confidence,{improvementRate:round(rate*100,1),improved:n(rule.improved),worsened:n(rule.worsened)},{reviewRecommendation:true},`Menos de 30% das ações acompanhadas mostraram melhora no indicador. A regra pode até detectar bem o problema, mas a recomendação merece revisão.`);if(r?.id)created++}}
  return{created};
}

export async function getLearningOverview(){
  await syncAndEvaluateIntelligenceActions(undefined,false);
  const [summary,byRule,bySector,suggestions,recent]=await Promise.all([
    query<any>(`select count(*)::int actions,count(*) filter(where status='done')::int completed,count(*) filter(where evaluated_at is not null)::int evaluated,count(*) filter(where evaluation_status='improved')::int improved,count(*) filter(where evaluation_status='stable')::int stable,count(*) filter(where evaluation_status='worsened')::int worsened,count(*) filter(where evaluation_status='insufficient_data')::int insufficient,count(*) filter(where status='done' and evaluated_at is null)::int waiting from intelligence_actions where created_at>=now()-interval '180 days'`),
    query<any>(`select coalesce(r.code,a.source_key,'sem_regra') rule_code,max(r.title) title,max(r.version) rule_version,count(*)::int actions,count(*) filter(where a.evaluated_at is not null)::int evaluated,count(*) filter(where a.evaluation_status='improved')::int improved,count(*) filter(where a.evaluation_status='stable')::int stable,count(*) filter(where a.evaluation_status='worsened')::int worsened from intelligence_actions a left join intelligence_rules r on r.id=a.rule_id where a.created_at>=now()-interval '180 days' group by 1 order by actions desc limit 100`),
    query<any>(`select coalesce(p.sector,w.vertical::text,'general') sector,count(a.id)::int actions,count(a.id) filter(where a.evaluated_at is not null)::int evaluated,count(a.id) filter(where a.evaluation_status='improved')::int improved,count(a.id) filter(where a.evaluation_status='worsened')::int worsened from workspaces w left join business_profiles p on p.workspace_id=w.id left join intelligence_actions a on a.workspace_id=w.id and a.created_at>=now()-interval '180 days' where w.status<>'cancelled' group by 1 order by actions desc`),
    query<any>(`select s.*,r.title rule_title,r.sector,r.dimension,r.active rule_active from intelligence_rule_suggestions s join intelligence_rules r on r.id=s.source_rule_id where s.status='pending' order by s.confidence desc,s.sample_size desc,s.created_at desc`),
    query<any>(`select a.*,w.name company,r.code rule_code,r.version rule_version,r.title rule_title,t.status task_status from intelligence_actions a join workspaces w on w.id=a.workspace_id left join intelligence_rules r on r.id=a.rule_id left join tasks t on t.id=a.task_id order by a.created_at desc limit 100`)
  ]);
  const s=summary[0]||{};const evaluated=n(s.evaluated);return{summary:{...s,improvement_rate_pct:evaluated?round(n(s.improved)/evaluated*100,1):null},byRule,bySector,suggestions,recentActions:recent};
}

export async function applyLearningSuggestion(id:string,userId:string){
  const suggestion=(await query<any>(`select s.*,r.* from intelligence_rule_suggestions s join intelligence_rules r on r.id=s.source_rule_id where s.id=$1 and s.status='pending'`,[id]))[0];if(!suggestion)return null;if(!suggestion.active){await query(`update intelligence_rule_suggestions set status='stale',updated_at=now() where id=$1`,[id]);return{stale:true}}
  if(!['increase_weight','decrease_weight'].includes(suggestion.suggestion_type))return{requiresManualReview:true,suggestion};
  const suggested=obj(suggestion.suggested_config);const weight=Number(suggested.weight);if(!Number.isFinite(weight)||weight<0)return{invalid:true};
  const rule=(await query<any>(`with deactivated as(update intelligence_rules set active=false,updated_at=now() where code=$2 and active=true returning id)
    insert into intelligence_rules(code,version,active,sector,subsector,dimension,metric_key,operator,warning_value,critical_value,weight,title,message_template,recommendation,config,created_by)
    values($2,(select coalesce(max(version),0)+1 from intelligence_rules where code=$2),true,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'learning-approved') returning *`,[id,suggestion.rule_code,suggestion.sector,suggestion.subsector,suggestion.dimension,suggestion.metric_key,suggestion.operator,suggestion.warning_value,suggestion.critical_value,weight,suggestion.title,suggestion.message_template,suggestion.recommendation,suggestion.config]))[0];
  await query(`update intelligence_rule_suggestions set status='applied',reviewed_at=now(),reviewed_by=$2,updated_at=now() where id=$1`,[id,userId]);return{rule};
}

export async function dismissLearningSuggestion(id:string,userId:string){
  return (await query<any>(`update intelligence_rule_suggestions set status='dismissed',reviewed_at=now(),reviewed_by=$2,updated_at=now() where id=$1 and status='pending' returning *`,[id,userId]))[0]||null;
}
