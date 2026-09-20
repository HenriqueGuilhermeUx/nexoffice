import {query} from './db.js';
import {buildBusinessRadar} from './business-intelligence-depth.js';
import {buildWeeklyIntelligence} from './business-intelligence-weekly.js';
import {getBusinessKnowledge} from './business-knowledge.js';

const n=(v:unknown)=>Number(v||0);
const round=(v:number,d=1)=>{const p=10**d;return Math.round(v*p)/p};
const brl=(minor:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(minor/100);

function mondayStart(now=new Date()){
  const d=new Date(now);const day=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()-day);d.setUTCHours(0,0,0,0);return d;
}

export async function trackActivationJourney(workspaceId:string,recommendationKey:string,target:string,event:'shown'|'clicked',metadata:Record<string,unknown>={}){
  if(event==='shown')return (await query<any>(`insert into intelligence_activation_journeys(workspace_id,recommendation_key,target,first_shown_at,last_shown_at,shown_count,status,metadata)
    values($1,$2,$3,now(),now(),1,'shown',$4::jsonb)
    on conflict(workspace_id,recommendation_key) do update set target=excluded.target,last_shown_at=now(),shown_count=intelligence_activation_journeys.shown_count+1,metadata=intelligence_activation_journeys.metadata||excluded.metadata,updated_at=now()
    returning *`,[workspaceId,recommendationKey,target,JSON.stringify(metadata)]))[0];
  return (await query<any>(`insert into intelligence_activation_journeys(workspace_id,recommendation_key,target,first_shown_at,last_shown_at,shown_count,clicked_at,status,metadata)
    values($1,$2,$3,now(),now(),1,now(),'clicked',$4::jsonb)
    on conflict(workspace_id,recommendation_key) do update set target=excluded.target,clicked_at=coalesce(intelligence_activation_journeys.clicked_at,now()),status=case when intelligence_activation_journeys.first_value_at is not null then 'value' else 'clicked' end,metadata=intelligence_activation_journeys.metadata||excluded.metadata,updated_at=now()
    returning *`,[workspaceId,recommendationKey,target,JSON.stringify(metadata)]))[0];
}

export async function syncActivationJourneys(workspaceId:string){
  const [profile,row]=await Promise.all([
    query<any>(`select * from business_profiles where workspace_id=$1`,[workspaceId]),
    query<any>(`select
      (select count(*) from ledger_entries where workspace_id=$1)::int ledger_entries,
      (select count(*) from crm_contacts where workspace_id=$1)::int contacts,
      (select count(*) from crm_deals where workspace_id=$1)::int deals,
      (select count(*) from tasks where workspace_id=$1 and status<>'cancelled')::int tasks,
      (select count(*) from appointments where workspace_id=$1 and starts_at>=now()-interval '90 days' and status<>'cancelled')::int appointments_90,
      (select count(*) from appointments where workspace_id=$1 and starts_at>=now() and status<>'cancelled')::int future_appointments,
      (select count(*) from recurring_rules where workspace_id=$1 and active=true and direction='income')::int recurring_income_rules,
      (select count(*) from document_refs where workspace_id=$1)::int documents,
      (select count(distinct metric_key) from intelligence_metrics where workspace_id=$1 and source<>'derived')::int manual_metrics,
      (select count(*) from business_events where workspace_id=$1 and occurred_at>=now()-interval '30 days')::int events_30
    `,[workspaceId])
  ]);
  const p=profile[0]||{},r=row[0]||{};const profilePct=n(p.completeness_pct);const appointmentCount=n(r.appointments_90)+n(r.future_appointments);
  const operations=n(r.tasks)>0||appointmentCount>0||n(r.events_30)>=3;
  const sectorDepth=n(r.manual_metrics)>0||(Boolean(p.uses_agenda)&&appointmentCount>=3)||(Boolean(p.uses_contracts)&&n(r.documents)>0)||(Boolean(p.recurring_revenue)&&n(r.recurring_income_rules)>0);
  const satisfied:Record<string,boolean>={profile:profilePct>=70,customers:n(r.contacts)>0,finance:n(r.ledger_entries)>0,sales:n(r.deals)>0,agenda:appointmentCount>=3,documents:n(r.documents)>0,recurring:n(r.recurring_income_rules)>0,operations,sector:sectorDepth};
  let activated=0;
  for(const [key,done] of Object.entries(satisfied))if(done){const rows=await query<any>(`update intelligence_activation_journeys set first_value_at=coalesce(first_value_at,now()),status='value',updated_at=now() where workspace_id=$1 and recommendation_key=$2 and first_value_at is null returning id`,[workspaceId,key]);activated+=rows.length}
  return{activated,satisfied};
}

