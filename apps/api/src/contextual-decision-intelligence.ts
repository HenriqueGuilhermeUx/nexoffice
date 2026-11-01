import {query} from './db.js';
import {mapOutcomeEvent,outcomeEventRelevant,type OutcomePolarity} from './outcome-learning.js';

type ContextualDecisionRow={
  action_id:string;
  contact_id:string;
  subject_id:string|null;
  action_type:string;
  decision:string;
  decided_at:string|Date;
  title:string;
  contact_kind:string|null;
  overdue_count_at_decision:number;
  overdue_minor_at_decision:number;
  last_activity_at_decision:string|Date|null;
};

type Observation={
  decisionId:string;
  outcomeCode:string;
  polarity:OutcomePolarity;
  daysAfterDecision:number;
};

const MS_DAY=86400000;
const obj=(value:unknown):Record<string,any>=>{
  if(value&&typeof value==='object')return value as Record<string,any>;
  try{return JSON.parse(String(value||'{}'))}catch{return{}}
};
const median=(values:number[])=>{
  if(!values.length)return null;
  const sorted=[...values].sort((a,b)=>a-b);
  const mid=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[mid]:Math.round((sorted[mid-1]+sorted[mid])/2);
};
const financialState=(row:ContextualDecisionRow)=>{
  const count=Number(row.overdue_count_at_decision||0);
  return count>=2?'overdue_2plus':count===1?'overdue_1':'no_overdue';
};
const engagementState=(row:ContextualDecisionRow)=>{
  if(!row.last_activity_at_decision)return 'unknown';
  const days=Math.max(0,Math.floor((new Date(row.decided_at).getTime()-new Date(row.last_activity_at_decision).getTime())/MS_DAY));
  return days<=30?'recent_30':days<=90?'stale_31_90':'stale_90plus';
};

