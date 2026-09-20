import {query} from './db.js';
import {getBusinessProfile} from './business-intelligence.js';

type CollectionMode='automatic'|'ask_client'|'integration';
type Requirement={key:string;label:string;group:string;maxAgeDays:number;collectionMode:CollectionMode;sourceHint:string;priority:'core'|'sector'};
type MetricCandidate={key:string;value:number|null;unit:string|null;sourceReference:string;confidence:number;definition:string;sampleSize?:number};

const COLLECTOR='native-data-v1';
const DAY=86_400_000;
const round=(v:number,d=1)=>{const p=10**d;return Math.round(v*p)/p};
const ratioPct=(a:number,b:number)=>b>0?round(a/b*100,1):null;
const autoSources=new Set(['verified_transaction','integrated_system','derived']);
const uniq=<T extends {key:string}>(items:T[])=>{const seen=new Set<string>();return items.filter(x=>!seen.has(x.key)&&seen.add(x.key))};

const req=(key:string,label:string,group:string,collectionMode:CollectionMode,sourceHint:string,priority:'core'|'sector'='core',maxAgeDays=45):Requirement=>({key,label,group,collectionMode,sourceHint,priority,maxAgeDays});

export function requirementsForProfile(profile:any):Requirement[]{
  const sector=String(profile?.sector||'general');
  const items:Requirement[]=[
    req('business_profile','Contexto do negócio','context','ask_client','perfil do negócio','core',365),
    req('revenue_change_30_pct','Ritmo de receita','finance','automatic','financeiro NexOffice'),
    req('overdue_receivable_share_pct','Pressão de recebíveis','finance','automatic','financeiro NexOffice'),
    req('repeat_customer_rate_pct','Recorrência observada de clientes','customers','automatic','recebimentos identificados'),
    req('deal_win_rate_90','Conversão comercial','sales','automatic','CRM NexOffice')
  ];
  if(profile?.uses_agenda||['services','professional_services','health','beauty','automotive'].includes(sector))items.push(
    req('future_appointment_change_pct','Ritmo da agenda futura','operation','automatic','agenda NexOffice'),
    req('appointment_problem_rate_pct','Cancelamentos e ausências','operation','automatic','agenda NexOffice')
  );
  if(profile?.recurring_revenue||profile?.uses_contracts||String(profile?.revenue_model||'')==='recurring')items.push(
    req('active_recurring_contracts','Base recorrente ativa','resilience','automatic','recorrências/contratos NexOffice'),
    req('recurring_expiry_30_pct','Vencimentos recorrentes próximos','resilience','automatic','recorrências/contratos NexOffice')
  );
  if(['commerce','restaurant'].includes(sector)||profile?.uses_inventory)items.push(
    req('gross_margin_pct','Margem bruta','finance','ask_client','integração de vendas/estoque ou atualização rápida','sector'),
    req('inventory_turnover','Giro de estoque','operation','ask_client','integração de estoque ou atualização rápida','sector')
  );
  if(sector==='restaurant')items.push(req('waste_rate_pct','Desperdício','operation','ask_client','integração operacional ou atualização rápida','sector'));
  if(profile?.recurring_revenue||String(profile?.revenue_model||'')==='recurring')items.push(req('renewal_rate_pct','Renovação recorrente','resilience','ask_client','integração contratual ou atualização rápida','sector'));
  if(sector==='education')items.push(
    req('active_enrollments','Matrículas ativas','customers','ask_client','ERP educacional ou atualização rápida','sector'),
    req('attendance_rate_pct','Frequência','operation','ask_client','ERP educacional ou atualização rápida','sector'),
    req('reenrollment_rate_pct','Rematrícula','customers','ask_client','ERP educacional ou atualização rápida','sector'),
    req('dropout_rate_pct','Evasão','resilience','ask_client','ERP educacional ou atualização rápida','sector'),
    req('renegotiation_rate_pct','Renegociação','finance','ask_client','ERP financeiro/educacional ou atualização rápida','sector')
  );
  if(sector==='professional_services')items.push(
    req('contract_renewal_rate_pct','Renovação de contratos','resilience','ask_client','contratos integrados ou atualização rápida','sector'),
    req('billable_utilization_pct','Utilização faturável','operation','integration','timesheet/faturamento estruturado','sector'),
    req('client_retention_rate_pct','Retenção de clientes','customers','automatic','recebimentos identificados','sector')
  );
  if(sector==='automotive')items.push(
    req('bay_occupancy_pct','Ocupação da capacidade','operation','integration','capacidade/boxes da oficina','sector'),
    req('quote_approval_rate_pct','Aprovação de orçamentos','sales','automatic','CRM com negócios identificados como orçamento','sector'),
    req('repeat_vehicle_rate_pct','Retorno de veículos','customers','automatic','agenda/OS com identificador de veículo','sector')
  );
  if(sector==='health')items.push(
    req('occupancy_rate_pct','Ocupação administrativa','operation','integration','agenda com capacidade disponível estruturada','sector'),
    req('return_rate_pct','Retorno administrativo','customers','automatic','agenda agregada por contato','sector')
  );
  if(sector==='beauty')items.push(
    req('occupancy_rate_pct','Ocupação da agenda','operation','integration','agenda com capacidade disponível estruturada','sector'),
    req('return_rate_pct','Retorno de clientes','customers','automatic','agenda agregada por contato','sector'),
    req('rebooking_rate_pct','Próxima visita agendada','resilience','automatic','agenda agregada por contato','sector')
  );
  return uniq(items);
}

