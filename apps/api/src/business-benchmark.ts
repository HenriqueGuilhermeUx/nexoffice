import {query} from './db.js';

const MIN_SAMPLE=10;
const MIN_KNOWLEDGE=40;
const MAX_SNAPSHOT_AGE_DAYS=45;
const MODEL_VERSION='anonymous-benchmark-v1';

const clean=(v:unknown,fallback='general')=>String(v??fallback).trim().toLowerCase().replace(/[|:]/g,'_')||fallback;
const num=(v:unknown)=>{const n=Number(v);return Number.isFinite(n)?n:null};
const round=(v:number,d=2)=>{const p=10**d;return Math.round(v*p)/p};
const asObject=(v:any):Record<string,any>=>v&&typeof v==='object'?v:{};

export type BenchmarkMetricDefinition={key:string;label:string;unit:'score'|'percent'|'months';direction:'higher'|'lower';source:'column'|'metrics'};
export const BENCHMARK_METRICS:BenchmarkMetricDefinition[]=[
  {key:'overall_score',label:'Saúde geral',unit:'score',direction:'higher',source:'column'},
  {key:'finance_score',label:'Saúde financeira',unit:'score',direction:'higher',source:'column'},
  {key:'sales_score',label:'Saúde das vendas',unit:'score',direction:'higher',source:'column'},
  {key:'customer_score',label:'Saúde dos clientes',unit:'score',direction:'higher',source:'column'},
  {key:'operation_score',label:'Saúde da operação',unit:'score',direction:'higher',source:'column'},
  {key:'resilience_score',label:'Resistência do negócio',unit:'score',direction:'higher',source:'column'},
  {key:'overdue_receivable_share_pct',label:'Recebíveis vencidos',unit:'percent',direction:'lower',source:'metrics'},
  {key:'top_client_share_pct',label:'Dependência do maior cliente',unit:'percent',direction:'lower',source:'metrics'},
  {key:'task_overdue_rate_pct',label:'Tarefas atrasadas',unit:'percent',direction:'lower',source:'metrics'},
  {key:'appointment_problem_rate_pct',label:'Perdas na agenda',unit:'percent',direction:'lower',source:'metrics'},
  {key:'pipeline_coverage_months',label:'Cobertura do funil comercial',unit:'months',direction:'higher',source:'metrics'},
  {key:'cash_coverage_months',label:'Cobertura de caixa',unit:'months',direction:'higher',source:'metrics'}
];
const METRIC_BY_KEY=new Map(BENCHMARK_METRICS.map(x=>[x.key,x]));

function sizeBand(employeeCount:unknown){const n=num(employeeCount);if(n===null)return null;if(n<=1)return 'solo';if(n<=9)return 'micro';if(n<=49)return 'pequena';return 'media_maior'}
function sizeLabel(v:string|null){return({solo:'1 pessoa',micro:'2 a 9 pessoas',pequena:'10 a 49 pessoas',media_maior:'50 ou mais pessoas'} as Record<string,string>)[String(v)]||null}
function sectorLabel(v:string){return({general:'Geral',services:'Serviços',professional_services:'Serviços profissionais',health:'Saúde',beauty:'Beleza e bem-estar',commerce:'Comércio',restaurant:'Alimentação',food:'Alimentação',education:'Educação',automotive:'Automotivo',real_estate:'Imobiliário',creator:'Criadores'} as Record<string,string>)[v]||v}
function revenueLabel(v:string|null){return({mixed:'receita mista',recurring:'receita recorrente',transactional:'receita por vendas',services:'serviços',products:'produtos'} as Record<string,string>)[String(v)]||String(v||'')}
function cohortKey(sector:string,revenueModel?:string|null,size?:string|null){const s=`sector:${clean(sector)}`;if(revenueModel&&size)return`${s}|model:${clean(revenueModel)}|size:${clean(size)}`;if(revenueModel)return`${s}|model:${clean(revenueModel)}`;return s}
function cohortCandidates(profile:any){const sector=clean(profile?.sector||profile?.vertical||'general');const model=clean(profile?.revenue_model||'mixed','mixed');const size=sizeBand(profile?.employee_count);const out:Array<{key:string;level:'sector_model_size'|'sector_model'|'sector';sector:string;revenueModel:string|null;sizeBand:string|null}>=[];if(size)out.push({key:cohortKey(sector,model,size),level:'sector_model_size',sector,revenueModel:model,sizeBand:size});out.push({key:cohortKey(sector,model),level:'sector_model',sector,revenueModel:model,sizeBand:null});out.push({key:cohortKey(sector),level:'sector',sector,revenueModel:null,sizeBand:null});return out}
function quantile(values:number[],q:number){const a=[...values].sort((x,y)=>x-y);if(!a.length)return 0;const pos=(a.length-1)*q;const base=Math.floor(pos),rest=pos-base;return a[base+1]!==undefined?a[base]+rest*(a[base+1]-a[base]):a[base]}
function metricValue(row:any,def:BenchmarkMetricDefinition){return num(def.source==='column'?row[def.key]:asObject(row.metrics)[def.key])}

