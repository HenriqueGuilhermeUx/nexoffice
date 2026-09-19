import {query} from './db.js';
import {buildFinancialIntelligence,readFinancialIntelligence} from './financial-intelligence.js';

const n=(v:any)=>Number(v||0);
const round=(v:number,d=1)=>{const p=10**d;return Math.round(v*p)/p};
const clamp=(v:number,min=0,max=100)=>Math.max(min,Math.min(max,Math.round(v)));
const asObject=(v:any):Record<string,any>=>v&&typeof v==='object'?v:{};

export type BusinessProfileInput={
  sector?:string;subsector?:string|null;revenueModel?:string;sellsProducts?:boolean;sellsServices?:boolean;recurringRevenue?:boolean;
  usesAgenda?:boolean;usesInventory?:boolean;usesContracts?:boolean;employeeCount?:number|null;activeCustomersEstimate?:number|null;
  primarySalesChannel?:string|null;seasonality?:string|null;mainDependency?:string|null;notes?:string|null;metadata?:Record<string,unknown>
};

type Rule={id:string;code:string;version:number;sector:string;subsector?:string|null;dimension:string;metric_key:string;operator:'gt'|'gte'|'lt'|'lte';warning_value:any;critical_value:any;weight:any;title:string;message_template:string;recommendation?:string|null};
type Signal={ruleId?:string;code:string;dimension:string;severity:'info'|'attention'|'critical';title:string;message:string;whyItMatters?:string;recommendation?:string;evidence:Record<string,unknown>};

const profileFields=['sector','subsector','revenue_model','sells_products','sells_services','recurring_revenue','uses_agenda','uses_inventory','uses_contracts','employee_count','active_customers_estimate','primary_sales_channel','seasonality','main_dependency'];
function completeness(profile:any){
  if(!profile)return 0;
  let filled=0;
  for(const key of profileFields){const v=profile[key];if(typeof v==='boolean'||(v!==null&&v!==undefined&&String(v).trim()!==''))filled++}
  return clamp(filled/profileFields.length*100);
}

export async function getBusinessProfile(workspaceId:string){
  const existing=(await query<any>(`select * from business_profiles where workspace_id=$1`,[workspaceId]))[0];
  if(existing)return existing;
  const workspace=(await query<any>(`select vertical from workspaces where id=$1`,[workspaceId]))[0];
  const sector=String(workspace?.vertical||'general');
  return (await query<any>(`insert into business_profiles(workspace_id,sector,revenue_model,sells_services,uses_agenda,completeness_pct)
    values($1,$2,'mixed',true,$3,0)
    on conflict(workspace_id) do update set workspace_id=excluded.workspace_id
    returning *`,[workspaceId,sector,sector==='health']))[0];
}

export async function upsertBusinessProfile(workspaceId:string,input:BusinessProfileInput){
  const current=await getBusinessProfile(workspaceId);
  const next={
    sector:String(input.sector??current.sector??'general').trim().toLowerCase()||'general',
    subsector:input.subsector===undefined?current.subsector:input.subsector,
    revenue_model:String(input.revenueModel??current.revenue_model??'mixed').trim().toLowerCase()||'mixed',
    sells_products:input.sellsProducts??current.sells_products??false,
    sells_services:input.sellsServices??current.sells_services??true,
    recurring_revenue:input.recurringRevenue??current.recurring_revenue??false,
    uses_agenda:input.usesAgenda??current.uses_agenda??false,
    uses_inventory:input.usesInventory??current.uses_inventory??false,
    uses_contracts:input.usesContracts??current.uses_contracts??false,
    employee_count:input.employeeCount===undefined?current.employee_count:input.employeeCount,
    active_customers_estimate:input.activeCustomersEstimate===undefined?current.active_customers_estimate:input.activeCustomersEstimate,
    primary_sales_channel:input.primarySalesChannel===undefined?current.primary_sales_channel:input.primarySalesChannel,
    seasonality:input.seasonality===undefined?current.seasonality:input.seasonality,
    main_dependency:input.mainDependency===undefined?current.main_dependency:input.mainDependency,
    notes:input.notes===undefined?current.notes:input.notes,
    metadata:{...asObject(current.metadata),...asObject(input.metadata)}
  };
  const pct=completeness(next);
  return (await query<any>(`insert into business_profiles(workspace_id,sector,subsector,revenue_model,sells_products,sells_services,recurring_revenue,uses_agenda,uses_inventory,uses_contracts,employee_count,active_customers_estimate,primary_sales_channel,seasonality,main_dependency,notes,metadata,completeness_pct)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
    on conflict(workspace_id) do update set sector=excluded.sector,subsector=excluded.subsector,revenue_model=excluded.revenue_model,sells_products=excluded.sells_products,sells_services=excluded.sells_services,recurring_revenue=excluded.recurring_revenue,uses_agenda=excluded.uses_agenda,uses_inventory=excluded.uses_inventory,uses_contracts=excluded.uses_contracts,employee_count=excluded.employee_count,active_customers_estimate=excluded.active_customers_estimate,primary_sales_channel=excluded.primary_sales_channel,seasonality=excluded.seasonality,main_dependency=excluded.main_dependency,notes=excluded.notes,metadata=excluded.metadata,completeness_pct=excluded.completeness_pct,updated_at=now()
    returning *`,[workspaceId,next.sector,next.subsector,next.revenue_model,next.sells_products,next.sells_services,next.recurring_revenue,next.uses_agenda,next.uses_inventory,next.uses_contracts,next.employee_count,next.active_customers_estimate,next.primary_sales_channel,next.seasonality,next.main_dependency,next.notes,JSON.stringify(next.metadata),pct]))[0];
}