export async function getActivationAnalytics(workspaceId?:string){
  const [summary,byKey]=await Promise.all([
    query<any>(`select count(*)::int journeys,count(*) filter(where first_shown_at is not null)::int shown,count(*) filter(where clicked_at is not null)::int clicked,count(*) filter(where first_value_at is not null)::int value,
      round(avg(extract(epoch from(first_value_at-first_shown_at))/3600) filter(where first_value_at is not null and first_shown_at is not null),1) average_hours_to_value
      from intelligence_activation_journeys where ($1::uuid is null or workspace_id=$1)`,[workspaceId||null]),
    query<any>(`select recommendation_key,target,count(*)::int journeys,count(*) filter(where clicked_at is not null)::int clicked,count(*) filter(where first_value_at is not null)::int value,
      round(avg(extract(epoch from(first_value_at-first_shown_at))/3600) filter(where first_value_at is not null and first_shown_at is not null),1) average_hours_to_value
      from intelligence_activation_journeys where ($1::uuid is null or workspace_id=$1) group by recommendation_key,target order by journeys desc,recommendation_key`,[workspaceId||null])
  ]);
  const s=summary[0]||{},shown=n(s.shown),clicked=n(s.clicked),value=n(s.value);
  return{summary:{...s,click_rate_pct:shown?round(clicked/shown*100):null,value_rate_pct:shown?round(value/shown*100):null,clicked_to_value_pct:clicked?round(value/clicked*100):null},byKey:byKey.map(x=>({...x,click_rate_pct:n(x.journeys)?round(n(x.clicked)/n(x.journeys)*100):null,value_rate_pct:n(x.journeys)?round(n(x.value)/n(x.journeys)*100):null}))};
}

export async function getGlobalActivationAnalytics(){
  const base=await getActivationAnalytics();
  const bySector=await query<any>(`select coalesce(p.sector,w.vertical::text,'general') sector,count(j.id)::int journeys,count(j.id) filter(where j.clicked_at is not null)::int clicked,count(j.id) filter(where j.first_value_at is not null)::int value,
    round(avg(extract(epoch from(j.first_value_at-j.first_shown_at))/3600) filter(where j.first_value_at is not null),1) average_hours_to_value
    from workspaces w left join business_profiles p on p.workspace_id=w.id left join intelligence_activation_journeys j on j.workspace_id=w.id where w.status<>'cancelled' group by 1 order by journeys desc`);
  return{...base,bySector:bySector.map(x=>({...x,value_rate_pct:n(x.journeys)?round(n(x.value)/n(x.journeys)*100):null}))};
}

type PlanSeed={sourceType:string;sourceKey:string;signalId?:string|null;title:string;rationale:string;benefit:string;actionTarget:string;priority:number;dueDays:number;metricKey?:string|null;baselineValue?:number|null;metadata?:Record<string,unknown>};