export async function rebuildAnonymousBenchmarks(){
  const run=(await query<any>(`insert into intelligence_benchmark_runs(status) values('running') returning id`))[0];
  try{
    const rows=await query<any>(`select w.id,w.vertical::text vertical,p.sector,p.revenue_model,p.employee_count,
      s.as_of,s.knowledge_pct,s.overall_score,s.finance_score,s.sales_score,s.customer_score,s.operation_score,s.resilience_score,s.metrics
      from workspaces w left join business_profiles p on p.workspace_id=w.id
      join lateral(select * from intelligence_snapshots x where x.workspace_id=w.id order by as_of desc limit 1) s on true
      where w.status<>'cancelled' and s.as_of>=now()-($1::text||' days')::interval and s.knowledge_pct>=$2`,[String(MAX_SNAPSHOT_AGE_DAYS),MIN_KNOWLEDGE]);
    const cohorts=new Map<string,{key:string;level:'sector'|'sector_model'|'sector_model_size';sector:string;revenueModel:string|null;sizeBand:string|null;rows:any[]}>();
    for(const row of rows){for(const c of cohortCandidates({...row,sector:row.sector||row.vertical})){const existing=cohorts.get(c.key)||{...c,rows:[]};existing.rows.push(row);cohorts.set(c.key,existing)}}
    await query(`delete from intelligence_benchmark_snapshots where snapshot_date=current_date`);
    let metricRows=0,cohortsCreated=0;
    for(const cohort of cohorts.values()){
      if(cohort.rows.length<MIN_SAMPLE)continue;let insertedForCohort=0;
      for(const def of BENCHMARK_METRICS){const values=cohort.rows.map(r=>metricValue(r,def)).filter((v):v is number=>v!==null);if(values.length<MIN_SAMPLE)continue;const p25=round(quantile(values,.25)),median=round(quantile(values,.5)),p75=round(quantile(values,.75)),mean=round(values.reduce((a,b)=>a+b,0)/values.length);await query(`insert into intelligence_benchmark_snapshots(snapshot_date,cohort_key,cohort_level,sector,revenue_model,size_band,metric_key,sample_size,p25,median,p75,mean,privacy_minimum,model_version) values(current_date,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) on conflict(snapshot_date,cohort_key,metric_key) do update set sample_size=excluded.sample_size,p25=excluded.p25,median=excluded.median,p75=excluded.p75,mean=excluded.mean,created_at=now()`,[cohort.key,cohort.level,cohort.sector,cohort.revenueModel,cohort.sizeBand,def.key,values.length,p25,median,p75,mean,MIN_SAMPLE,MODEL_VERSION]);metricRows++;insertedForCohort++}
      if(insertedForCohort)cohortsCreated++;
    }
    const summary={eligibleWorkspaces:rows.length,cohortsCreated,metricRowsCreated:metricRows,privacyMinimum:MIN_SAMPLE,minKnowledge:MIN_KNOWLEDGE,maxSnapshotAgeDays:MAX_SNAPSHOT_AGE_DAYS,modelVersion:MODEL_VERSION};
    await query(`update intelligence_benchmark_runs set status='completed',eligible_workspaces=$2,cohorts_created=$3,metric_rows_created=$4,summary=$5::jsonb,completed_at=now() where id=$1`,[run.id,rows.length,cohortsCreated,metricRows,JSON.stringify(summary)]);return summary;
  }catch(error){await query(`update intelligence_benchmark_runs set status='failed',last_error=$2,completed_at=now() where id=$1`,[run.id,error instanceof Error?error.message:String(error)]);throw error}
}