async function storeMetric(workspaceId:string,c:MetricCandidate,refresh:boolean){
  if(c.value===null||!Number.isFinite(c.value))return false;
  if(refresh)await query(`delete from intelligence_metrics where workspace_id=$1 and metric_key=$2 and source='integrated_system' and metadata->>'collector'=$3 and observed_at::date=current_date`,[workspaceId,c.key,COLLECTOR]);
  const existing=(await query<any>(`select id from intelligence_metrics where workspace_id=$1 and metric_key=$2 and source='integrated_system' and metadata->>'collector'=$3 and observed_at::date=current_date limit 1`,[workspaceId,c.key,COLLECTOR]))[0];
  if(existing)return false;
  await query(`insert into intelligence_metrics(workspace_id,metric_key,value_numeric,unit,source,source_reference,quality,confidence,period_start,period_end,observed_at,metadata) values($1,$2,$3,$4,'integrated_system',$5,'high',$6,now()-interval '30 days',now(),now(),$7)`,[workspaceId,c.key,c.value,c.unit,c.sourceReference,c.confidence,JSON.stringify({collector:COLLECTOR,definition:c.definition,sampleSize:c.sampleSize??null})]);
  return true;
}

async function nativeCandidates(workspaceId:string):Promise<MetricCandidate[]>{
  const [financeRows,customerRows,crmRows,agendaRows,agendaCustomerRows,vehicleRows,recurringRows,eventRows]=await Promise.all([
    query<any>(`select
      coalesce(sum(amount_minor) filter(where direction='income' and status='paid' and coalesce(paid_at,updated_at)>=now()-interval '30 days'),0)::bigint revenue_30,
      coalesce(sum(amount_minor) filter(where direction='income' and status='paid' and coalesce(paid_at,updated_at)>=now()-interval '60 days' and coalesce(paid_at,updated_at)<now()-interval '30 days'),0)::bigint revenue_prev_30,
      coalesce(sum(amount_minor) filter(where direction='income' and status in ('open','overdue')),0)::bigint receivable,
      coalesce(sum(amount_minor) filter(where direction='income' and status='overdue'),0)::bigint overdue,
      count(*)::int entries
      from ledger_entries where workspace_id=$1`,[workspaceId]),
    query<any>(`with prev as(
      select distinct contact_id from ledger_entries where workspace_id=$1 and direction='income' and status='paid' and contact_id is not null and coalesce(paid_at,updated_at)>=now()-interval '180 days' and coalesce(paid_at,updated_at)<now()-interval '90 days'
    ),curr as(
      select distinct contact_id from ledger_entries where workspace_id=$1 and direction='income' and status='paid' and contact_id is not null and coalesce(paid_at,updated_at)>=now()-interval '90 days'
    ),repeat as(
      select contact_id,count(*)::int payments from ledger_entries where workspace_id=$1 and direction='income' and status='paid' and contact_id is not null and coalesce(paid_at,updated_at)>=now()-interval '180 days' group by contact_id
    ) select
      (select count(*) from prev)::int previous_customers,
      (select count(*) from prev join curr using(contact_id))::int retained_customers,
      (select count(*) from repeat)::int customers_180,
      (select count(*) from repeat where payments>=2)::int repeat_customers_180`,[workspaceId]),
    query<any>(`select
      count(*) filter(where stage in ('won','lost') and updated_at>=now()-interval '90 days')::int closed_90,
      count(*) filter(where stage='won' and updated_at>=now()-interval '90 days')::int won_90,
      count(*) filter(where stage in ('won','lost') and updated_at>=now()-interval '90 days' and (lower(coalesce(metadata->>'kind','')) in ('quote','estimate','orcamento') or lower(coalesce(source,'')) in ('quote','estimate','orcamento')))::int quotes_closed_90,
      count(*) filter(where stage='won' and updated_at>=now()-interval '90 days' and (lower(coalesce(metadata->>'kind','')) in ('quote','estimate','orcamento') or lower(coalesce(source,'')) in ('quote','estimate','orcamento')))::int quotes_won_90
      from crm_deals where workspace_id=$1`,[workspaceId]),
    query<any>(`select
      count(*) filter(where starts_at>=now()-interval '90 days' and starts_at<now())::int appt_90,
      count(*) filter(where starts_at>=now()-interval '90 days' and starts_at<now() and status in ('cancelled','no_show'))::int problems_90,
      count(*) filter(where starts_at>=now()-interval '30 days' and starts_at<now() and status<>'cancelled')::int previous_30,
      count(*) filter(where starts_at>=now() and starts_at<now()+interval '30 days' and status<>'cancelled')::int future_30
      from appointments where workspace_id=$1`,[workspaceId]),
    query<any>(`with history as(
      select contact_id,count(*)::int appointments from appointments where workspace_id=$1 and contact_id is not null and starts_at>=now()-interval '180 days' and starts_at<now() and status not in ('cancelled','no_show') group by contact_id
    ),recent as(
      select distinct contact_id from appointments where workspace_id=$1 and contact_id is not null and starts_at>=now()-interval '60 days' and starts_at<now() and status not in ('cancelled','no_show')
    ),future as(
      select distinct contact_id from appointments where workspace_id=$1 and contact_id is not null and starts_at>=now() and starts_at<now()+interval '60 days' and status<>'cancelled'
    ) select
      (select count(*) from history)::int history_contacts,
      (select count(*) from history where appointments>=2)::int returning_contacts,
      (select count(*) from recent)::int recent_contacts,
      (select count(*) from recent join future using(contact_id))::int rebooked_contacts`,[workspaceId]),
    query<any>(`with vehicles as(
      select coalesce(nullif(metadata->>'vehicleId',''),nullif(metadata->>'vehicle_id','')) vehicle_id,count(*)::int visits
      from appointments where workspace_id=$1 and starts_at>=now()-interval '180 days' and starts_at<now() and status not in ('cancelled','no_show') and coalesce(nullif(metadata->>'vehicleId',''),nullif(metadata->>'vehicle_id','')) is not null
      group by coalesce(nullif(metadata->>'vehicleId',''),nullif(metadata->>'vehicle_id',''))
    ) select count(*)::int vehicles,count(*) filter(where visits>=2)::int repeat_vehicles from vehicles`,[workspaceId]),
    query<any>(`select
      count(*) filter(where direction='income' and active=true and (ends_at is null or ends_at>=now()))::int active_income,
      count(*) filter(where direction='income' and active=true and ends_at>=now() and ends_at<now()+interval '30 days')::int expiring_30
      from recurring_rules where workspace_id=$1`,[workspaceId]),
    query<any>(`select count(*) filter(where occurred_at>=now()-interval '30 days')::int events_30,count(distinct type) filter(where occurred_at>=now()-interval '30 days')::int event_types_30 from business_events where workspace_id=$1`,[workspaceId])
  ]);
  const f=financeRows[0]||{},c=customerRows[0]||{},crm=crmRows[0]||{},a=agendaRows[0]||{},ac=agendaCustomerRows[0]||{},v=vehicleRows[0]||{},r=recurringRows[0]||{},ev=eventRows[0]||{};
  const revenue30=Number(f.revenue_30||0),revenuePrev30=Number(f.revenue_prev_30||0),receivable=Number(f.receivable||0),overdue=Number(f.overdue||0);
  const candidates:MetricCandidate[]=[
    {key:'paid_revenue_30_minor',value:Number(f.entries||0)>0?revenue30:null,unit:'BRL_minor',sourceReference:'nexoffice:ledger',confidence:.96,definition:'Entradas pagas nos últimos 30 dias.'},
    {key:'revenue_change_30_pct',value:revenuePrev30>0?round((revenue30-revenuePrev30)/revenuePrev30*100,1):null,unit:'%',sourceReference:'nexoffice:ledger',confidence:.94,definition:'Variação das entradas pagas dos últimos 30 dias contra os 30 dias anteriores.'},
    {key:'overdue_receivable_share_pct',value:receivable>0?ratioPct(overdue,receivable):Number(f.entries||0)>0?0:null,unit:'%',sourceReference:'nexoffice:ledger',confidence:.96,definition:'Percentual do saldo a receber registrado que está vencido.'},
    {key:'repeat_customer_rate_pct',value:Number(c.customers_180)>=3?ratioPct(Number(c.repeat_customers_180),Number(c.customers_180)):null,unit:'%',sourceReference:'nexoffice:ledger',confidence:.9,definition:'Parcela de clientes identificados com duas ou mais entradas pagas em 180 dias.',sampleSize:Number(c.customers_180||0)},
    {key:'client_retention_rate_pct',value:Number(c.previous_customers)>=3?ratioPct(Number(c.retained_customers),Number(c.previous_customers)):null,unit:'%',sourceReference:'nexoffice:ledger',confidence:.84,definition:'Proxy operacional de retenção: clientes pagantes da janela anterior que também pagaram na janela atual.',sampleSize:Number(c.previous_customers||0)},
    {key:'deal_win_rate_90',value:Number(crm.closed_90)>=3?ratioPct(Number(crm.won_90),Number(crm.closed_90)):null,unit:'%',sourceReference:'nexoffice:crm',confidence:.93,definition:'Negócios ganhos entre os negócios encerrados nos últimos 90 dias.',sampleSize:Number(crm.closed_90||0)},
    {key:'quote_approval_rate_pct',value:Number(crm.quotes_closed_90)>=3?ratioPct(Number(crm.quotes_won_90),Number(crm.quotes_closed_90)):null,unit:'%',sourceReference:'nexoffice:crm:explicit_quotes',confidence:.88,definition:'Aprovação somente de negócios explicitamente identificados como orçamento/quote/estimate.',sampleSize:Number(crm.quotes_closed_90||0)},
    {key:'appointment_problem_rate_pct',value:Number(a.appt_90)>=3?ratioPct(Number(a.problems_90),Number(a.appt_90)):null,unit:'%',sourceReference:'nexoffice:agenda',confidence:.94,definition:'Cancelamentos e ausências sobre compromissos dos últimos 90 dias.',sampleSize:Number(a.appt_90||0)},
    {key:'future_appointment_change_pct',value:Number(a.previous_30)>=3?round((Number(a.future_30)-Number(a.previous_30))/Number(a.previous_30)*100,1):null,unit:'%',sourceReference:'nexoffice:agenda',confidence:.92,definition:'Variação entre compromissos dos próximos 30 dias e dos 30 dias anteriores.',sampleSize:Number(a.previous_30||0)},
    {key:'return_rate_pct',value:Number(ac.history_contacts)>=3?ratioPct(Number(ac.returning_contacts),Number(ac.history_contacts)):null,unit:'%',sourceReference:'nexoffice:agenda',confidence:.86,definition:'Proxy administrativo agregado: contatos com dois ou mais atendimentos válidos em 180 dias.',sampleSize:Number(ac.history_contacts||0)},
    {key:'rebooking_rate_pct',value:Number(ac.recent_contacts)>=3?ratioPct(Number(ac.rebooked_contacts),Number(ac.recent_contacts)):null,unit:'%',sourceReference:'nexoffice:agenda',confidence:.86,definition:'Contatos atendidos nos últimos 60 dias que já possuem próximo compromisso nos 60 dias seguintes.',sampleSize:Number(ac.recent_contacts||0)},
    {key:'repeat_vehicle_rate_pct',value:Number(v.vehicles)>=3?ratioPct(Number(v.repeat_vehicles),Number(v.vehicles)):null,unit:'%',sourceReference:'nexoffice:agenda:vehicle_id',confidence:.9,definition:'Veículos identificados por vehicleId/vehicle_id com duas ou mais visitas em 180 dias.',sampleSize:Number(v.vehicles||0)},
    {key:'active_recurring_contracts',value:Number(r.active_income||0),unit:'count',sourceReference:'nexoffice:recurring_rules',confidence:.95,definition:'Regras de receita recorrente ativas no NexOffice.'},
    {key:'recurring_expiry_30_pct',value:Number(r.active_income)>0?ratioPct(Number(r.expiring_30),Number(r.active_income)):null,unit:'%',sourceReference:'nexoffice:recurring_rules',confidence:.92,definition:'Parcela das recorrências ativas com término previsto nos próximos 30 dias.',sampleSize:Number(r.active_income||0)},
    {key:'business_events_30',value:Number(ev.events_30||0),unit:'count',sourceReference:'nexoffice:event_bus',confidence:.98,definition:'Eventos operacionais registrados pelo Event Bus nos últimos 30 dias.'},
    {key:'business_event_types_30',value:Number(ev.event_types_30||0),unit:'count',sourceReference:'nexoffice:event_bus',confidence:.98,definition:'Tipos distintos de eventos operacionais registrados nos últimos 30 dias.'}
  ];
  return candidates;
}

