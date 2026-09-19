import {query} from './db.js';
import {getBusinessProfile,readBusinessIntelligence} from './business-intelligence.js';

const n=(value:unknown)=>Number(value||0);
const round=(value:number,digits=1)=>{const p=10**digits;return Math.round(value*p)/p};
const brl=(minor:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(minor/100);
const obj=(value:any):Record<string,any>=>value&&typeof value==='object'?value:{};

const dimensionLabels:Record<string,string>={finance:'Financeiro',sales:'Vendas',customers:'Clientes',operation:'Operação',resilience:'Resistência'};
const metricCatalog:Record<string,{label:string;better:'up'|'down';unit?:string;minDelta?:number}>={
  overdue_receivable_share_pct:{label:'Recebíveis vencidos',better:'down',unit:'%',minDelta:2},
  cash_coverage_months:{label:'Cobertura de caixa',better:'up',unit:' meses',minDelta:.15},
  pipeline_coverage_months:{label:'Cobertura do funil',better:'up',unit:' meses',minDelta:.15},
  top_client_share_pct:{label:'Dependência do maior cliente',better:'down',unit:'%',minDelta:2},
  task_overdue_rate_pct:{label:'Tarefas atrasadas',better:'down',unit:'%',minDelta:3},
  appointment_problem_rate_pct:{label:'Perdas na agenda',better:'down',unit:'%',minDelta:3},
  future_appointment_change_pct:{label:'Ritmo da agenda futura',better:'up',unit:'%',minDelta:5},
  deal_win_rate_90:{label:'Conversão de oportunidades',better:'up',unit:'%',minDelta:3}
};

function monthlyAmount(row:any){
  const amount=n(row.amount_minor),interval=Math.max(1,n(row.interval_count)||1);
  if(row.frequency==='weekly')return amount*52/12/interval;
  if(row.frequency==='yearly')return amount/12/interval;
  return amount/interval;
}

function topDrivers(current:any,previous:any){
  if(!current||!previous)return[];
  const curMetrics=obj(current.metrics),prevMetrics=obj(previous.metrics);
  const drivers:Array<{type:'score'|'metric';key:string;label:string;delta:number;direction:'better'|'worse'|'neutral';text:string}>=[];
  const scoreFields=[['finance_score','finance'],['sales_score','sales'],['customer_score','customers'],['operation_score','operation'],['resilience_score','resilience']];
  for(const [field,key] of scoreFields){
    const a=Number(current[field]),b=Number(previous[field]);
    if(!Number.isFinite(a)||!Number.isFinite(b))continue;
    const delta=a-b;if(Math.abs(delta)<2)continue;
    drivers.push({type:'score',key,label:dimensionLabels[key]||key,delta,direction:delta>0?'better':'worse',text:`${dimensionLabels[key]||key} ${delta>0?'subiu':'caiu'} ${Math.abs(delta)} ponto(s).`});
  }
  for(const [key,meta] of Object.entries(metricCatalog)){
    const a=Number(curMetrics[key]),b=Number(prevMetrics[key]);
    if(!Number.isFinite(a)||!Number.isFinite(b))continue;
    const delta=round(a-b,2);if(Math.abs(delta)<(meta.minDelta||1))continue;
    const improved=meta.better==='up'?delta>0:delta<0;
    const direction=improved?'better':'worse';
    drivers.push({type:'metric',key,label:meta.label,delta,direction,text:`${meta.label} ${delta>0?'aumentou':'caiu'} ${Math.abs(delta)}${meta.unit||''}.`});
  }
  return drivers.sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)).slice(0,6);
}

async function saveDailyDerivedMetric(workspaceId:string,key:string,value:number,unit:string,metadata:Record<string,unknown>={}){
  if(!Number.isFinite(value))return;
  await query(`insert into intelligence_metrics(workspace_id,metric_key,value_numeric,unit,source,quality,confidence,observed_at,metadata)
    select $1,$2,$3,$4,'derived','high',0.9,now(),$5
    where not exists(select 1 from intelligence_metrics where workspace_id=$1 and metric_key=$2 and source='derived' and observed_at>=date_trunc('day',now()) and metadata->>'origin'='depth_v2')`,[workspaceId,key,value,unit,JSON.stringify({origin:'depth_v2',...metadata})]);
}

