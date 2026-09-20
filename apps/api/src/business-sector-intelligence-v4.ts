import {query} from './db.js';
import {getBusinessProfile} from './business-intelligence.js';
import {getSectorCheckin,runSectorIntelligenceV3} from './business-sector-intelligence-v3.js';

type Dimension='finance'|'sales'|'customers'|'operation'|'resilience';
type ExtraField={key:string;label:string;unit:string;help:string;min?:number;max?:number};
type Observation={code:string;dimension:Dimension;currentValue:number;previousValue:number|null;deltaPct:number|null;triggered:boolean;evidence:Record<string,unknown>};
type Signal=Observation&{severity:'attention'|'critical';title:string;whatChanged:string;whyItMatters:string;recommendation:string;confidence:number;ontologyId:string|null;weight:number;horizonDays:number};

const DAY=86_400_000;
const round=(v:number,d=1)=>{const p=10**d;return Math.round(v*p)/p};
const pctDelta=(current:number,previous:number|null)=>previous===null||previous===0?null:round((current-previous)/previous*100,1);

const extraCatalog:Record<string,ExtraField>={
  contract_renewal_rate_pct:{key:'contract_renewal_rate_pct',label:'Renovação de contratos',unit:'%',help:'Percentual de contratos elegíveis que renovaram no período.',min:0,max:100},
  billable_utilization_pct:{key:'billable_utilization_pct',label:'Utilização faturável',unit:'%',help:'Percentual da capacidade produtiva que virou trabalho faturável.',min:0,max:100},
  client_retention_rate_pct:{key:'client_retention_rate_pct',label:'Retenção de clientes',unit:'%',help:'Percentual da carteira ativa que permaneceu no período.',min:0,max:100},
  bay_occupancy_pct:{key:'bay_occupancy_pct',label:'Ocupação da capacidade',unit:'%',help:'Percentual de boxes, elevadores ou capacidade produtiva ocupada.',min:0,max:100},
  quote_approval_rate_pct:{key:'quote_approval_rate_pct',label:'Aprovação de orçamentos',unit:'%',help:'Percentual dos orçamentos apresentados que foram aprovados.',min:0,max:100},
  repeat_vehicle_rate_pct:{key:'repeat_vehicle_rate_pct',label:'Veículos que retornaram',unit:'%',help:'Percentual de veículos/clientes que retornaram para novo serviço.',min:0,max:100},
  occupancy_rate_pct:{key:'occupancy_rate_pct',label:'Ocupação da agenda',unit:'%',help:'Percentual da capacidade administrativa disponível que foi ocupada.',min:0,max:100},
  return_rate_pct:{key:'return_rate_pct',label:'Taxa de retorno',unit:'%',help:'Percentual agregado de clientes/pacientes que retornaram no período.',min:0,max:100},
  rebooking_rate_pct:{key:'rebooking_rate_pct',label:'Reagendamento / próxima visita',unit:'%',help:'Percentual de clientes que já saem com próximo atendimento programado.',min:0,max:100}
};

function extraFields(profile:any):ExtraField[]{
  const sector=String(profile?.sector||'general');
  const keys:string[]=[];
  if(sector==='professional_services')keys.push('contract_renewal_rate_pct','billable_utilization_pct','client_retention_rate_pct');
  if(sector==='automotive')keys.push('bay_occupancy_pct','quote_approval_rate_pct','repeat_vehicle_rate_pct');
  if(sector==='health')keys.push('occupancy_rate_pct','return_rate_pct');
  if(sector==='beauty')keys.push('occupancy_rate_pct','return_rate_pct','rebooking_rate_pct');
  return keys.map(k=>extraCatalog[k]).filter(Boolean);
}

async function metricPair(workspaceId:string,key:string,minGapDays=14){
  const rows=await query<any>(`select value_numeric,observed_at,source,quality from intelligence_metrics where workspace_id=$1 and metric_key=$2 and value_numeric is not null order by observed_at desc limit 40`,[workspaceId,key]);
  if(!rows.length)return{current:null,previous:null};
  const current=rows[0],cutoff=new Date(current.observed_at).getTime()-minGapDays*DAY;
  const previous=rows.find((x:any,i:number)=>i>0&&new Date(x.observed_at).getTime()<=cutoff)||null;
  return{current,previous};
}