export async function buildContextualDecisionIntelligence(workspaceId:string,windowDays=180,minSample=3){
  const days=Math.max(30,Math.min(365,Math.round(windowDays||180)));
  const sample=Math.max(3,Math.min(50,Math.round(minSample||3)));

  const decisions=await query<ContextualDecisionRow>(
    `with subject_contacts as (
       select id subject_id,id contact_id from crm_contacts where workspace_id=$1
       union all select id,contact_id from crm_deals where workspace_id=$1 and contact_id is not null
       union all select id,contact_id from crm_activities where workspace_id=$1 and contact_id is not null
       union all select id,contact_id from ledger_entries where workspace_id=$1 and contact_id is not null
       union all select id,contact_id from tasks where workspace_id=$1 and contact_id is not null
       union all select id,contact_id from appointments where workspace_id=$1 and contact_id is not null
       union all select id,contact_id from document_refs where workspace_id=$1 and contact_id is not null
     ),
     decision_base as (
       select distinct on(ca.id)
         ca.id action_id,
         sc.contact_id,
         ca.subject_id,
         coalesce(ca.primary_action->>'type',ar.action_type,'command.action') action_type,
         case
           when ar.status in ('approved','rejected') then ar.status
           when ca.status='rejected' then 'rejected'
           when ca.status='dismissed' then 'dismissed'
           when ca.status in ('approved','executing','done','failed') then 'approved'
           else ca.status
         end decision,
         coalesce(ar.decided_at,ca.updated_at,ca.created_at) decided_at,
         ca.title
       from command_actions ca
       join subject_contacts sc on sc.subject_id=ca.subject_id
       left join approval_requests ar on ar.id=ca.approval_id
       where ca.workspace_id=$1
         and ca.status in ('approved','rejected','dismissed','executing','done','failed')
         and coalesce(ar.decided_at,ca.updated_at,ca.created_at)>=now()-($2::text||' days')::interval
       order by ca.id,coalesce(ar.decided_at,ca.updated_at,ca.created_at) desc
       limit 3000
     )
     select
       db.*,
       c.kind contact_kind,
       (
         select count(*)::int
         from ledger_entries l
         where l.workspace_id=$1
           and l.contact_id=db.contact_id
           and l.direction='income'
           and l.due_at is not null
           and l.due_at<db.decided_at
           and (l.paid_at is null or l.paid_at>db.decided_at)
       ) overdue_count_at_decision,
       (
         select coalesce(sum(l.amount_minor),0)::bigint
         from ledger_entries l
         where l.workspace_id=$1
           and l.contact_id=db.contact_id
           and l.direction='income'
           and l.due_at is not null
           and l.due_at<db.decided_at
           and (l.paid_at is null or l.paid_at>db.decided_at)
       ) overdue_minor_at_decision,
       (
         select max(a.occurred_at)
         from crm_activities a
         where a.workspace_id=$1
           and a.contact_id=db.contact_id
           and a.occurred_at<=db.decided_at
       ) last_activity_at_decision
     from decision_base db
     join crm_contacts c on c.id=db.contact_id and c.workspace_id=$1
     order by db.decided_at desc`,
    [workspaceId,String(days)]
  );

  if(!decisions.length)return empty(days,sample);

  const contactBySubjectRows=await query<any>(
    `select id::text subject_id,id::text contact_id from crm_contacts where workspace_id=$1
     union all select id::text,contact_id::text from crm_deals where workspace_id=$1 and contact_id is not null
     union all select id::text,contact_id::text from crm_activities where workspace_id=$1 and contact_id is not null
     union all select id::text,contact_id::text from ledger_entries where workspace_id=$1 and contact_id is not null
     union all select id::text,contact_id::text from tasks where workspace_id=$1 and contact_id is not null
     union all select id::text,contact_id::text from appointments where workspace_id=$1 and contact_id is not null
     union all select id::text,contact_id::text from document_refs where workspace_id=$1 and contact_id is not null`,
    [workspaceId]
  );
  const contactBySubject=new Map(contactBySubjectRows.map((row:any)=>[String(row.subject_id),String(row.contact_id)]));
  const earliest=Math.min(...decisions.map(row=>new Date(row.decided_at).getTime()).filter(Number.isFinite));
  const events=await query<any>(
    `select id,type,source,subject_type,subject_id,payload,occurred_at
     from business_events
     where workspace_id=$1 and occurred_at>=$2
     order by occurred_at asc limit 12000`,
    [workspaceId,new Date(earliest-60000).toISOString()]
  );

  const eventsByContact=new Map<string,any[]>();
  for(const event of events){
    const payload=obj(event.payload);
    const contacts=new Set<string>();
    const bySubject=contactBySubject.get(String(event.subject_id||''));
    if(bySubject)contacts.add(bySubject);
    const payloadContact=String(payload.contactId||'');
    if(payloadContact)contacts.add(payloadContact);
    for(const contactId of contacts){
      if(!eventsByContact.has(contactId))eventsByContact.set(contactId,[]);
      eventsByContact.get(contactId)!.push(event);
    }
  }

  const observations:Observation[]=[];
  for(const decision of decisions){
    const decidedAt=new Date(decision.decided_at).getTime();
    if(!Number.isFinite(decidedAt))continue;
    for(const event of eventsByContact.get(String(decision.contact_id))||[]){
      const eventAt=new Date(event.occurred_at).getTime();
      if(eventAt<=decidedAt||eventAt>decidedAt+90*MS_DAY)continue;
      if(!outcomeEventRelevant(event,String(decision.action_type),decision.subject_id?String(decision.subject_id):null,String(decision.contact_id)))continue;
      const mapped=mapOutcomeEvent(event);
      if(!mapped)continue;
      observations.push({
        decisionId:String(decision.action_id),
        outcomeCode:mapped.code,
        polarity:mapped.polarity,
        daysAfterDecision:Math.max(0,Math.floor((eventAt-decidedAt)/MS_DAY))
      });
    }
  }

  const byDecision=new Map<string,Observation[]>();
  for(const item of observations){
    if(!byDecision.has(item.decisionId))byDecision.set(item.decisionId,[]);
    byDecision.get(item.decisionId)!.push(item);
  }

  const groups=new Map<string,ContextualDecisionRow[]>();
  for(const row of decisions){
    const context={
      contactKind:String(row.contact_kind||'unknown'),
      financialState:financialState(row),
      engagementState:engagementState(row)
    };
    const key=[row.action_type,row.decision,context.contactKind,context.financialState,context.engagementState].join('|');
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key)!.push(row);
  }

  const patterns=[...groups.entries()].filter(([,rows])=>rows.length>=sample).map(([key,rows])=>{
    const first=rows[0];
    const outcomeRows=rows.map(row=>({row,obs:byDecision.get(String(row.action_id))||[]}));
    const withOutcome=outcomeRows.filter(item=>item.obs.length>0);
    const withPositive=outcomeRows.filter(item=>item.obs.some(obs=>obs.polarity==='positive'));
    const withNegative=outcomeRows.filter(item=>item.obs.some(obs=>obs.polarity==='negative'));
    const firstOutcomeDays=withOutcome.map(item=>Math.min(...item.obs.map(obs=>obs.daysAfterDecision))).filter(Number.isFinite);
    const outcomeCounts=new Map<string,number>();
    for(const item of withOutcome)for(const obs of item.obs)outcomeCounts.set(obs.outcomeCode,(outcomeCounts.get(obs.outcomeCode)||0)+1);
    const sampleSize=rows.length;
    const evidenceLevel=sampleSize>=20?'substantial':sampleSize>=10?'established':sampleSize>=5?'developing':'early';
    const context={
      contactKind:String(first.contact_kind||'unknown'),
      financialState:financialState(first),
      engagementState:engagementState(first)
    };
    return{
      key,
      actionType:String(first.action_type),
      decision:String(first.decision),
      context,
      sampleSize,
      uniqueCustomers:new Set(rows.map(row=>String(row.contact_id))).size,
      decisionsWithObservedOutcome:withOutcome.length,
      outcomeCoveragePct:Math.round(withOutcome.length/sampleSize*100),
      positiveDecisionPct:Math.round(withPositive.length/sampleSize*100),
      negativeDecisionPct:Math.round(withNegative.length/sampleSize*100),
      medianDaysToFirstOutcome:median(firstOutcomeDays),
      evidenceLevel,
      mostObservedOutcomes:[...outcomeCounts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([code,count])=>({code,count})),
      interpretation:'Em '+sampleSize+' decisão(ões) '+String(first.decision)+' de '+String(first.action_type)+' no contexto '+context.contactKind+' / '+context.financialState+' / '+context.engagementState+', '+withOutcome.length+' tiveram resultado posterior observado. Associação temporal e contextual; não mede efeito causal.',
      recommendedUse:'Usar somente como contexto comparável para revisão humana. Não alterar autonomia, política, decisão ou execução automaticamente.'
    };
  }).sort((a,b)=>b.sampleSize-a.sampleSize||b.outcomeCoveragePct-a.outcomeCoveragePct);

  return{
    generatedAt:new Date().toISOString(),
    windowDays:days,
    minSample:sample,
    contextualPatterns:patterns.slice(0,75),
    summary:{
      decisionsAnalyzed:decisions.length,
      contextualPatterns:patterns.length,
      customers:new Set(decisions.map(row=>String(row.contact_id))).size,
      decisionsWithObservedOutcome:new Set(observations.map(item=>item.decisionId)).size
    },
    methodology:{
      observationWindowDays:90,
      contextAsOfDecision:true,
      contextDimensions:['contact_kind','overdue_state_as_of_decision','crm_engagement_recency_as_of_decision'],
      overdueReconstructedFromDueAndPaidTimestamps:true,
      engagementUsesCrmActivityOnly:true,
      minSample:sample,
      temporalAssociationOnly:true,
      causalClaims:false
    },
    safety:{
      readOnly:true,
      externalEffects:false,
      automaticPolicyChange:false,
      automaticAutonomyChange:false,
      automaticDecisionChange:false,
      contextNeverOverridesHumanReview:true
    }
  };
}

function empty(windowDays:number,minSample:number){
  return{
    generatedAt:new Date().toISOString(),
    windowDays,
    minSample,
    contextualPatterns:[],
    summary:{decisionsAnalyzed:0,contextualPatterns:0,customers:0,decisionsWithObservedOutcome:0},
    methodology:{
      observationWindowDays:90,
      contextAsOfDecision:true,
      contextDimensions:['contact_kind','overdue_state_as_of_decision','crm_engagement_recency_as_of_decision'],
      overdueReconstructedFromDueAndPaidTimestamps:true,
      engagementUsesCrmActivityOnly:true,
      minSample,
      temporalAssociationOnly:true,
      causalClaims:false
    },
    safety:{
      readOnly:true,
      externalEffects:false,
      automaticPolicyChange:false,
      automaticAutonomyChange:false,
      automaticDecisionChange:false,
      contextNeverOverridesHumanReview:true
    }
  };
}