function priorityFromSignal(signal:any){
  return{source:'signal',severity:signal.severity,title:signal.title,reason:signal.message,action:signal.recommendation||'Acompanhe este ponto e registre a próxima ação no NexOffice.',dimension:signal.dimension,signalId:signal.id};
}

export async function buildBusinessRadar(workspaceId:string){
  const [health,profile,snapshots,recurringRows,agendaRows,manualRows]=await Promise.all([
    readBusinessIntelligence(workspaceId),
    getBusinessProfile(workspaceId),
    query<any>(`select * from intelligence_snapshots where workspace_id=$1 order by as_of desc limit 2`,[workspaceId]),
    query<any>(`select id,direction,amount_minor,frequency,interval_count,next_run_at,ends_at,active from recurring_rules where workspace_id=$1 and active=true`,[workspaceId]),
    query<any>(`select
      count(*) filter(where starts_at>=now()-interval '30 days' and starts_at<now() and status<>'cancelled')::int previous_30,
      count(*) filter(where starts_at>=now() and starts_at<now()+interval '30 days' and status<>'cancelled')::int future_30,
      count(*) filter(where starts_at>=now()-interval '90 days' and starts_at<now())::int past_90,
      count(*) filter(where starts_at>=now()-interval '90 days' and starts_at<now() and status in ('cancelled','no_show'))::int problems_90,
      count(distinct contact_id) filter(where starts_at>=now()-interval '90 days' and starts_at<now() and contact_id is not null)::int customers_90,
      count(distinct contact_id) filter(where contact_id in(select contact_id from appointments a2 where a2.workspace_id=$1 and a2.contact_id is not null group by contact_id having count(*) filter(where a2.starts_at>=now()-interval '180 days' and a2.starts_at<now())>=2) and starts_at>=now()-interval '90 days' and starts_at<now())::int repeat_customers_90
      from appointments where workspace_id=$1`,[workspaceId]),
    query<any>(`select distinct on(metric_key) metric_key,value_numeric,value_text,unit,quality,confidence,observed_at from intelligence_metrics where workspace_id=$1 and source<>'derived' order by metric_key,observed_at desc`,[workspaceId])
  ]);
  if(!health)return{generatedAt:new Date().toISOString(),status:'learning',score:null,scoreDelta:null,drivers:[],priorities:[],sector:{kind:'general',metrics:[],insights:[]}};

  const current=snapshots[0]||health.snapshot,previous=snapshots[1]||null;
  const manual:Record<string,any>={};for(const row of manualRows)manual[row.metric_key]=row.value_numeric??row.value_text;
  let recurringIncomeMonthly=0,recurringExpenseMonthly=0,activeRecurringIncome=0,expiring60=0;
  for(const row of recurringRows){const monthly=monthlyAmount(row);if(row.direction==='income'){recurringIncomeMonthly+=monthly;activeRecurringIncome++}else recurringExpenseMonthly+=monthly;if(row.ends_at&&new Date(row.ends_at).getTime()<=Date.now()+60*86400000)expiring60++}
  recurringIncomeMonthly=Math.round(recurringIncomeMonthly);recurringExpenseMonthly=Math.round(recurringExpenseMonthly);
  const averageRevenue=n(obj(current.metrics).average_monthly_revenue_minor);
  const recurringShare=averageRevenue>0?round(recurringIncomeMonthly/averageRevenue*100):null;
  const agenda=agendaRows[0]||{};const previous30=n(agenda.previous_30),future30=n(agenda.future_30),past90=n(agenda.past_90),problems90=n(agenda.problems_90),customers90=n(agenda.customers_90),repeat90=n(agenda.repeat_customers_90);
  const agendaFutureChange=previous30>=3?round((future30-previous30)/previous30*100):null;
  const showRate=past90>=3?round((past90-problems90)/past90*100):null;
  const repeatRate=customers90>0?round(repeat90/customers90*100):null;

  if(recurringShare!==null)await saveDailyDerivedMetric(workspaceId,'recurring_revenue_share_pct',recurringShare,'%',{monthlyMinor:recurringIncomeMonthly});
  if(showRate!==null)await saveDailyDerivedMetric(workspaceId,'appointment_show_rate_pct',showRate,'%',{});
  if(repeatRate!==null)await saveDailyDerivedMetric(workspaceId,'appointment_repeat_customer_pct',repeatRate,'%',{});
  await saveDailyDerivedMetric(workspaceId,'active_recurring_income_rules',activeRecurringIncome,'regras',{});
  await saveDailyDerivedMetric(workspaceId,'monthly_recurring_income_minor',recurringIncomeMonthly,'centavos',{});

  const sectorName=String(profile?.sector||'general');
  const sectorMetrics:Array<{key:string;label:string;value:string;quality:'automatic'|'informed'}>=[];
  const sectorInsights:Array<{level:'good'|'attention'|'info';title:string;message:string}>=[];
  if(['services','health','beauty','automotive','professional_services'].includes(sectorName)||profile?.uses_agenda){
    sectorMetrics.push({key:'future_agenda',label:'Agenda nos próximos 30 dias',value:String(future30),quality:'automatic'});
    sectorMetrics.push({key:'show_rate',label:'Comparecimento recente',value:showRate===null?'Poucos dados':`${showRate}%`,quality:'automatic'});
    sectorMetrics.push({key:'repeat_rate',label:'Clientes que retornaram',value:repeatRate===null?'Poucos dados':`${repeatRate}%`,quality:'automatic'});
    if(agendaFutureChange!==null&&agendaFutureChange<-15)sectorInsights.push({level:'attention',title:'Agenda futura perdeu ritmo',message:`Há ${Math.abs(agendaFutureChange)}% menos compromissos nos próximos 30 dias do que nos 30 dias anteriores.`});
    else if(agendaFutureChange!==null&&agendaFutureChange>10)sectorInsights.push({level:'good',title:'Agenda ganhando ritmo',message:`A agenda futura está ${agendaFutureChange}% acima do período anterior.`});
    if(showRate!==null&&showRate<85)sectorInsights.push({level:'attention',title:'Comparecimento pode melhorar',message:`O comparecimento está em ${showRate}%. Confirmação e remarcação podem proteger receita.`});
  }
  if(['commerce','restaurant'].includes(sectorName)||profile?.uses_inventory){
    const inventoryTurnover=manual.inventory_turnover===undefined?null:Number(manual.inventory_turnover),waste=manual.waste_rate_pct===undefined?null:Number(manual.waste_rate_pct),margin=manual.gross_margin_pct===undefined?null:Number(manual.gross_margin_pct),stockout=manual.stockout_rate_pct===undefined?null:Number(manual.stockout_rate_pct);
    sectorMetrics.push({key:'inventory_turnover',label:'Giro de estoque',value:inventoryTurnover===null?'Não informado':`${round(inventoryTurnover,2)}x`,quality:'informed'});
    sectorMetrics.push({key:'gross_margin',label:'Margem bruta',value:margin===null?'Não informada':`${round(margin)}%`,quality:'informed'});
    sectorMetrics.push({key:'stockout',label:'Falta de estoque',value:stockout===null?'Não informada':`${round(stockout)}%`,quality:'informed'});
    if(inventoryTurnover!==null&&inventoryTurnover<1)sectorInsights.push({level:'attention',title:'Capital parado em estoque',message:'O giro informado está baixo. Vale rever itens parados antes de aumentar compras.'});
    if(waste!==null&&waste>8)sectorInsights.push({level:'attention',title:'Desperdício pressionando margem',message:`O desperdício informado está em ${round(waste)}%.`});
    if(margin!==null&&margin<20)sectorInsights.push({level:'attention',title:'Margem apertada',message:`A margem bruta informada está em ${round(margin)}%.`});
  }
  if(profile?.recurring_revenue||profile?.uses_contracts||['professional_services','education'].includes(sectorName)){
    sectorMetrics.push({key:'recurring_income',label:'Receita recorrente mensal cadastrada',value:brl(recurringIncomeMonthly),quality:'automatic'});
    sectorMetrics.push({key:'recurring_share',label:'Peso da recorrência na receita média',value:recurringShare===null?'Poucos dados':`${recurringShare}%`,quality:'automatic'});
    sectorMetrics.push({key:'expiring',label:'Recorrências encerrando em até 60 dias',value:String(expiring60),quality:'automatic'});
    const renewal=manual.contract_renewal_rate_pct===undefined?null:Number(manual.contract_renewal_rate_pct),concentration=manual.contract_concentration_pct===undefined?null:Number(manual.contract_concentration_pct);
    if(renewal!==null)sectorMetrics.push({key:'renewal',label:'Renovação de contratos',value:`${round(renewal)}%`,quality:'informed'});
    if(concentration!==null)sectorMetrics.push({key:'contract_concentration',label:'Concentração em contratos',value:`${round(concentration)}%`,quality:'informed'});
    if(expiring60>0)sectorInsights.push({level:'attention',title:'Receitas recorrentes próximas do fim',message:`Há ${expiring60} recorrência(s) com término previsto nos próximos 60 dias.`});
    if(renewal!==null&&renewal<75)sectorInsights.push({level:'attention',title:'Renovação merece acompanhamento',message:`A taxa informada de renovação está em ${round(renewal)}%.`});
    if(recurringIncomeMonthly>0&&recurringShare!==null&&recurringShare>=50)sectorInsights.push({level:'good',title:'Boa base de receita recorrente',message:`Cerca de ${recurringShare}% da receita média está apoiada em recorrências cadastradas.`});
  }
  if(!sectorInsights.length)sectorInsights.push({level:'info',title:'Leitura ficando mais precisa',message:'Continue usando o NexOffice. O histórico diário aumenta a qualidade das comparações e dos alertas.'});

  const drivers=topDrivers(current,previous);
  const activeSignals=[...(health.signals||[])].filter((x:any)=>x.severity==='critical'||x.severity==='attention');
  const priorities=activeSignals.slice(0,3).map(priorityFromSignal);
  if(priorities.length<3&&sectorInsights.some(x=>x.level==='attention'))for(const insight of sectorInsights.filter(x=>x.level==='attention')){if(priorities.length>=3)break;priorities.push({source:'sector',severity:'attention',title:insight.title,reason:insight.message,action:'Abra a área relacionada e registre a próxima ação para acompanhar o resultado.',dimension:'operation',signalId:null})}
  if(priorities.length<3&&Number(health.knowledge?.percent||0)<70)priorities.push({source:'knowledge',severity:'info',title:'Aumente a precisão da leitura',reason:`O NexOffice conhece ${Number(health.knowledge?.percent||0)}% do negócio.`,action:(health.knowledge?.missing||[])[0]||'Complete o perfil e use os módulos principais.',dimension:'operation',signalId:null});

  return{
    generatedAt:new Date().toISOString(),status:health.snapshot.status,score:Number(health.scores.overall),scoreDelta:previous?.overall_score===null||previous?.overall_score===undefined?null:Number(health.scores.overall)-Number(previous.overall_score),trend:health.snapshot.trend,
    drivers,priorities,knowledge:health.knowledge,
    recurring:{monthlyIncomeMinor:recurringIncomeMonthly,monthlyExpenseMinor:recurringExpenseMonthly,incomeSharePct:recurringShare,activeIncomeRules:activeRecurringIncome,expiring60Days:expiring60},
    sector:{kind:sectorName,metrics:sectorMetrics,insights:sectorInsights},
    snapshotAt:health.snapshot.as_of
  };
}