async function ontologyConfig(sector:string,code:string){
  const rows=await query<any>(`select id,sector,archetype,version,leading_signals,anticipation_min_days from sector_ontologies where active=true and (sector='all' or sector=$1) order by case when sector=$1 then 0 else 1 end,version desc`,[sector]);
  for(const row of rows){const list=Array.isArray(row.leading_signals)?row.leading_signals:[];const item=list.find((x:any)=>x?.code===code);if(item)return{ontologyId:String(row.id),weight:Number(item.weight||1),horizonDays:Number(item.horizonDays||row.anticipation_min_days||30)}}
  return{ontologyId:null,weight:1,horizonDays:30};
}

async function pushSignal(target:Signal[],sector:string,base:Omit<Signal,'ontologyId'|'weight'|'horizonDays'>){const cfg=await ontologyConfig(sector,base.code);target.push({...base,...cfg})}

async function evaluateDrop(workspaceId:string,sector:string,def:{key:string;code:string;dimension:Dimension;threshold:number;critical:number;title:string;why:string;action:string},observations:Observation[],signals:Signal[]){
  const pair=await metricPair(workspaceId,def.key,14);if(!pair.current||!pair.previous)return;
  const current=Number(pair.current.value_numeric),previous=Number(pair.previous.value_numeric),points=round(current-previous,1),triggered=points<=-def.threshold;
  const observation:Observation={code:def.code,dimension:def.dimension,currentValue:current,previousValue:previous,deltaPct:pctDelta(current,previous),triggered,evidence:{engine:'sector-intelligence-v4',source:'sector_checkin',metricKey:def.key,desiredDirection:'up'}};
  observations.push(observation);
  if(triggered)await pushSignal(signals,sector,{...observation,severity:Math.abs(points)>=def.critical?'critical':'attention',title:def.title,whatChanged:`O indicador passou de ${round(previous)}% para ${round(current)}%.`,whyItMatters:def.why,recommendation:def.action,confidence:.78});
}