function sourceKey(v:string){return v.toLowerCase().replace(/[^a-z0-9_.:-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,180)||'item'};

export async function buildSevenDayPlan(workspaceId:string){
  const [radar,knowledge,ops]=await Promise.all([
    buildBusinessRadar(workspaceId),getBusinessKnowledge(workspaceId),
    query<any>(`select
      (select count(*) from ledger_entries where workspace_id=$1 and direction='income' and (status='overdue' or(status='open' and due_at<now())))::int overdue_count,
      (select coalesce(sum(amount_minor),0) from ledger_entries where workspace_id=$1 and direction='income' and (status='overdue' or(status='open' and due_at<now())))::bigint overdue_minor,
      (select count(*) from crm_deals where workspace_id=$1 and stage not in ('won','lost') and updated_at<now()-interval '2 days')::int stale_deals,
      (select coalesce(sum(value_minor),0) from crm_deals where workspace_id=$1 and stage not in ('won','lost'))::bigint pipeline_minor,
      (select count(*) from tasks where workspace_id=$1 and status in ('todo','doing') and due_at<now())::int overdue_tasks,
      (select count(*) from appointments where workspace_id=$1 and status<>'cancelled' and starts_at>=now() and starts_at<now()+interval '7 days')::int appointments_7d
    `,[workspaceId])
  ]);
  const o=ops[0]||{},seeds:PlanSeed[]=[];
  for(const p of (radar.priorities||[]).slice(0,2))seeds.push({sourceType:p.signalId?'signal':'radar',sourceKey:String(p.signalId||sourceKey(`${p.dimension||'radar'}-${p.title}`)),signalId:p.signalId||null,title:String(p.title||'Prioridade do negócio'),rationale:String(p.reason||'Prioridade identificada pela leitura do negócio.'),benefit:String(p.action||'Resolver este ponto reduz pressão e melhora a previsibilidade.'),actionTarget:'task',priority:p.severity==='critical'?100:92,dueDays:p.severity==='critical'?2:4,metadata:{severity:p.severity||'attention',dimension:p.dimension||null}});
  if(n(o.overdue_count)>0)seeds.push({sourceType:'finance',sourceKey:'overdue-receivables',title:`Resolver ${n(o.overdue_count)} recebimento(s) vencido(s)`,rationale:`Há ${brl(n(o.overdue_minor))} vencido(s) agora.`,benefit:'Reduzir atraso melhora previsibilidade de caixa e diminui pressão financeira.',actionTarget:'finance',priority:96,dueDays:3});
  if(n(o.stale_deals)>0)seeds.push({sourceType:'crm',sourceKey:'stale-pipeline',title:`Retomar ${n(o.stale_deals)} oportunidade(s) sem movimento`,rationale:`Há negócios abertos sem atualização recente em um pipeline de ${brl(n(o.pipeline_minor))}.`,benefit:'Retomar conversas evita que receita futura fique parada no funil.',actionTarget:'crm',priority:88,dueDays:4});
  if(n(o.overdue_tasks)>0)seeds.push({sourceType:'operations',sourceKey:'overdue-tasks',title:`Destravar ${n(o.overdue_tasks)} tarefa(s) vencida(s)`,rationale:'Há trabalho importante que passou do prazo.',benefit:'Limpar pendências devolve ritmo para a operação e reduz acúmulo.',actionTarget:'agenda',priority:84,dueDays:3});
  const activationAction=(knowledge as any)?.activation?.actions?.[0];if(seeds.length<5&&activationAction)seeds.push({sourceType:'activation',sourceKey:String(activationAction.key),title:String(activationAction.title),rationale:String(activationAction.whyNow),benefit:String(activationAction.benefit),actionTarget:String(activationAction.target),priority:70,dueDays:7,metadata:{activation:true}});
  const chosen=seeds.sort((a,b)=>b.priority-a.priority).slice(0,5);const weekStart=mondayStart().toISOString().slice(0,10);
  const summary=chosen.length?`Nesta semana, concentre energia em ${chosen.length} movimento(s) que mais podem melhorar controle, previsibilidade e execução.`:'A operação está sem prioridade crítica nova. Mantenha a rotina e acompanhe a evolução.';
  const plan=(await query<any>(`insert into intelligence_7day_plans(workspace_id,week_start,summary,metadata) values($1,$2,$3,$4::jsonb)
    on conflict(workspace_id,week_start) do update set summary=excluded.summary,metadata=excluded.metadata,generated_at=now(),updated_at=now() returning *`,[workspaceId,weekStart,summary,JSON.stringify({model:'seven-day-plan-v1',radarScore:radar.score??null})]))[0];
  const activeKeys=chosen.map(x=>`${x.sourceType}:${x.sourceKey}`);
  await query(`update intelligence_7day_plan_items set status='superseded',updated_at=now() where plan_id=$1 and status='suggested' and not((source_type||':'||source_key)=any($2::text[]))`,[plan.id,activeKeys]);
  for(const seed of chosen){const dueAt=new Date(Date.now()+seed.dueDays*86400000).toISOString();await query(`insert into intelligence_7day_plan_items(plan_id,workspace_id,signal_id,source_type,source_key,title,rationale,benefit,action_target,priority,due_at,metric_key,baseline_value,metadata)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)
    on conflict(plan_id,source_type,source_key) do update set signal_id=coalesce(intelligence_7day_plan_items.signal_id,excluded.signal_id),title=excluded.title,rationale=excluded.rationale,benefit=excluded.benefit,action_target=excluded.action_target,priority=excluded.priority,due_at=case when intelligence_7day_plan_items.task_id is null then excluded.due_at else intelligence_7day_plan_items.due_at end,metadata=intelligence_7day_plan_items.metadata||excluded.metadata,updated_at=now()`,[plan.id,workspaceId,seed.signalId||null,seed.sourceType,seed.sourceKey,seed.title,seed.rationale,seed.benefit,seed.actionTarget,seed.priority,dueAt,seed.metricKey||null,seed.baselineValue??null,JSON.stringify(seed.metadata||{})])}
  await syncSevenDayPlanTasks(workspaceId);
  const items=await query<any>(`select * from intelligence_7day_plan_items where plan_id=$1 and status<>'superseded' order by priority desc,created_at asc`,[plan.id]);
  return{plan,items};
}

export async function syncSevenDayPlanTasks(workspaceId:string){
  await query(`update intelligence_7day_plan_items i set status=case when t.status='done' then 'done' when t.status='cancelled' then 'cancelled' else 'tracking' end,completed_at=case when t.status='done' then coalesce(i.completed_at,t.completed_at,t.updated_at,now()) else i.completed_at end,updated_at=now() from tasks t where i.task_id=t.id and i.workspace_id=$1 and i.status not in ('superseded')`,[workspaceId]);
}

export async function createSevenDayPlanTask(workspaceId:string,userId:string,itemId:string){
  const item=(await query<any>(`select * from intelligence_7day_plan_items where id=$1 and workspace_id=$2 and status<>'superseded'`,[itemId,workspaceId]))[0];if(!item)return null;
  if(item.task_id){const task=(await query<any>(`select * from tasks where id=$1 and workspace_id=$2`,[item.task_id,workspaceId]))[0]||null;return{item,task,existing:true}}
  const task=(await query<any>(`insert into tasks(workspace_id,title,description,status,priority,assigned_to,due_at,metadata) values($1,$2,$3,'todo',$4,$5,$6,$7::jsonb) returning *`,[workspaceId,`Plano 7 dias · ${item.title}`,`${item.rationale}\n\nResultado esperado: ${item.benefit}`,Number(item.priority)>=95?'critical':'high',userId,item.due_at,JSON.stringify({origin:'nexoffice_7day_plan',planItemId:item.id,sourceType:item.source_type,sourceKey:item.source_key})]))[0];
  const updated=(await query<any>(`update intelligence_7day_plan_items set task_id=$3,status='tracking',updated_at=now() where id=$1 and workspace_id=$2 returning *`,[item.id,workspaceId,task.id]))[0];
  if(item.signal_id)await query(`insert into intelligence_actions(workspace_id,signal_id,task_id,source_type,source_key,title,created_by,metadata) values($1,$2,$3,'signal',$2::text,$4,$5,$6::jsonb) on conflict(task_id) do nothing`,[workspaceId,item.signal_id,task.id,task.title,userId,JSON.stringify({origin:'seven_day_plan',planItemId:item.id})]);
  return{item:updated,task,existing:false};
}

export async function getClosedLoopHighlights(workspaceId:string){
  const rows=await query<any>(`select a.id,a.title,a.completed_at,a.evaluated_at,a.evaluation_status,a.metric_key,a.baseline_value,a.observed_value,a.effect_pct,a.effect_summary,t.title task_title,s.message signal_message,r.title rule_title
    from intelligence_actions a left join tasks t on t.id=a.task_id left join intelligence_signals s on s.id=a.signal_id left join intelligence_rules r on r.id=a.rule_id
    where a.workspace_id=$1 and a.evaluation_status in ('improved','stable','worsened') order by a.evaluated_at desc limit 8`,[workspaceId]);
  return rows.map(row=>({id:row.id,title:row.task_title||row.title,status:row.evaluation_status,metricKey:row.metric_key,baseline:row.baseline_value===null?null:Number(row.baseline_value),observed:row.observed_value===null?null:Number(row.observed_value),effectPct:row.effect_pct===null?null:Number(row.effect_pct),summary:row.effect_summary||null,signal:row.signal_message||row.rule_title||null,completedAt:row.completed_at,evaluatedAt:row.evaluated_at,note:'A comparação mostra o que aconteceu depois da ação; não prova, sozinha, que a ação causou a mudança.'}));
}

export async function getFounderCockpit(workspaceId:string){
  await syncActivationJourneys(workspaceId);const [weekly,plan,results,activation,ops]=await Promise.all([
    buildWeeklyIntelligence(workspaceId),buildSevenDayPlan(workspaceId),getClosedLoopHighlights(workspaceId),getActivationAnalytics(workspaceId),
    query<any>(`select
      coalesce(sum(amount_minor) filter(where direction='income' and status='paid' and coalesce(paid_at,updated_at)>=now()-interval '7 days'),0)::bigint income_7d,
      coalesce(sum(amount_minor) filter(where direction='expense' and status='paid' and coalesce(paid_at,updated_at)>=now()-interval '7 days'),0)::bigint expense_7d,
      coalesce(sum(amount_minor) filter(where direction='income' and (status='overdue' or(status='open' and due_at<now()))),0)::bigint overdue_minor,
      count(*) filter(where direction='income' and (status='overdue' or(status='open' and due_at<now())))::int overdue_count,
      (select coalesce(sum(value_minor),0) from crm_deals where workspace_id=$1 and stage not in ('won','lost'))::bigint pipeline_minor,
      (select count(*) from crm_deals where workspace_id=$1 and stage not in ('won','lost'))::int open_deals,
      (select count(*) from tasks where workspace_id=$1 and status in ('todo','doing') and due_at<now())::int overdue_tasks,
      (select count(*) from tasks where workspace_id=$1 and status in ('todo','doing') and due_at<=now()+interval '7 days')::int due_tasks_7d,
      (select count(*) from appointments where workspace_id=$1 and status<>'cancelled' and starts_at>=date_trunc('day',now()) and starts_at<date_trunc('day',now())+interval '1 day')::int appointments_today,
      (select count(*) from appointments where workspace_id=$1 and status<>'cancelled' and starts_at>=now() and starts_at<now()+interval '7 days')::int appointments_7d
      from ledger_entries where workspace_id=$1`,[workspaceId])
  ]);
  const o=ops[0]||{};return{generatedAt:new Date().toISOString(),health:{score:weekly.score,delta:weekly.scoreDelta,status:weekly.radar?.status||'learning',summary:weekly.brief?.summary||null},money:{income7dMinor:n(o.income_7d),expense7dMinor:n(o.expense_7d),overdueMinor:n(o.overdue_minor),overdueCount:n(o.overdue_count)},sales:{pipelineMinor:n(o.pipeline_minor),openDeals:n(o.open_deals)},operations:{overdueTasks:n(o.overdue_tasks),dueTasks7d:n(o.due_tasks_7d),appointmentsToday:n(o.appointments_today),appointments7d:n(o.appointments_7d)},changes:{wins:weekly.wins.slice(0,3),attention:weekly.attention.slice(0,4)},priorities:weekly.priorities,plan,results,activation,note:'O Founder Cockpit resume operacao, mudancas e proximas decisoes. Indices internos de risco nao sao expostos aqui.'};
}
