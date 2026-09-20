import {query} from './db.js';
import {ensureDailyFinancialIntelligence} from './financial-intelligence-daily.js';
import {ensureDailyBusinessIntelligence} from './business-intelligence-daily.js';
import {generateLearningSuggestions,syncAndEvaluateIntelligenceActions} from './business-intelligence-learning.js';
import {rebuildAnonymousBenchmarks} from './business-benchmark.js';
import {buildTemporalRisk} from './business-temporal-risk.js';
import {evaluateTemporalActions,runSectorIntelligenceV3} from './business-sector-intelligence-v3.js';

export type DailyIntelligenceEngineSummary={
  claimed:boolean;workspaces:number;financialSnapshots:number;businessSnapshots:number;temporalRiskSnapshots:number;temporalSignals:number;sectorObservations:number;sectorSignals:number;
  evaluatedActions:number;improved:number;stable:number;worsened:number;insufficient:number;temporalActionsEvaluated:number;
  suggestionsCreated:number;benchmarkCohorts:number;benchmarkMetricRows:number;benchmarkEligibleWorkspaces:number;
  errors:number;errorSamples:Array<{workspaceId:string;error:string}>;
};

const emptySummary=(claimed:boolean):DailyIntelligenceEngineSummary=>({claimed,workspaces:0,financialSnapshots:0,businessSnapshots:0,temporalRiskSnapshots:0,temporalSignals:0,sectorObservations:0,sectorSignals:0,evaluatedActions:0,improved:0,stable:0,worsened:0,insufficient:0,temporalActionsEvaluated:0,suggestionsCreated:0,benchmarkCohorts:0,benchmarkMetricRows:0,benchmarkEligibleWorkspaces:0,errors:0,errorSamples:[]});

async function claim(force:boolean){
  if(force)return (await query<any>(`update intelligence_learning_daily_state set run_date=current_date,status='running',started_at=now(),completed_at=null,last_error=null,updated_at=now() where id='global' returning *`))[0]||null;
  return (await query<any>(`update intelligence_learning_daily_state set run_date=current_date,status='running',started_at=now(),completed_at=null,last_error=null,updated_at=now()
    where id='global' and (
      run_date is null or run_date<current_date or status='failed' or
      (status='running' and started_at<now()-interval '2 hours') or
      not exists(select 1 from intelligence_benchmark_runs b where b.run_date=current_date and b.status='completed')
    ) returning *`))[0]||null;
}

export async function runDailyIntelligenceEngine(force=false):Promise<DailyIntelligenceEngineSummary>{
  const claimed=await claim(force);
  if(!claimed)return emptySummary(false);
  const summary=emptySummary(true);
  try{
    const workspaces=await query<any>(`select id from workspaces where status<>'cancelled' order by created_at asc`);
    const temporalSchema=Boolean((await query<any>(`select to_regclass('public.intelligence_risk_snapshots') is not null ready`))[0]?.ready);
    const sectorSchema=Boolean((await query<any>(`select to_regclass('public.intelligence_temporal_observations') is not null ready`))[0]?.ready);
    summary.workspaces=workspaces.length;
    for(const workspace of workspaces){
      const workspaceId=String(workspace.id);
      try{
        const financial=await ensureDailyFinancialIntelligence(workspaceId);if(financial.created)summary.financialSnapshots++;
        const business=await ensureDailyBusinessIntelligence(workspaceId);if(business.created)summary.businessSnapshots++;
        if(temporalSchema){const temporal=await buildTemporalRisk(workspaceId);summary.temporalRiskSnapshots++;summary.temporalSignals+=Number(temporal.signals?.length||0)}
        if(sectorSchema){const sector=await runSectorIntelligenceV3(workspaceId);summary.sectorObservations+=Number(sector.observations||0);summary.sectorSignals+=Number(sector.signals||0);const actions=await evaluateTemporalActions(workspaceId);summary.temporalActionsEvaluated+=Number(actions.evaluated||0);summary.improved+=Number(actions.improved||0);summary.stable+=Number(actions.stable||0);summary.worsened+=Number(actions.worsened||0)}
        const learning=await syncAndEvaluateIntelligenceActions(workspaceId,false);
        summary.evaluatedActions+=Number(learning.evaluated||0);summary.improved+=Number(learning.improved||0);summary.stable+=Number(learning.stable||0);summary.worsened+=Number(learning.worsened||0);summary.insufficient+=Number(learning.insufficient||0);
      }catch(error){summary.errors++;if(summary.errorSamples.length<20)summary.errorSamples.push({workspaceId,error:error instanceof Error?error.message:String(error)})}
    }
    const suggestions=await generateLearningSuggestions();summary.suggestionsCreated=Number(suggestions.created||0);
    try{const benchmark=await rebuildAnonymousBenchmarks();summary.benchmarkCohorts=Number(benchmark.cohortsCreated||0);summary.benchmarkMetricRows=Number(benchmark.metricRowsCreated||0);summary.benchmarkEligibleWorkspaces=Number(benchmark.eligibleWorkspaces||0)}catch(error){summary.errors++;if(summary.errorSamples.length<20)summary.errorSamples.push({workspaceId:'benchmark',error:error instanceof Error?error.message:String(error)})}
    await query(`update intelligence_learning_daily_state set status='completed',completed_at=now(),last_summary=$2::jsonb,last_error=null,updated_at=now() where id=$1`,['global',JSON.stringify(summary)]);
    return summary;
  }catch(error){
    await query(`update intelligence_learning_daily_state set status='failed',completed_at=now(),last_summary=$2::jsonb,last_error=$3,updated_at=now() where id=$1`,['global',JSON.stringify(summary),error instanceof Error?error.message:String(error)]);
    throw error;
  }
}

export async function readDailyIntelligenceEngineState(){return (await query<any>(`select * from intelligence_learning_daily_state where id='global'`))[0]||null}
