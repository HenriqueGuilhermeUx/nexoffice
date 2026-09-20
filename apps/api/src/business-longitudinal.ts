import {query} from './db.js';

export async function readCompanyLongitudinal(workspaceId:string){
  const [workspaceRows,health,risk,observations,signals,actions,briefs,metricQuality,eventCoverage]=await Promise.all([
    query<any>(`select w.id,w.name,w.vertical,w.status,w.created_at,p.sector,p.subsector,p.revenue_model,p.sells_products,p.sells_services,p.recurring_revenue,p.uses_agenda,p.uses_inventory,p.uses_contracts,p.employee_count,p.active_customers_estimate,p.primary_sales_channel,p.seasonality,p.main_dependency,p.completeness_pct,p.updated_at profile_updated_at from workspaces w left join business_profiles p on p.workspace_id=w.id where w.id=$1 limit 1`,[workspaceId]),
    query<any>(`select id,as_of,overall_score,finance_score,sales_score,customer_score,operation_score,resilience_score,knowledge_pct,metrics,model_version from intelligence_snapshots where workspace_id=$1 order by as_of desc limit 180`,[workspaceId]),
    query<any>(`select id,as_of,run_date,operational_stress_index,posture,trend,confidence,sector,ontology_versions,signal_summary,evidence,model_version from intelligence_risk_snapshots where workspace_id=$1 order by run_date desc,as_of desc limit 180`,[workspaceId]),
    query<any>(`select run_date,code,dimension,current_value,previous_value,delta_pct,signal_triggered,source,evidence,created_at,updated_at from intelligence_temporal_observations where workspace_id=$1 and run_date>=current_date-365 order by run_date desc,code`,[workspaceId]),
    query<any>(`select s.id,s.run_date,s.code,s.dimension,s.severity,s.title,s.what_changed,s.why_it_matters,s.recommendation,s.current_value,s.previous_value,s.delta_pct,s.horizon_days,s.confidence,s.evidence,s.active,s.resolved_at,o.sector ontology_sector,o.archetype ontology_archetype,o.version ontology_version,o.maturity ontology_maturity from intelligence_temporal_signals s left join sector_ontologies o on o.id=s.ontology_id where s.workspace_id=$1 and s.run_date>=current_date-365 order by s.run_date desc,case s.severity when 'critical' then 1 when 'attention' then 2 else 3 end,s.created_at desc`,[workspaceId]),
    query<any>(`select a.id,a.source_type,a.source_key,a.title,a.status,a.created_at,a.completed_at,a.evaluation_due_at,a.evaluated_at,a.evaluation_status,a.baseline_value,a.observed_value,a.effect_delta,a.effect_pct,a.effect_summary,a.metadata,t.id task_id,t.status task_status,t.priority task_priority,t.due_at task_due_at,t.completed_at task_completed_at from intelligence_actions a left join tasks t on t.id=a.task_id where a.workspace_id=$1 and a.created_at>=now()-interval '365 days' order by a.created_at desc`,[workspaceId]),
    query<any>(`select week_start,period_start,period_end,overall_score,score_delta,summary,wins,attention,priorities,metrics,sources,model_version,created_at from intelligence_weekly_briefs where workspace_id=$1 order by week_start desc limit 52`,[workspaceId]),
    query<any>(`select source,quality,count(*)::int observations,min(observed_at) first_observed_at,max(observed_at) last_observed_at,count(distinct metric_key)::int metrics from intelligence_metrics where workspace_id=$1 group by source,quality order by observations desc`,[workspaceId]),
    query<any>(`select count(*)::int events,min(occurred_at) first_event_at,max(occurred_at) last_event_at,count(distinct type)::int event_types from business_events where workspace_id=$1`,[workspaceId])
  ]);
  const workspace=workspaceRows[0]||null;if(!workspace)return null;
  const firstDates=[health.at(-1)?.as_of,risk.at(-1)?.run_date,observations.at(-1)?.run_date,eventCoverage[0]?.first_event_at].filter(Boolean).map((x:any)=>new Date(x).getTime()).filter(Number.isFinite);
  const latestDates=[health[0]?.as_of,risk[0]?.as_of,observations[0]?.updated_at,eventCoverage[0]?.last_event_at].filter(Boolean).map((x:any)=>new Date(x).getTime()).filter(Number.isFinite);
  const coverage={
    profileCompleteness:Number(workspace.completeness_pct||0),
    healthSnapshots:health.length,riskSnapshots:risk.length,observations:observations.length,signals:signals.length,actions:actions.length,weeklyBriefs:briefs.length,
    businessEvents:Number(eventCoverage[0]?.events||0),eventTypes:Number(eventCoverage[0]?.event_types||0),
    historyStartedAt:firstDates.length?new Date(Math.min(...firstDates)).toISOString():null,
    lastObservedAt:latestDates.length?new Date(Math.max(...latestDates)).toISOString():null
  };
  const timeline=[
    ...signals.map((x:any)=>({kind:'signal',at:x.run_date,title:x.title,detail:x.what_changed,status:x.severity,code:x.code})),
    ...actions.map((x:any)=>({kind:'action',at:x.created_at,title:x.title,detail:x.effect_summary||x.task_status||x.status,status:x.evaluation_status||x.status,code:x.source_key})),
    ...briefs.map((x:any)=>({kind:'brief',at:x.period_end||x.created_at,title:'Resumo semanal',detail:x.summary,status:x.score_delta>0?'improving':x.score_delta<0?'worsening':'stable',code:null}))
  ].sort((a:any,b:any)=>new Date(b.at).getTime()-new Date(a.at).getTime()).slice(0,250);
  return{
    workspace:{id:workspace.id,name:workspace.name,vertical:workspace.vertical,status:workspace.status,createdAt:workspace.created_at},
    profile:{sector:workspace.sector||workspace.vertical||'general',subsector:workspace.subsector,revenueModel:workspace.revenue_model,sellsProducts:workspace.sells_products,sellsServices:workspace.sells_services,recurringRevenue:workspace.recurring_revenue,usesAgenda:workspace.uses_agenda,usesInventory:workspace.uses_inventory,usesContracts:workspace.uses_contracts,employeeCount:workspace.employee_count,activeCustomersEstimate:workspace.active_customers_estimate,primarySalesChannel:workspace.primary_sales_channel,seasonality:workspace.seasonality,mainDependency:workspace.main_dependency,completenessPct:Number(workspace.completeness_pct||0),updatedAt:workspace.profile_updated_at},
    coverage,
    current:{health:health[0]||null,risk:risk[0]||null},
    healthHistory:health,
    riskHistory:risk,
    observations,
    signals,
    actions,
    weeklyBriefs:briefs,
    dataQuality:metricQuality,
    timeline,
    note:'Esta ficha é uma leitura longitudinal operacional e financeira do NexOffice. Não é decisão automática de crédito nem prova causal.'
  };
}