export async function recordIntelligenceMetric(workspaceId:string,input:{metricKey:string;valueNumeric?:number|null;valueText?:string|null;unit?:string|null;source?:string;sourceReference?:string|null;quality?:string;confidence?:number;periodStart?:string|null;periodEnd?:string|null;observedAt?:string;metadata?:Record<string,unknown>}){
  const source=input.source||'client_reported';
  const quality=input.quality||'estimated';
  const confidence=input.confidence??(source==='verified_transaction'?1:source==='integrated_system'?0.95:source==='imported_document'?0.8:0.6);
  return (await query<any>(`insert into intelligence_metrics(workspace_id,metric_key,value_numeric,value_text,unit,source,source_reference,quality,confidence,period_start,period_end,observed_at,metadata)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,coalesce($12::timestamptz,now()),$13) returning *`,[workspaceId,input.metricKey,input.valueNumeric??null,input.valueText??null,input.unit??null,source,input.sourceReference??null,quality,confidence,input.periodStart??null,input.periodEnd??null,input.observedAt??null,JSON.stringify(input.metadata||{})]))[0];
}

function ruleSeverity(rule:Rule,value:number):'attention'|'critical'|null{
  const warning=rule.warning_value===null||rule.warning_value===undefined?null:Number(rule.warning_value);
  const critical=rule.critical_value===null||rule.critical_value===undefined?null:Number(rule.critical_value);
  if(rule.operator==='gte'||rule.operator==='gt'){
    if(critical!==null&&(rule.operator==='gte'?value>=critical:value>critical))return 'critical';
    if(warning!==null&&(rule.operator==='gte'?value>=warning:value>warning))return 'attention';
  }else{
    if(critical!==null&&(rule.operator==='lte'?value<=critical:value<critical))return 'critical';
    if(warning!==null&&(rule.operator==='lte'?value<=warning:value<warning))return 'attention';
  }
  return null;
}
function renderValue(template:string,value:number){return template.replaceAll('{value}',Number.isInteger(value)?String(value):String(round(value,1)))}
function scoreFromSignals(base:number,signals:Signal[],dimension:string,rulesById:Map<string,Rule>){
  let score=base;
  for(const s of signals.filter(x=>x.dimension===dimension)){
    const weight=s.ruleId?Number(rulesById.get(s.ruleId)?.weight||1):1;
    score-=s.severity==='critical'?25*weight:s.severity==='attention'?12*weight:0;
  }
  return clamp(score,20,100);
}

