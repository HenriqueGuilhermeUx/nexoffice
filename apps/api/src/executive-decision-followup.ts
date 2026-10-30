import {query} from './db.js';
import {mapOutcomeEvent} from './outcome-learning.js';

const MS_DAY=86400000;
const obj=(value:unknown):Record<string,any>=>{
  if(value&&typeof value==='object')return value as Record<string,any>;
  try{return JSON.parse(String(value||'{}'))}catch{return{}}
};
const iso=(value:unknown)=>{
  const d=value instanceof Date?value:new Date(String(value||''));
  return Number.isNaN(d.getTime())?String(value||''):d.toISOString();
};
const actionPrefixes:Record<string,string[]>={
  review_finance:['payment.'],
  create_followup_task:['task.','customer.','deal.'],
  prepare_collection:['payment.','customer.'],
  view_context:['customer.','deal.','payment.','document.'],
  prepare_recovery:['customer.','payment.','deal.'],
  prepare_renewal:['deal.','document.','customer.'],
  review_pipeline:['deal.'],
  prepare_reengagement:['deal.','customer.'],
  reprioritize_tasks:['task.'],
  review_dependencies:['task.'],
  prepare_owner_followup:['task.','customer.'],
  review_cash:['payment.'],
  protect_liquidity:['payment.'],
  prepare_cash_plan:['payment.'],
  review_concentration:['deal.','customer.'],
  protect_key_accounts:['customer.','deal.'],
  diversify_pipeline:['deal.']
};
const eventRelevant=(event:any,decision:any)=>{
  const payload=obj(event.payload);
  const family=String(decision.suggested_action_family||'');
  const prefixes=actionPrefixes[family]||[];
  const type=String(event.type||'');
  if(prefixes.some(prefix=>type.startsWith(prefix)))return true;
  const evidence=Array.isArray(decision.evidence_snapshot)?decision.evidence_snapshot:obj(decision.evidence_snapshot);
  const comparable=Array.isArray(decision.comparable_cases_snapshot)?decision.comparable_cases_snapshot:obj(decision.comparable_cases_snapshot);
  const text=JSON.stringify([evidence,comparable]);
  const contactId=String(payload.contactId||'');
  if(contactId&&text.includes(contactId))return true;
  return false;
};