export async function runSectorIntelligenceV4(workspaceId:string){
  const base=await runSectorIntelligenceV3(workspaceId);
  const profile=await getBusinessProfile(workspaceId),sector=String(profile?.sector||'general');
  const observations:Observation[]=[],signals:Signal[]=[];
  const defs:Array<{key:string;code:string;dimension:Dimension;threshold:number;critical:number;title:string;why:string;action:string}>=[];

  if(sector==='professional_services')defs.push(
    {key:'contract_renewal_rate_pct',code:'pro_contract_renewal_drop',dimension:'resilience',threshold:8,critical:18,title:'Renovação de contratos perdeu força',why:'Menos renovação reduz receita futura e previsibilidade da carteira antes de o efeito aparecer no caixa.',action:'Antecipe as renovações de maior valor e registre o motivo dos contratos em risco.'},
    {key:'billable_utilization_pct',code:'pro_billable_utilization_drop',dimension:'operation',threshold:10,critical:20,title:'Capacidade faturável caiu',why:'Equipe ocupada sem conversão em trabalho faturável pode reduzir margem e produtividade.',action:'Separe horas produtivas, retrabalho, espera e capacidade ociosa; recupere o gargalo com maior impacto.'},
    {key:'client_retention_rate_pct',code:'pro_client_retention_drop',dimension:'customers',threshold:8,critical:18,title:'Retenção da carteira caiu',why:'Saída de clientes recorrentes aumenta a necessidade de aquisição e reduz previsibilidade.',action:'Revise perdas recentes e atue primeiro nos clientes de maior valor e maior chance de recuperação.'}
  );
  if(sector==='automotive')defs.push(
    {key:'bay_occupancy_pct',code:'automotive_bay_occupancy_drop',dimension:'operation',threshold:10,critical:20,title:'Capacidade da oficina perdeu ocupação',why:'Menor ocupação produtiva tende a reduzir ordens de serviço e faturamento futuro.',action:'Retome orçamentos, manutenção preventiva e clientes sem retorno antes de ampliar aquisição.'},
    {key:'quote_approval_rate_pct',code:'automotive_quote_approval_drop',dimension:'sales',threshold:10,critical:20,title:'Aprovação de orçamentos caiu',why:'Mais orçamento sem aprovação reduz produção futura mesmo com entrada de veículos estável.',action:'Separe recusas por preço, prazo, peça e confiança; retome primeiro os orçamentos de maior valor.'},
    {key:'repeat_vehicle_rate_pct',code:'automotive_repeat_vehicle_drop',dimension:'customers',threshold:8,critical:18,title:'Retorno de veículos perdeu ritmo',why:'Menos retorno reduz recorrência e enfraquece a carteira antes de aparecer no faturamento.',action:'Ative lembretes de manutenção e recupere clientes com histórico de serviço e retorno vencido.'}
  );
  if(sector==='health')defs.push(
    {key:'occupancy_rate_pct',code:'health_occupancy_drop',dimension:'operation',threshold:10,critical:20,title:'Ocupação administrativa caiu',why:'Menor ocupação da capacidade de atendimento reduz produção futura antes do efeito financeiro completo.',action:'Recupere horários ociosos com confirmação, remarcação e retornos administrativamente elegíveis.'},
    {key:'return_rate_pct',code:'health_return_drop',dimension:'customers',threshold:8,critical:18,title:'Retorno administrativo perdeu ritmo',why:'Menor continuidade de atendimento pode reduzir ocupação e previsibilidade operacional.',action:'Revise retornos pendentes e falhas administrativas de agendamento, sem usar conteúdo clínico para esta decisão.'}
  );
  if(sector==='beauty')defs.push(
    {key:'occupancy_rate_pct',code:'beauty_occupancy_drop',dimension:'operation',threshold:10,critical:20,title:'Ocupação da agenda caiu',why:'Capacidade ociosa aparece antes da queda consolidada do faturamento.',action:'Preencha janelas ociosas com retorno, recompra e reagendamento dos clientes já conhecidos.'},
    {key:'return_rate_pct',code:'beauty_return_drop',dimension:'customers',threshold:8,critical:18,title:'Retorno de clientes caiu',why:'Menos retorno enfraquece a recorrência e aumenta dependência de aquisição.',action:'Identifique clientes que passaram do ciclo normal de retorno e priorize reativação.'},
    {key:'rebooking_rate_pct',code:'beauty_rebooking_drop',dimension:'resilience',threshold:10,critical:20,title:'Reagendamento perdeu força',why:'Menos clientes saindo com a próxima visita marcada reduz visibilidade da agenda futura.',action:'Padronize o convite ao próximo agendamento e acompanhe quais serviços têm pior recorrência.'}
  );
  for(const def of defs)await evaluateDrop(workspaceId,sector,def,observations,signals);

  await query(`update intelligence_temporal_signals set active=false,resolved_at=coalesce(resolved_at,now()),updated_at=now() where workspace_id=$1 and run_date=current_date and evidence->>'engine'='sector-intelligence-v4'`,[workspaceId]);
  for(const observation of observations)await query(`insert into intelligence_temporal_observations(workspace_id,run_date,code,dimension,current_value,previous_value,delta_pct,signal_triggered,source,evidence) values($1,current_date,$2,$3,$4,$5,$6,$7,'sector_intelligence_v4',$8) on conflict(workspace_id,run_date,code) do update set dimension=excluded.dimension,current_value=excluded.current_value,previous_value=excluded.previous_value,delta_pct=excluded.delta_pct,signal_triggered=excluded.signal_triggered,source=excluded.source,evidence=excluded.evidence,updated_at=now()`,[workspaceId,observation.code,observation.dimension,observation.currentValue,observation.previousValue,observation.deltaPct,observation.triggered,JSON.stringify(observation.evidence)]);
  for(const signal of signals)await query(`insert into intelligence_temporal_signals(workspace_id,ontology_id,run_date,code,dimension,severity,title,what_changed,why_it_matters,recommendation,current_value,previous_value,delta_pct,horizon_days,confidence,evidence,active) values($1,$2,current_date,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,true) on conflict(workspace_id,run_date,code) do update set ontology_id=excluded.ontology_id,dimension=excluded.dimension,severity=excluded.severity,title=excluded.title,what_changed=excluded.what_changed,why_it_matters=excluded.why_it_matters,recommendation=excluded.recommendation,current_value=excluded.current_value,previous_value=excluded.previous_value,delta_pct=excluded.delta_pct,horizon_days=excluded.horizon_days,confidence=excluded.confidence,evidence=excluded.evidence,active=true,resolved_at=null,updated_at=now()`,[workspaceId,signal.ontologyId,signal.code,signal.dimension,signal.severity,signal.title,signal.whatChanged,signal.whyItMatters,signal.recommendation,signal.currentValue,signal.previousValue,signal.deltaPct,signal.horizonDays,signal.confidence,JSON.stringify({...signal.evidence,weight:signal.weight})]);

  const all=await query<any>(`select s.code,s.severity,s.confidence,s.horizon_days,s.evidence,o.leading_signals from intelligence_temporal_signals s left join sector_ontologies o on o.id=s.ontology_id where s.workspace_id=$1 and s.run_date=current_date and s.active=true`,[workspaceId]);
  let stress=0;for(const row of all){const list=Array.isArray(row.leading_signals)?row.leading_signals:[],item=list.find((x:any)=>x?.code===row.code),weight=Number(item?.weight||row.evidence?.weight||1);stress+=(row.severity==='critical'?28:14)*Math.max(.5,weight)}stress=Math.max(0,Math.min(100,Math.round(stress)));
  const posture=stress>=55?'elevated':stress>=20?'attention':'normal';const previous=(await query<any>(`select operational_stress_index from intelligence_risk_snapshots where workspace_id=$1 and run_date<current_date order by run_date desc limit 1`,[workspaceId]))[0];const diff=previous?stress-Number(previous.operational_stress_index||0):0,trend=diff>=10?'worsening':diff<=-10?'improving':'stable';
  await query(`update intelligence_risk_snapshots set operational_stress_index=$2,posture=$3,trend=$4,signal_summary=$5,evidence=coalesce(evidence,'{}'::jsonb)||$6::jsonb,as_of=now() where workspace_id=$1 and run_date=current_date and model_version='temporal-risk-v2'`,[workspaceId,stress,posture,trend,JSON.stringify(all.map((x:any)=>({code:x.code,severity:x.severity,horizonDays:x.horizon_days,confidence:Number(x.confidence)}))),JSON.stringify({sectorEngine:'sector-intelligence-v4',sectorV4DetectorsEvaluated:observations.length,sectorV4Signals:signals.length})]);
  return{...base,observations:Number(base.observations||0)+observations.length,signals:Number(base.signals||0)+signals.length,v4Observations:observations.length,v4Signals:signals.length,v4Codes:signals.map(x=>x.code),stress,posture,trend};
}