function sectorInsights(profile:any,metrics:Record<string,any>,manual:Record<string,any>){
  const sector=String(profile?.sector||'general');
  const insights:Array<{level:string;title:string;message:string;metric?:string}>=[];
  const appointmentChange=metrics.future_appointment_change_pct;
  if(['health','services','beauty','automotive','professional_services'].includes(sector)){
    if(appointmentChange!==null&&appointmentChange!==undefined&&appointmentChange<-15)insights.push({level:'attention',title:'Agenda futura mais fraca',message:`Há cerca de ${Math.abs(round(appointmentChange))}% menos compromissos futuros do que no período recente. Vale agir antes de isso chegar ao caixa.`,metric:'future_appointment_change_pct'});
    const problemRate=metrics.appointment_problem_rate_pct;
    if(problemRate!==null&&problemRate!==undefined&&problemRate>15)insights.push({level:'attention',title:'Perdas na agenda',message:`Cancelamentos e ausências representam ${round(problemRate)}% dos compromissos recentes.`,metric:'appointment_problem_rate_pct'});
  }
  if(['commerce','retail','restaurant','food'].includes(sector)){
    if(manual.inventory_turnover!==undefined&&Number(manual.inventory_turnover)<1)insights.push({level:'attention',title:'Giro de estoque baixo',message:'O estoque informado está girando lentamente. Capital parado pode pressionar caixa antes da queda aparecer no faturamento.',metric:'inventory_turnover'});
    if(manual.waste_rate_pct!==undefined&&Number(manual.waste_rate_pct)>8)insights.push({level:'attention',title:'Desperdício merece atenção',message:`O desperdício informado está em ${round(Number(manual.waste_rate_pct))}% e pode esconder perda de margem.`,metric:'waste_rate_pct'});
  }
  if(sector==='education'){
    if(manual.attendance_rate_pct!==undefined&&Number(manual.attendance_rate_pct)<80)insights.push({level:'attention',title:'Engajamento dos alunos caiu',message:'A frequência informada está abaixo de 80%. Em educação, queda de engajamento pode aparecer antes da evasão e da inadimplência.',metric:'attendance_rate_pct'});
    if(manual.renegotiation_rate_pct!==undefined&&Number(manual.renegotiation_rate_pct)>10)insights.push({level:'attention',title:'Renegociações aumentando',message:'A proporção de renegociações merece acompanhamento antes que vire atraso recorrente.',metric:'renegotiation_rate_pct'});
  }
  if(sector==='real_estate'&&metrics.pipeline_coverage_months!==null&&metrics.pipeline_coverage_months!==undefined&&metrics.pipeline_coverage_months<1)insights.push({level:'attention',title:'Funil com pouca cobertura',message:'O valor ponderado das oportunidades está abaixo de um mês da receita média recente.',metric:'pipeline_coverage_months'});
  if(sector==='creator'&&manual.sponsor_concentration_pct!==undefined&&Number(manual.sponsor_concentration_pct)>40)insights.push({level:'attention',title:'Receita concentrada em poucas marcas',message:'Diversificar patrocinadores reduz a vulnerabilidade da renda futura.',metric:'sponsor_concentration_pct'});
  if(!insights.length)insights.push({level:'info',title:'Leitura setorial em construção',message:'Continue usando o NexOffice e complete os dados do seu negócio. O sistema vai aprofundar os sinais específicos do seu setor.'});
  return insights;
}

