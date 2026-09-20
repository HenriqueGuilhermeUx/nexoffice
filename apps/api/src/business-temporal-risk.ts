import {query} from './db.js';
import {getBusinessProfile} from './business-intelligence.js';

type OntologyRow={id:string;sector:string;archetype:string;version:number;maturity:string;operational_asset:string;failure_mode:string;anticipation_min_days:number|null;anticipation_max_days:number|null;leading_signals:any;mitigating_actions:any;description:string|null};
type TemporalSignal={code:string;dimension:'finance'|'sales'|'customers'|'operation'|'resilience';severity:'attention'|'critical';title:string;whatChanged:string;whyItMatters:string;recommendation:string;currentValue:number;previousValue:number;deltaPct:number|null;horizonDays:number;confidence:number;evidence:Record<string,unknown>;ontologyId?:string|null;weight:number};

const n=(v:any)=>Number(v||0);
const round=(v:number,d=1)=>{const p=10**d;return Math.round(v*p)/p};
const clamp=(v:number,min=0,max=100)=>Math.max(min,Math.min(max,Math.round(v)));
const asArray=(v:any):any[]=>Array.isArray(v)?v:[];

function pctDelta(current:number,previous:number){return previous===0?null:round((current-previous)/previous*100,1)}
function confidenceFromSample(sample:number){return Math.min(.95,round(.55+Math.min(.4,(sample/20)*.4),2))}
function archetypeApplies(row:OntologyRow,profile:any){
  const sector=String(profile?.sector||'general');
  if(row.sector!=='all'&&row.sector!==sector)return false;
  if(row.archetype==='general')return true;
  if(row.archetype==='recurring')return Boolean(profile?.recurring_revenue)||String(profile?.revenue_model||'')==='recurring';
  if(row.archetype==='schedule')return Boolean(profile?.uses_agenda)||['services','health','beauty','automotive','professional_services'].includes(sector);
  if(row.archetype==='inventory')return Boolean(profile?.uses_inventory)||['commerce','retail','restaurant','food'].includes(sector);
  if(row.archetype==='enrollment')return sector==='education';
  return false;
}
function ontologySpecificity(row:OntologyRow,profile:any){
  let score=row.sector===String(profile?.sector||'general')?10:0;
  if(row.archetype!=='general')score+=5;
  score+=Number(row.version||0)/100;
  return score;
}
function signalConfig(ontologies:OntologyRow[],profile:any,code:string){
  const candidates=ontologies.filter(row=>archetypeApplies(row,profile)&&asArray(row.leading_signals).some((x:any)=>x?.code===code)).sort((a,b)=>ontologySpecificity(b,profile)-ontologySpecificity(a,profile));
  const ontology=candidates[0]||null;const item=ontology?asArray(ontology.leading_signals).find((x:any)=>x?.code===code):null;
  return{ontology,weight:Number(item?.weight||1),horizonDays:Number(item?.horizonDays||ontology?.anticipation_min_days||30)};
}

async function loadFacts(workspaceId:string){
  const [activity,agenda,stress]=await Promise.all([
    query<any>(`select
      (select count(*) from crm_deals where workspace_id=$1 and created_at>=now()-interval '30 days')::int deals_now,
      (select count(*) from crm_deals where workspace_id=$1 and created_at>=now()-interval '60 days' and created_at<now()-interval '30 days')::int deals_prev,
      (select count(*) from crm_contacts where workspace_id=$1 and created_at>=now()-interval '30 days')::int contacts_now,
      (select count(*) from crm_contacts where workspace_id=$1 and created_at>=now()-interval '60 days' and created_at<now()-interval '30 days')::int contacts_prev`,[workspaceId]),
    query<any>(`select
      (select count(*) from appointments where workspace_id=$1 and starts_at>=now() and starts_at<now()+interval '30 days' and status<>'cancelled')::int future_now,
      (select count(*) from appointments where workspace_id=$1 and starts_at>=now()-interval '30 days' and starts_at<now() and status<>'cancelled')::int recent_prev,
      (select count(*) from appointments where workspace_id=$1 and starts_at>=now()-interval '30 days' and starts_at<now())::int appt_now,
      (select count(*) from appointments where workspace_id=$1 and starts_at>=now()-interval '30 days' and starts_at<now() and status in ('cancelled','no_show'))::int problems_now,
      (select count(*) from appointments where workspace_id=$1 and starts_at>=now()-interval '60 days' and starts_at<now()-interval '30 days')::int appt_prev,
      (select count(*) from appointments where workspace_id=$1 and starts_at>=now()-interval '60 days' and starts_at<now()-interval '30 days' and status in ('cancelled','no_show'))::int problems_prev`,[workspaceId]),
    query<any>(`select
      (select value_numeric from intelligence_metrics where workspace_id=$1 and metric_key='overdue_receivable_share_pct' and value_numeric is not null order by observed_at desc limit 1) overdue_now,
      (select value_numeric from intelligence_metrics where workspace_id=$1 and metric_key='overdue_receivable_share_pct' and value_numeric is not null and observed_at<=now()-interval '14 days' order by observed_at desc limit 1) overdue_prev,
      (select observed_at from intelligence_metrics where workspace_id=$1 and metric_key='overdue_receivable_share_pct' and value_numeric is not null and observed_at<=now()-interval '14 days' order by observed_at desc limit 1) overdue_prev_at`,[workspaceId])
  ]);
  return{activity:activity[0]||{},agenda:agenda[0]||{},stress:stress[0]||{}};
}