async function buildCoverage(workspaceId:string,profile:any){
  const requirements=requirementsForProfile(profile);
  const [latestRows,sourceRows,historyRows]=await Promise.all([
    query<any>(`select distinct on(metric_key) metric_key,value_numeric,value_text,unit,source,source_reference,quality,confidence,observed_at,metadata from intelligence_metrics where workspace_id=$1 order by metric_key,observed_at desc`,[workspaceId]),
    query<any>(`select source,quality,count(*)::int observations,count(distinct metric_key)::int metrics,max(observed_at) last_observed_at from intelligence_metrics where workspace_id=$1 and observed_at>=now()-interval '180 days' group by source,quality order by observations desc`,[workspaceId]),
    query<any>(`select min(ts) first_seen from(
      select min(created_at) ts from crm_contacts where workspace_id=$1
      union all select min(created_at) from crm_deals where workspace_id=$1
      union all select min(coalesce(paid_at,created_at)) from ledger_entries where workspace_id=$1
      union all select min(starts_at) from appointments where workspace_id=$1
      union all select min(occurred_at) from business_events where workspace_id=$1
    ) x where ts is not null`,[workspaceId])
  ]);
  const latest=new Map(latestRows.map((x:any)=>[String(x.metric_key),x]));
  const statuses:any[]=[];let fresh=0,existing=0,automatic=0,stale=0;
  for(const requirement of requirements){
    if(requirement.key==='business_profile'){
      const completeness=Number(profile?.completeness_pct||0),available=completeness>=60;const age=profile?.updated_at?Math.max(0,Math.floor((Date.now()-new Date(profile.updated_at).getTime())/DAY)):9999;const isFresh=available&&age<=requirement.maxAgeDays;
      if(available)existing++;if(isFresh)fresh++;if(available&&!isFresh)stale++;
      statuses.push({...requirement,available,isFresh,automatic:false,ageDays:age,value:completeness,source:'client_reported'});continue;
    }
    const row:any=latest.get(requirement.key);const age=row?.observed_at?Math.max(0,Math.floor((Date.now()-new Date(row.observed_at).getTime())/DAY)):null;const available=Boolean(row),isFresh=available&&Number(age)<=requirement.maxAgeDays,isAutomatic=isFresh&&autoSources.has(String(row.source));
    if(available)existing++;if(isFresh)fresh++;if(isAutomatic)automatic++;if(available&&!isFresh)stale++;
    statuses.push({...requirement,available,isFresh,automatic:isAutomatic,ageDays:age,value:row?.value_numeric??row?.value_text??null,unit:row?.unit??null,source:row?.source??null,quality:row?.quality??null,confidence:row?.confidence==null?null:Number(row.confidence),observedAt:row?.observed_at??null,sourceReference:row?.source_reference??null});
  }
  const required=requirements.length,coveragePct=required?Math.round(fresh/required*100):0,freshnessPct=existing?Math.round(fresh/existing*100):0,automaticPct=fresh?Math.round(automatic/fresh*100):0;
  const firstSeen=historyRows[0]?.first_seen?new Date(historyRows[0].first_seen):null;const historyDays=firstSeen&&Number.isFinite(firstSeen.getTime())?Math.max(0,Math.floor((Date.now()-firstSeen.getTime())/DAY)):0;
  const status=coveragePct>=75&&historyDays>=60?'strong':coveragePct>=45&&historyDays>=14?'usable':'forming';
  const gaps=statuses.filter(x=>!x.isFresh).map(x=>({key:x.key,label:x.label,group:x.group,reason:x.available?'stale':x.key==='business_profile'?'incomplete_profile':'missing',collectionMode:x.collectionMode,sourceHint:x.sourceHint,priority:x.priority,ageDays:x.ageDays}));
  return{requirements,statuses,gaps,sources:sourceRows,coveragePct,freshnessPct,automaticPct,requiredMetrics:required,availableMetrics:fresh,automaticMetrics:automatic,staleMetrics:stale,historyDays,status};
}