export async function buildExecutiveDecisionFollowup(workspaceId:string,windowDays=90){
  const days=Math.max(7,Math.min(180,Math.round(windowDays||90)));
  const decisions=await query<any>(
    `select id,priority_code,priority_level,priority_title,priority_detail,selected_path_id,selected_posture,selected_label,
            suggested_action_family,rationale,evidence_snapshot,comparable_cases_snapshot,tradeoffs_snapshot,risks_snapshot,
            confidence,status,chosen_by,chosen_at
       from executive_decisions
      where workspace_id=$1 and status='recorded' and chosen_at>=now()-($2::text||' days')::interval
      order by chosen_at desc limit 200`,
    [workspaceId,String(days)]
  );
  if(!decisions.length)return empty(days);

  const earliest=Math.min(...decisions.map((row:any)=>new Date(row.chosen_at).getTime()).filter(Number.isFinite));
  const events=await query<any>(
    `select id,type,source,subject_type,subject_id,payload,occurred_at
       from business_events
      where workspace_id=$1 and occurred_at>=$2
      order by occurred_at asc limit 12000`,
    [workspaceId,new Date(earliest-60000).toISOString()]
  );

  const followups=decisions.map((decision:any)=>{
    const chosenAt=new Date(decision.chosen_at).getTime();
    const observed=events
      .filter((event:any)=>{
        const at=new Date(event.occurred_at).getTime();
        return at>chosenAt&&at<=chosenAt+90*MS_DAY&&eventRelevant(event,decision);
      })
      .map((event:any)=>{
        const mapped=mapOutcomeEvent(event);
        if(!mapped)return null;
        const observedAt=iso(event.occurred_at);
        return{
          eventId:String(event.id),
          eventType:String(event.type||''),
          source:String(event.source||'business_events'),
          observedAt,
          daysAfterDecision:Math.max(0,Math.floor((new Date(observedAt).getTime()-chosenAt)/MS_DAY)),
          code:mapped.code,
          label:mapped.label,
          polarity:mapped.polarity,
          detail:mapped.detail,
          subjectType:event.subject_type?String(event.subject_type):null,
          subjectId:event.subject_id?String(event.subject_id):null
        };
      })
      .filter(Boolean)
      .slice(0,20) as any[];

    const positive=observed.filter(item=>item.polarity==='positive').length;
    const negative=observed.filter(item=>item.polarity==='negative').length;
    const neutral=observed.filter(item=>item.polarity==='neutral').length;
    const elapsed=Math.max(0,Math.floor((Date.now()-chosenAt)/MS_DAY));
    return{
      decisionId:String(decision.id),
      priorityCode:String(decision.priority_code),
      priorityTitle:String(decision.priority_title),
      selectedPathId:String(decision.selected_path_id),
      selectedPosture:String(decision.selected_posture),
      selectedLabel:String(decision.selected_label),
      suggestedActionFamily:decision.suggested_action_family?String(decision.suggested_action_family):null,
      rationale:String(decision.rationale||''),
      confidence:String(decision.confidence||'low'),
      chosenAt:iso(decision.chosen_at),
      daysSinceDecision:elapsed,
      observationWindowDays:90,
      observationStatus:elapsed>=90?'window_complete':observed.length?'observations_found':'monitoring',
      observedEvents:observed,
      summary:{
        totalObserved:observed.length,
        positive,
        negative,
        neutral,
        latestObservedAt:observed.length?observed[observed.length-1].observedAt:null
      },
      interpretation:observed.length
        ?'Foram observados eventos posteriores compatíveis com o contexto desta decisão. A relação é temporal e descritiva; não demonstra que a decisão causou esses eventos.'
        :'Ainda não foram observados eventos posteriores compatíveis nesta janela. Ausência de observação não significa ausência de efeito.',
      relationship:{
        temporal:true,
        sameWorkspace:true,
        causalClaim:false
      }
    };
  });

  return{
    generatedAt:new Date().toISOString(),
    windowDays:days,
    followups,
    summary:{
      decisionsTracked:followups.length,
      withObservedEvents:followups.filter(item=>item.summary.totalObserved>0).length,
      monitoring:followups.filter(item=>item.observationStatus==='monitoring').length,
      windowsComplete:followups.filter(item=>item.observationStatus==='window_complete').length,
      positiveObservations:followups.reduce((sum,item)=>sum+item.summary.positive,0),
      negativeObservations:followups.reduce((sum,item)=>sum+item.summary.negative,0),
      neutralObservations:followups.reduce((sum,item)=>sum+item.summary.neutral,0)
    },
    methodology:{
      observationWindowDays:90,
      source:'business_events',
      relevanceUsesSuggestedActionFamilyAndRecordedEvidence:true,
      temporalAssociationOnly:true,
      noCounterfactualInference:true,
      causalClaims:false
    },
    safety:{
      readOnly:true,
      externalEffects:false,
      automaticExecution:false,
      automaticPolicyChange:false,
      automaticAutonomyChange:false,
      automaticDecisionChange:false
    }
  };
}

function empty(windowDays:number){
  return{
    generatedAt:new Date().toISOString(),
    windowDays,
    followups:[],
    summary:{decisionsTracked:0,withObservedEvents:0,monitoring:0,windowsComplete:0,positiveObservations:0,negativeObservations:0,neutralObservations:0},
    methodology:{observationWindowDays:90,source:'business_events',relevanceUsesSuggestedActionFamilyAndRecordedEvidence:true,temporalAssociationOnly:true,noCounterfactualInference:true,causalClaims:false},
    safety:{readOnly:true,externalEffects:false,automaticExecution:false,automaticPolicyChange:false,automaticAutonomyChange:false,automaticDecisionChange:false}
  };
}