function detect(profile:any,ontologies:OntologyRow[],facts:any){
  const signals:TemporalSignal[]=[];let evaluated=0;
  const a=facts.activity||{},g=facts.agenda||{},s=facts.stress||{};
  const push=(base:Omit<TemporalSignal,'ontologyId'|'weight'|'horizonDays'>,code:string)=>{const cfg=signalConfig(ontologies,profile,code);signals.push({...base,code,ontologyId:cfg.ontology?.id||null,weight:cfg.weight,horizonDays:cfg.horizonDays})};

  const dealsNow=n(a.deals_now),dealsPrev=n(a.deals_prev);
  if(dealsPrev>=4){evaluated++;const delta=pctDelta(dealsNow,dealsPrev);if(delta!==null&&delta<=-25)push({code:'sales_activity_drop',dimension:'sales',severity:delta<=-50?'critical':'attention',title:'Ritmo comercial perdeu força',whatChanged:`Foram ${dealsNow} novas oportunidades nos últimos 30 dias, contra ${dealsPrev} nos 30 dias anteriores (${Math.abs(delta)}% a menos).`,whyItMatters:'Menos oportunidades entrando hoje pode reduzir vendas e caixa nas próximas semanas.',recommendation:'Revise oportunidades paradas e reforce geração de demanda antes que o funil fique curto.',currentValue:dealsNow,previousValue:dealsPrev,deltaPct:delta,confidence:confidenceFromSample(dealsPrev),evidence:{windowDays:30,source:'crm_deals'}},'sales_activity_drop')}

  const contactsNow=n(a.contacts_now),contactsPrev=n(a.contacts_prev);
  if(contactsPrev>=4){evaluated++;const delta=pctDelta(contactsNow,contactsPrev);if(delta!==null&&delta<=-30)push({code:'customer_acquisition_drop',dimension:'customers',severity:delta<=-55?'critical':'attention',title:'Entrada de novos clientes desacelerou',whatChanged:`Entraram ${contactsNow} novos contatos nos últimos 30 dias, contra ${contactsPrev} no período anterior (${Math.abs(delta)}% a menos).`,whyItMatters:'A desaceleração da entrada de clientes costuma aparecer no faturamento depois.',recommendation:'Identifique o canal que perdeu ritmo e recupere prospecção, indicação ou campanhas.',currentValue:contactsNow,previousValue:contactsPrev,deltaPct:delta,confidence:confidenceFromSample(contactsPrev),evidence:{windowDays:30,source:'crm_contacts'}},'customer_acquisition_drop')}

  const usesAgenda=Boolean(profile?.uses_agenda)||['services','health','beauty','automotive','professional_services'].includes(String(profile?.sector||''));
  const future=n(g.future_now),recent=n(g.recent_prev);
  if(usesAgenda&&recent>=4){evaluated++;const delta=pctDelta(future,recent);if(delta!==null&&delta<=-20)push({code:'future_agenda_drop',dimension:'operation',severity:delta<=-40?'critical':'attention',title:'Agenda futura perdeu ocupação',whatChanged:`Os próximos 30 dias têm ${future} compromissos, contra ${recent} no período recente (${Math.abs(delta)}% a menos).`,whyItMatters:'Em negócios movidos por agenda, menor ocupação futura costuma chegar à receita depois.',recommendation:'Reforce confirmação, retorno, recompra e preenchimento de horários ociosos.',currentValue:future,previousValue:recent,deltaPct:delta,confidence:confidenceFromSample(recent),evidence:{windowDays:30,source:'appointments'}},'future_agenda_drop')}

  const apptNow=n(g.appt_now),apptPrev=n(g.appt_prev);
  if(usesAgenda&&apptNow>=5&&apptPrev>=5){evaluated++;const rateNow=round(n(g.problems_now)/apptNow*100,1),ratePrev=round(n(g.problems_prev)/apptPrev*100,1),rise=round(rateNow-ratePrev,1);if(rateNow>=15&&rise>=8)push({code:'appointment_problem_rise',dimension:'operation',severity:rateNow>=30||rise>=18?'critical':'attention',title:'Cancelamentos e ausências aumentaram',whatChanged:`As perdas de agenda subiram de ${ratePrev}% para ${rateNow}% nos últimos dois períodos de 30 dias.`,whyItMatters:'Mais faltas e cancelamentos reduzem produtividade e ocupação antes do efeito completo no caixa.',recommendation:'Revise confirmações, lembretes, remarcações e os motivos das perdas mais frequentes.',currentValue:rateNow,previousValue:ratePrev,deltaPct:ratePrev>0?round((rateNow-ratePrev)/ratePrev*100,1):null,confidence:confidenceFromSample(Math.min(apptNow,apptPrev)),evidence:{windowDays:30,source:'appointments',rateRisePoints:rise}},'appointment_problem_rise')}

  if(s.overdue_now!==null&&s.overdue_now!==undefined&&s.overdue_prev!==null&&s.overdue_prev!==undefined){evaluated++;const current=Number(s.overdue_now),previous=Number(s.overdue_prev),rise=round(current-previous,1);if(current>=10&&rise>=5)push({code:'receivable_stress_rise',dimension:'finance',severity:current>=25&&rise>=10?'critical':'attention',title:'Pressão de recebimentos está aumentando',whatChanged:`A parcela vencida dos recebíveis passou de ${round(previous)}% para ${round(current)}%.`,whyItMatters:'A piora do recebimento pode pressionar caixa mesmo quando as vendas ainda parecem estáveis.',recommendation:'Priorize os maiores vencidos e acompanhe se a taxa volta a cair nas próximas leituras.',currentValue:current,previousValue:previous,deltaPct:previous>0?round((current-previous)/previous*100,1):null,confidence:.85,evidence:{source:'intelligence_metrics',previousObservedAt:s.overdue_prev_at||null}},'receivable_stress_rise')}

  return{signals,evaluated};
}