export async function collectNativeBusinessMetrics(workspaceId:string,refresh=false){
  const profile=await getBusinessProfile(workspaceId),candidates=await nativeCandidates(workspaceId);let written=0;
  for(const candidate of candidates)if(await storeMetric(workspaceId,candidate,refresh))written++;
  const coverage=await buildCoverage(workspaceId,profile);
  const snapshot=(await query<any>(`insert into intelligence_data_coverage_snapshots(workspace_id,run_date,coverage_pct,freshness_pct,automatic_pct,required_metrics,available_metrics,automatic_metrics,stale_metrics,history_days,status,requirements,metric_status,gaps,sources,model_version) values($1,current_date,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'data-coverage-v1') on conflict(workspace_id,run_date,model_version) do update set coverage_pct=excluded.coverage_pct,freshness_pct=excluded.freshness_pct,automatic_pct=excluded.automatic_pct,required_metrics=excluded.required_metrics,available_metrics=excluded.available_metrics,automatic_metrics=excluded.automatic_metrics,stale_metrics=excluded.stale_metrics,history_days=excluded.history_days,status=excluded.status,requirements=excluded.requirements,metric_status=excluded.metric_status,gaps=excluded.gaps,sources=excluded.sources,updated_at=now() returning *`,[workspaceId,coverage.coveragePct,coverage.freshnessPct,coverage.automaticPct,coverage.requiredMetrics,coverage.availableMetrics,coverage.automaticMetrics,coverage.staleMetrics,coverage.historyDays,coverage.status,JSON.stringify(coverage.requirements),JSON.stringify(coverage.statuses),JSON.stringify(coverage.gaps),JSON.stringify(coverage.sources)]))[0];
  return{written,snapshot,coverage:{percent:coverage.coveragePct,freshnessPercent:coverage.freshnessPct,automaticPercent:coverage.automaticPct,historyDays:coverage.historyDays,status:coverage.status,required:coverage.requiredMetrics,available:coverage.availableMetrics,automatic:coverage.automaticMetrics,stale:coverage.staleMetrics},gaps:coverage.gaps,recommendedCheckins:coverage.gaps.filter((x:any)=>x.collectionMode==='ask_client').slice(0,4),sources:coverage.sources};
}