export async function getSectorCheckinV4(workspaceId:string){
  const [profile,base]=await Promise.all([getBusinessProfile(workspaceId),getSectorCheckin(workspaceId)]);const fields=[...(base.fields||[]),...extraFields(profile)];const seen=new Set<string>(),unique=fields.filter((x:any)=>x?.key&&!seen.has(x.key)&&seen.add(x.key));const latest:{[key:string]:any}={...(base.latest||{})};
  for(const field of unique)if(latest[field.key]===undefined)latest[field.key]=(await query<any>(`select value_numeric,observed_at,source from intelligence_metrics where workspace_id=$1 and metric_key=$2 and value_numeric is not null order by observed_at desc limit 1`,[workspaceId,field.key]))[0]||null;
  return{sector:String(profile?.sector||'general'),fields:unique,latest};
}

export async function recordSectorCheckinV4(workspaceId:string,values:Record<string,number>){
  const checkin=await getSectorCheckinV4(workspaceId),allowed=new Map((checkin.fields||[]).map((x:any)=>[x.key,x]));
  for(const [key,value] of Object.entries(values)){const field:any=allowed.get(key);if(!field||!Number.isFinite(value))continue;if(field.min!==undefined&&value<field.min)continue;if(field.max!==undefined&&value>field.max)continue;await query(`insert into intelligence_metrics(workspace_id,metric_key,value_numeric,unit,source,quality,confidence,observed_at,metadata) values($1,$2,$3,$4,'client_reported','medium',0.75,now(),$5)`,[workspaceId,key,value,field.unit,JSON.stringify({origin:'sector_checkin_v4'})])}
  return runSectorIntelligenceV4(workspaceId);
}