export async function buildTemporalRisk(workspaceId:string){
  const profile=await getBusinessProfile(workspaceId);
  const ontologies=(await query<OntologyRow>(`select * from sector_ontologies where active=true and (sector='all' or sector=$1) order by sector,archetype,version desc`,[String(profile?.sector||'general')])).filter(row=>archetypeApplies(row,profile));
  const facts=await loadFacts(workspaceId);const detected=detect(profile,ontologies,facts);
  await query(`update intelligence_temporal_signals set active=false,resolved_at=coalesce(resolved_at,now()),updated_at=now() where workspace_id=$1 and run_date<current_date and active=true`,[workspaceId]);
  for(const signal of detected.signals){
    await query(`insert into intelligence_temporal_signals(workspace_id,ontology_id,run_date,code,dimension,severity,title,what_changed,why_it_matters,recommendation,current_value,previous_value,delta_pct,horizon_days,confidence,evidence,active)
      values($1,$2,current_date,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,true)
      on conflict(workspace_id,run_date,code) do update set ontology_id=excluded.ontology_id,dimension=excluded.dimension,severity=excluded.severity,title=excluded.title,what_changed=excluded.what_changed,why_it_matters=excluded.why_it_matters,recommendation=excluded.recommendation,current_value=excluded.current_value,previous_value=excluded.previous_value,delta_pct=excluded.delta_pct,horizon_days=excluded.horizon_days,confidence=excluded.confidence,evidence=excluded.evidence,active=true,resolved_at=null,updated_at=now()`,[workspaceId,signal.ontologyId||null,signal.code,signal.dimension,signal.severity,signal.title,signal.whatChanged,signal.whyItMatters,signal.recommendation,signal.currentValue,signal.previousValue,signal.deltaPct,signal.horizonDays,signal.confidence,JSON.stringify(signal.evidence)]);
  }
  const stress=clamp(detected.signals.reduce((sum,s)=>sum+(s.severity==='critical'?28:14)*Math.max(.5,s.weight),0));
  const posture=stress>=55?'elevated':stress>=20?'attention':'normal';
  const previous=(await query<any>(`select operational_stress_index from intelligence_risk_snapshots where workspace_id=$1 and run_date<current_date and model_version='temporal-risk-v2' order by run_date desc limit 1`,[workspaceId]))[0];
  const diff=previous?stress-Number(previous.operational_stress_index||0):0;const trend=diff>=10?'worsening':diff<=-10?'improving':'stable';
  const knowledge=(await query<any>(`select knowledge_pct from intelligence_snapshots where workspace_id=$1 order by as_of desc limit 1`,[workspaceId]))[0];
  const confidence=Math.min(.95,round(.35+Math.min(.35,detected.evaluated*.08)+Math.min(.25,n(knowledge?.knowledge_pct)/100*.25),2));
  const versions=Object.fromEntries(ontologies.map(o=>[`${o.sector}:${o.archetype}`,o.version]));
  const snapshot=(await query<any>(`insert into intelligence_risk_snapshots(workspace_id,run_date,operational_stress_index,posture,trend,confidence,sector,ontology_versions,signal_summary,evidence,model_version)
    values($1,current_date,$2,$3,$4,$5,$6,$7,$8,$9,'temporal-risk-v2')
    on conflict(workspace_id,run_date,model_version) do update set operational_stress_index=excluded.operational_stress_index,posture=excluded.posture,trend=excluded.trend,confidence=excluded.confidence,sector=excluded.sector,ontology_versions=excluded.ontology_versions,signal_summary=excluded.signal_summary,evidence=excluded.evidence,as_of=now()
    returning *`,[workspaceId,stress,posture,trend,confidence,String(profile?.sector||'general'),JSON.stringify(versions),JSON.stringify(detected.signals.map(s=>({code:s.code,severity:s.severity,horizonDays:s.horizonDays,confidence:s.confidence}))),JSON.stringify({detectorsEvaluated:detected.evaluated,signalCount:detected.signals.length})]))[0];
  return{snapshot,signals:detected.signals,ontologies,evaluatedDetectors:detected.evaluated};
}