export async function buildBusinessIntelligence(workspaceId:string){
  const profile=await getBusinessProfile(workspaceId);
  let financial=await readFinancialIntelligence(workspaceId);
  if(!financial)financial=await buildFinancialIntelligence(workspaceId);
  const fm=financial?.metrics||{};
  const [crmRows,opsRows,eventRows,latestManual,rules,previousRows]=await Promise.all([
    query<any>(`select
      (select count(*) from crm_contacts where workspace_id=$1)::int contacts,
      (select count(*) from crm_contacts where workspace_id=$1 and created_at>=now()-interval '30 days')::int new_contacts_30,
      (select count(*) from crm_deals where workspace_id=$1)::int deals,
      (select count(*) from crm_deals where workspace_id=$1 and created_at>=now()-interval '30 days')::int new_deals_30,
      (select count(*) from crm_deals where workspace_id=$1 and stage='won' and updated_at>=now()-interval '90 days')::int won_90,
      (select count(*) from crm_deals where workspace_id=$1 and stage='lost' and updated_at>=now()-interval '90 days')::int lost_90,
      (select count(distinct contact_id) from ledger_entries where workspace_id=$1 and direction='income' and status='paid' and contact_id is not null and coalesce(paid_at,updated_at)>=now()-interval '90 days')::int paying_customers_90`,[workspaceId]),
    query<any>(`select
      count(*) filter(where t.status not in ('done','cancelled'))::int open_tasks,
      count(*) filter(where t.status not in ('done','cancelled') and t.due_at is not null and t.due_at<now())::int overdue_tasks,
      count(*) filter(where t.status='done' and coalesce(t.completed_at,t.updated_at)>=now()-interval '30 days')::int completed_tasks_30,
      (select count(*) from appointments where workspace_id=$1 and starts_at>=now()-interval '90 days' and starts_at<now())::int appointments_90,
      (select count(*) from appointments where workspace_id=$1 and starts_at>=now()-interval '90 days' and starts_at<now() and status in ('cancelled','no_show'))::int appointment_problems_90,
      (select count(*) from appointments where workspace_id=$1 and starts_at>=now() and starts_at<now()+interval '30 days' and status<>'cancelled')::int appointments_future_30,
      (select count(*) from appointments where workspace_id=$1 and starts_at>=now()-interval '30 days' and starts_at<now() and status<>'cancelled')::int appointments_previous_30
      from tasks t where t.workspace_id=$1`,[workspaceId]),
    query<any>(`select count(*)::int events_30 from business_events where workspace_id=$1 and occurred_at>=now()-interval '30 days'`,[workspaceId]),
    query<any>(`select distinct on(metric_key) metric_key,value_numeric,value_text,unit,source,quality,confidence,observed_at from intelligence_metrics where workspace_id=$1 and source<>'derived' order by metric_key,observed_at desc`,[workspaceId]),
    query<Rule>(`select * from intelligence_rules where active=true and (sector='all' or sector=$1) and (subsector is null or subsector=$2) order by code,version desc`,[String(profile.sector||'general'),profile.subsector||null]),
    query<any>(`select * from intelligence_snapshots where workspace_id=$1 order by as_of desc limit 1`,[workspaceId])
  ]);

  const c=crmRows[0]||{};const o=opsRows[0]||{};const ev=eventRows[0]||{};
  const manual:Record<string,any>={};for(const row of latestManual)manual[row.metric_key]=row.value_numeric??row.value_text;
  const receivable=n(fm.receivableMinor),overdue=n(fm.overdueReceivableMinor),avgRevenue=n(fm.averageMonthlyRevenueMinor),avgExpense=n(fm.averageMonthlyExpenseMinor),currentCash=n(fm.currentCashMinor),weightedPipeline=n(fm.weightedPipelineMinor);
  const closed90=n(c.won_90)+n(c.lost_90),openTasks=n(o.open_tasks),appt90=n(o.appointments_90),prevAppts=n(o.appointments_previous_30),futureAppts=n(o.appointments_future_30);
  const metrics:Record<string,any>={
    overdue_receivable_share_pct:receivable>0?round(overdue/receivable*100):receivable===0&&n(fm.ledgerEntries)>0?0:null,
    cash_coverage_months:avgExpense>0?round(currentCash/avgExpense,2):null,
    pipeline_coverage_months:avgRevenue>0?round(weightedPipeline/avgRevenue,2):null,
    top_client_share_pct:fm.topClientSharePct??null,
    task_overdue_rate_pct:openTasks>0?round(n(o.overdue_tasks)/openTasks*100):openTasks===0?0:null,
    appointment_problem_rate_pct:appt90>=3?round(n(o.appointment_problems_90)/appt90*100):null,
    future_appointment_change_pct:prevAppts>=3?round((futureAppts-prevAppts)/prevAppts*100):null,
    deal_win_rate_90:closed90>0?round(n(c.won_90)/closed90*100):null,
    contacts:n(c.contacts),new_contacts_30:n(c.new_contacts_30),deals:n(c.deals),new_deals_30:n(c.new_deals_30),paying_customers_90:n(c.paying_customers_90),events_30:n(ev.events_30),completed_tasks_30:n(o.completed_tasks_30),appointments_future_30:futureAppts,
    current_cash_minor:currentCash,projected_cash_30_minor:n(fm.projectedCash30Minor),average_monthly_revenue_minor:avgRevenue,average_monthly_expense_minor:avgExpense
  };

  const rulesById=new Map(rules.map(r=>[r.id,r]));
  const latestRuleByCode=new Map<string,Rule>();
  for(const rule of rules)if(!latestRuleByCode.has(rule.code))latestRuleByCode.set(rule.code,rule);
  const signals:Signal[]=[];
  for(const rule of latestRuleByCode.values()){
    const raw=metrics[rule.metric_key]??manual[rule.metric_key];
    if(raw===null||raw===undefined||raw==='')continue;
    const value=Number(raw);if(!Number.isFinite(value))continue;
    const severity=ruleSeverity(rule,value);if(!severity)continue;
    signals.push({ruleId:rule.id,code:rule.code,dimension:rule.dimension,severity,title:rule.title,message:renderValue(rule.message_template,value),recommendation:rule.recommendation||undefined,evidence:{metric:rule.metric_key,value,warning:Number(rule.warning_value),critical:Number(rule.critical_value),ruleVersion:rule.version}});
  }
  if(n(fm.projectedCash30Minor)<0)signals.push({code:'projected_cash_negative',dimension:'finance',severity:'critical',title:'Caixa pode ficar negativo',message:'Com os lançamentos registrados, a projeção de 30 dias está negativa.',recommendation:'Reveja recebimentos e pagamentos antes da data de aperto.',evidence:{projectedCash30Minor:n(fm.projectedCash30Minor)}});
  if(metrics.future_appointment_change_pct!==null&&metrics.future_appointment_change_pct<-20)signals.push({code:'future_agenda_drop',dimension:'operation',severity:'attention',title:'Agenda futura perdeu ritmo',message:`Os próximos 30 dias têm cerca de ${Math.abs(round(metrics.future_appointment_change_pct))}% menos compromissos que os 30 dias anteriores.`,whyItMatters:'Em negócios movidos por agenda, a queda operacional costuma chegar ao caixa depois.',recommendation:'Reforce confirmação, recompra e geração de agenda antes que a queda vire receita menor.',evidence:{futureAppointmentChangePct:metrics.future_appointment_change_pct}});

  const financeScore=scoreFromSignals(85,signals,'finance',rulesById);
  let salesScore=scoreFromSignals(80,signals,'sales',rulesById);
  let customerScore=scoreFromSignals(82,signals,'customers',rulesById);
  const operationScore=scoreFromSignals(84,signals,'operation',rulesById);
  const resilienceScore=scoreFromSignals(82,signals,'resilience',rulesById);
  if(metrics.deal_win_rate_90!==null){if(metrics.deal_win_rate_90>=40)salesScore=clamp(salesScore+5);else if(metrics.deal_win_rate_90<20)salesScore=clamp(salesScore-8)}
  if(n(c.contacts)===0)customerScore=55;else if(n(c.new_contacts_30)>0)customerScore=clamp(customerScore+3);

  const profilePct=Number(profile.completeness_pct||completeness(profile));
  let knowledge=profilePct*.3;
  knowledge+=n(fm.ledgerEntries)>0?25:0;
  knowledge+=n(c.contacts)>0?12:0;
  knowledge+=n(c.deals)>0?10:0;
  knowledge+=(openTasks>0||n(o.completed_tasks_30)>0)?7:0;
  knowledge+=(appt90>0||futureAppts>0)?8:0;
  knowledge+=latestManual.length>0?8:0;
  knowledge=Math.min(100,Math.round(knowledge));

  const overall=clamp(financeScore*.27+salesScore*.20+customerScore*.17+operationScore*.18+resilienceScore*.18);
  const status:'learning'|'healthy'|'attention'|'critical'=knowledge<30?'learning':overall>=80?'healthy':overall>=60?'attention':'critical';
  const previous=previousRows[0];
  const delta=previous?.overall_score===null||previous?.overall_score===undefined?0:overall-Number(previous.overall_score);
  const trend=delta>=3?'improving':delta<=-3?'worsening':'stable';
  const ordered=[['Financeiro',financeScore],['Vendas',salesScore],['Clientes',customerScore],['Operação',operationScore],['Resistência',resilienceScore]].sort((a,b)=>Number(b[1])-Number(a[1]));
  const summary=status==='learning'
    ?'O NexOffice ainda está aprendendo seu negócio. Complete os dados e continue registrando a operação para aumentar a precisão.'
    :status==='healthy'
      ?`Seu negócio está saudável agora. O ponto mais forte é ${String(ordered[0][0]).toLowerCase()}; continue acompanhando os sinais antes que virem problemas.`
      :status==='attention'
        ?`Seu negócio merece atenção em alguns pontos. A área mais frágil agora é ${String(ordered[ordered.length-1][0]).toLowerCase()}.`
        :'Há sinais importantes que pedem ação. Priorize os alertas críticos antes de assumir novos compromissos.';
  const sector=sectorInsights(profile,metrics,manual);
  const missing:string[]=[];
  if(profilePct<70)missing.push('Completar o perfil do negócio');
  if(n(fm.ledgerEntries)===0)missing.push('Registrar ou importar movimentações financeiras');
  if(n(c.contacts)===0)missing.push('Cadastrar clientes');
  if(n(c.deals)===0)missing.push('Registrar oportunidades e vendas');
  if(profile.uses_agenda&&appt90===0&&futureAppts===0)missing.push('Usar a agenda do NexOffice');
  if(profile.uses_inventory&&!Object.prototype.hasOwnProperty.call(manual,'inventory_turnover'))missing.push('Informar giro/estoque para aprofundar a leitura do setor');
  const evidence={profileCompletenessPct:profilePct,knowledgePct:knowledge,previousScore:previous?.overall_score??null,delta,missingData:missing};
  const sources={finance:n(fm.ledgerEntries)>0,crm:n(c.contacts)>0||n(c.deals)>0,agenda:appt90>0||futureAppts>0,tasks:openTasks>0||n(o.completed_tasks_30)>0,manualMetrics:latestManual.length,method:'business_health_v1'};

  const snapshot=(await query<any>(`insert into intelligence_snapshots(workspace_id,overall_score,finance_score,sales_score,customer_score,operation_score,resilience_score,knowledge_pct,status,trend,summary,metrics,evidence,sector_insights,sources)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning *`,[workspaceId,overall,financeScore,salesScore,customerScore,operationScore,resilienceScore,knowledge,status,trend,summary,JSON.stringify({...metrics,...manual}),JSON.stringify(evidence),JSON.stringify(sector),JSON.stringify(sources)]))[0];
  await query(`update intelligence_signals set active=false,resolved_at=coalesce(resolved_at,now()) where workspace_id=$1 and active=true`,[workspaceId]);
  for(const s of signals)await query(`insert into intelligence_signals(workspace_id,snapshot_id,rule_id,code,dimension,severity,title,message,why_it_matters,recommendation,evidence)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[workspaceId,snapshot.id,s.ruleId||null,s.code,s.dimension,s.severity,s.title,s.message,s.whyItMatters||null,s.recommendation||null,JSON.stringify(s.evidence)]);
  for(const [key,value] of Object.entries(metrics)){
    if(value===null||value===undefined||typeof value!=='number')continue;
    await query(`insert into intelligence_metrics(workspace_id,metric_key,value_numeric,source,quality,confidence,observed_at,metadata) values($1,$2,$3,'derived','high',0.9,$4,$5)`,[workspaceId,key,value,snapshot.as_of,JSON.stringify({snapshotId:snapshot.id,modelVersion:snapshot.model_version})]);
  }
  return readBusinessIntelligence(workspaceId,snapshot.id);
}

export async function readBusinessIntelligence(workspaceId:string,snapshotId?:string){
  const snapshot=snapshotId
    ?(await query<any>(`select * from intelligence_snapshots where id=$1 and workspace_id=$2`,[snapshotId,workspaceId]))[0]
    :(await query<any>(`select * from intelligence_snapshots where workspace_id=$1 order by as_of desc limit 1`,[workspaceId]))[0];
  if(!snapshot)return null;
  const [signals,profile]=await Promise.all([
    query<any>(`select * from intelligence_signals where workspace_id=$1 and snapshot_id=$2 order by case severity when 'critical' then 1 when 'attention' then 2 else 3 end,created_at`,[workspaceId,snapshot.id]),
    getBusinessProfile(workspaceId)
  ]);
  return{snapshot,profile,scores:{overall:snapshot.overall_score,finance:snapshot.finance_score,sales:snapshot.sales_score,customers:snapshot.customer_score,operation:snapshot.operation_score,resilience:snapshot.resilience_score},knowledge:{percent:snapshot.knowledge_pct,missing:asObject(snapshot.evidence).missingData||[]},metrics:snapshot.metrics,signals,sectorInsights:snapshot.sector_insights||[]};
}

export async function businessIntelligenceHistory(workspaceId:string,limit=60){
  return query<any>(`select id,as_of,overall_score,finance_score,sales_score,customer_score,operation_score,resilience_score,knowledge_pct,status,trend,summary from intelligence_snapshots where workspace_id=$1 order by as_of desc limit $2`,[workspaceId,Math.min(365,Math.max(1,limit))]);
}