export async function readDataCoverage(workspaceId:string){
  const row=(await query<any>(`select * from intelligence_data_coverage_snapshots where workspace_id=$1 order by run_date desc,created_at desc limit 1`,[workspaceId]))[0];
  if(!row)return collectNativeBusinessMetrics(workspaceId,false);
  return{snapshot:row,coverage:{percent:Number(row.coverage_pct||0),freshnessPercent:Number(row.freshness_pct||0),automaticPercent:Number(row.automatic_pct||0),historyDays:Number(row.history_days||0),status:row.status,required:Number(row.required_metrics||0),available:Number(row.available_metrics||0),automatic:Number(row.automatic_metrics||0),stale:Number(row.stale_metrics||0)},gaps:row.gaps||[],recommendedCheckins:(row.gaps||[]).filter((x:any)=>x.collectionMode==='ask_client').slice(0,4),sources:row.sources||[]};
}

export async function readDataCoveragePortfolio(){
  const rows=await query<any>(`select w.id,w.name,coalesce(p.sector,w.vertical::text,'general') sector,c.coverage_pct,c.freshness_pct,c.automatic_pct,c.history_days,c.status,c.required_metrics,c.available_metrics,c.stale_metrics,c.gaps,c.run_date from workspaces w left join business_profiles p on p.workspace_id=w.id left join lateral(select * from intelligence_data_coverage_snapshots x where x.workspace_id=w.id order by run_date desc limit 1)c on true where w.status<>'cancelled' order by coalesce(c.coverage_pct,0) asc,w.name`);
  const summary=(await query<any>(`select count(*)::int companies,count(*) filter(where status='strong')::int strong,count(*) filter(where status='usable')::int usable,count(*) filter(where status='forming')::int forming,round(avg(coverage_pct),1) average_coverage,round(avg(automatic_pct),1) average_automatic from(select distinct on(workspace_id) * from intelligence_data_coverage_snapshots order by workspace_id,run_date desc)x`))[0]||{};
  return{summary,companies:rows};
}