export async function readBusinessTrajectory(workspaceId:string){
  const snapshot=(await query<any>(`select * from intelligence_risk_snapshots where workspace_id=$1 and model_version='temporal-risk-v2' order by run_date desc limit 1`,[workspaceId]))[0]||null;
  const signals=await query<any>(`select code,dimension,severity,title,what_changed,why_it_matters,recommendation,current_value,previous_value,delta_pct,horizon_days,confidence,run_date from intelligence_temporal_signals where workspace_id=$1 and active=true order by case severity when 'critical' then 1 else 2 end,confidence desc,created_at desc limit 20`,[workspaceId]);
  return{available:Boolean(snapshot),generatedAt:snapshot?.as_of||null,movements:signals.map(s=>({code:s.code,severity:s.severity,title:s.title,whatChanged:s.what_changed,whyItMatters:s.why_it_matters,action:s.recommendation,horizonDays:s.horizon_days,runDate:s.run_date})),message:signals.length?'O NexOffice encontrou mudanças de comportamento que merecem acompanhamento.':'Nenhuma deterioração temporal relevante foi detectada com os dados disponíveis agora.',note:'Esta leitura compara a empresa com ela mesma ao longo do tempo. É apoio à gestão, não nota de crédito nem previsão garantida.'};
}

export async function readInternalRiskDetail(workspaceId:string){
  const [profile,snapshots,signals,ontologies]=await Promise.all([
    getBusinessProfile(workspaceId),
    query<any>(`select * from intelligence_risk_snapshots where workspace_id=$1 order by run_date desc limit 180`,[workspaceId]),
    query<any>(`select s.*,o.sector ontology_sector,o.archetype ontology_archetype,o.version ontology_version,o.maturity ontology_maturity,o.operational_asset,o.failure_mode from intelligence_temporal_signals s left join sector_ontologies o on o.id=s.ontology_id where s.workspace_id=$1 order by s.run_date desc,s.created_at desc limit 500`,[workspaceId]),
    query<any>(`select * from sector_ontologies where active=true and (sector='all' or sector=(select sector from business_profiles where workspace_id=$1)) order by sector,archetype,version desc`,[workspaceId])
  ]);
  return{profile,current:snapshots[0]||null,history:snapshots,signals,ontologies};
}

export async function listSectorOntologies(){return query<any>(`select * from sector_ontologies order by sector,archetype,version desc`)}