export async function getAnonymousBusinessBenchmark(workspaceId:string){
  const current=(await query<any>(`select w.id,w.vertical::text vertical,p.sector,p.revenue_model,p.employee_count,s.as_of,s.knowledge_pct,s.overall_score,s.finance_score,s.sales_score,s.customer_score,s.operation_score,s.resilience_score,s.metrics from workspaces w left join business_profiles p on p.workspace_id=w.id left join lateral(select * from intelligence_snapshots x where x.workspace_id=w.id order by as_of desc limit 1) s on true where w.id=$1`,[workspaceId]))[0];
  if(!current?.as_of)return{available:false,reason:'Ainda não há leitura suficiente da sua empresa.',privacyMinimum:MIN_SAMPLE};
  const latest=(await query<any>(`select max(snapshot_date) snapshot_date from intelligence_benchmark_snapshots`))[0]?.snapshot_date;if(!latest)return{available:false,reason:'A base anônima ainda está sendo formada.',privacyMinimum:MIN_SAMPLE};
  const candidates=cohortCandidates({...current,sector:current.sector||current.vertical});const keys=candidates.map(x=>x.key);const rows=await query<any>(`select * from intelligence_benchmark_snapshots where snapshot_date=$1 and cohort_key=any($2::text[]) order by cohort_level,metric_key`,[latest,keys]);const grouped=new Map<string,any[]>();for(const row of rows){const list=grouped.get(row.cohort_key)||[];list.push(row);grouped.set(row.cohort_key,list)}
  const selected=candidates.find(c=>(grouped.get(c.key)||[]).length>0);if(!selected)return{available:false,reason:`Ainda não há ${MIN_SAMPLE} empresas comparáveis com dados suficientes.`,privacyMinimum:MIN_SAMPLE};const selectedRows=grouped.get(selected.key)||[];const items=[] as any[];
  for(const row of selectedRows){const def=METRIC_BY_KEY.get(row.metric_key);if(!def)continue;const own=metricValue(current,def);if(own===null)continue;const p25=Number(row.p25),median=Number(row.median),p75=Number(row.p75);const position:'below'|'within'|'above'=own<p25?'below':own>p75?'above':'within';let reading:'destaque'|'na_faixa'|'atencao'='na_faixa';if(position!=='within')reading=def.direction==='higher'?(position==='above'?'destaque':'atencao'):(position==='below'?'destaque':'atencao');items.push({key:def.key,label:def.label,unit:def.unit,direction:def.direction,own:round(own),median:round(median),p25:round(p25),p75:round(p75),sampleSize:Number(row.sample_size),position,reading})}
  const sectorPt=sectorLabel(selected.sector);const scopeLabel=selected.level==='sector_model_size'?`${sectorPt} · ${revenueLabel(selected.revenueModel)} · ${sizeLabel(selected.sizeBand)}`:selected.level==='sector_model'?`${sectorPt} · ${revenueLabel(selected.revenueModel)}`:sectorPt;const sampleSizes=selectedRows.map(r=>Number(r.sample_size||0)).filter(x=>x>=MIN_SAMPLE);const conservativeSample=sampleSizes.length?Math.min(...sampleSizes):MIN_SAMPLE;
  return{available:items.length>0,asOf:latest,cohort:{level:selected.level,label:scopeLabel,sector:selected.sector,revenueModel:selected.revenueModel,sizeBand:selected.sizeBand,sampleSize:conservativeSample,privacyMinimum:MIN_SAMPLE},items,note:'Comparação anônima. Mostramos apenas mediana e faixa central quando há pelo menos 10 empresas válidas. Nenhuma empresa individual é identificada.'};
}

export async function getBenchmarkAdminOverview(){
  const latest=(await query<any>(`select max(snapshot_date) snapshot_date from intelligence_benchmark_snapshots`))[0]?.snapshot_date||null;if(!latest)return{available:false,privacyMinimum:MIN_SAMPLE,sectors:[],runs:[]};
  const [summary,sectors,rows,runs]=await Promise.all([
    query<any>(`select count(distinct cohort_key)::int cohorts,count(*)::int metric_rows,max(sample_size)::int largest_sample from intelligence_benchmark_snapshots where snapshot_date=$1`,[latest]),
    query<any>(`select sector,max(sample_size) filter(where metric_key='overall_score')::int sample_size,max(median) filter(where metric_key='overall_score') overall_median,max(p25) filter(where metric_key='overall_score') overall_p25,max(p75) filter(where metric_key='overall_score') overall_p75,count(*)::int metrics from intelligence_benchmark_snapshots where snapshot_date=$1 and cohort_level='sector' group by sector order by sample_size desc nulls last,sector`,[latest]),
    query<any>(`select sector,cohort_key,cohort_level,revenue_model,size_band,metric_key,sample_size,p25,median,p75,mean from intelligence_benchmark_snapshots where snapshot_date=$1 and cohort_level='sector' order by sector,metric_key`,[latest]),
    query<any>(`select id,run_date,status,eligible_workspaces,cohorts_created,metric_rows_created,summary,last_error,started_at,completed_at from intelligence_benchmark_runs order by started_at desc limit 30`)
  ]);return{available:true,asOf:latest,privacyMinimum:MIN_SAMPLE,summary:summary[0]||{},sectors,sectorMetrics:rows,runs,modelVersion:MODEL_VERSION};
}
