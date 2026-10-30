import {query} from './db.js';
import {mapOutcomeEvent,outcomeEventRelevant,type OutcomePolarity} from './outcome-learning.js';

type DecisionRow={
  action_id:string;
  contact_id:string;
  subject_id:string|null;
  action_type:string;
  decision:string;
  decided_at:string|Date;
  title:string;
};

type PatternObservation={
  decisionId:string;
  contactId:string;
  outcomeCode:string;
  polarity:OutcomePolarity;
  observedAt:string;
  daysAfterDecision:number;
};

const MS_DAY=86400000;
const obj=(value:unknown):Record<string,any>=>{
  if(value&&typeof value==='object')return value as Record<string,any>;
  try{return JSON.parse(String(value||'{}'))}catch{return{}}
};
const iso=(value:unknown)=>{
  const d=value instanceof Date?value:new Date(String(value||''));
  return Number.isNaN(d.getTime())?String(value||''):d.toISOString();
};
const median=(values:number[])=>{
  if(!values.length)return null;
  const sorted=[...values].sort((a,b)=>a-b);
  const mid=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[mid]:Math.round((sorted[mid-1]+sorted[mid])/2);
};

export async function buildDecisionPatterns(workspaceId:string,windowDays=180,minSample=3){
  const days=Math.max(30,Math.min(365,Math.round(windowDays||180)));
  const sample=Math.max(3,Math.min(50,Math.round(minSample||3)));

  const subjectMapRows=await query<any>(
    `select id::text subject_id,id contact_id from crm_contacts where workspace_id=$1
     union all select id::text,contact_id from crm_deals where workspace_id=$1 and contact_id is not null
     union all select id::text,contact_id from crm_activities where workspace_id=$1 and contact_id is not null
     union all select id::text,contact_id from ledger_entries where workspace_id=$1 and contact_id is not null
     union all select id::text,contact_id from tasks where workspace_id=$1 and contact_id is not null
     union all select id::text,contact_id from appointments where workspace_id=$1 and contact_id is not null
     union all select id::text,contact_id from document_refs where workspace_id=$1 and contact_id is not null`,
    [workspaceId]
  );
  const contactBySubject=new Map(subjectMapRows.map((row:any)=>[String(row.subject_id),String(row.contact_id)]));

  const decisions=await query<DecisionRow>(
    `with subject_contacts as (
       select id subject_id,id contact_id from crm_contacts where workspace_id=$1
       union all select id,contact_id from crm_deals where workspace_id=$1 and contact_id is not null
       union all select id,contact_id from crm_activities where workspace_id=$1 and contact_id is not null
       union all select id,contact_id from ledger_entries where workspace_id=$1 and contact_id is not null
       union all select id,contact_id from tasks where workspace_id=$1 and contact_id is not null
       union all select id,contact_id from appointments where workspace_id=$1 and contact_id is not null
       union all select id,contact_id from document_refs where workspace_id=$1 and contact_id is not null
     )
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
     limit 3000`,
    [workspaceId,String(days)]
  );

  if(!decisions.length)return emptyDecisionPatterns(days,sample);

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

  const observations:PatternObservation[]=[];
  for(const decision of decisions){
    const decidedAt=new Date(decision.decided_at).getTime();
    if(!Number.isFinite(decidedAt))continue;
    const contactId=String(decision.contact_id);
    const candidates=eventsByContact.get(contactId)||[];
    for(const event of candidates){
      const eventTime=new Date(event.occurred_at).getTime();
      if(eventTime<=decidedAt||eventTime>decidedAt+90*MS_DAY)continue;
      if(!outcomeEventRelevant(event,String(decision.action_type),decision.subject_id?String(decision.subject_id):null,contactId))continue;
      const mapped=mapOutcomeEvent(event);
      if(!mapped)continue;
      observations.push({
        decisionId:String(decision.action_id),
        contactId,
        outcomeCode:mapped.code,
        polarity:mapped.polarity,
        observedAt:iso(event.occurred_at),
        daysAfterDecision:Math.max(0,Math.floor((eventTime-decidedAt)/MS_DAY))
      });
    }
  }

  const obsByDecision=new Map<string,PatternObservation[]>();
  for(const item of observations){
    if(!obsByDecision.has(item.decisionId))obsByDecision.set(item.decisionId,[]);
    obsByDecision.get(item.decisionId)!.push(item);
  }

  const groups=new Map<string,DecisionRow[]>();
  for(const row of decisions){
    const key=String(row.action_type)+'|'+String(row.decision);
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key)!.push(row);
  }

  const patterns=[...groups.values()].filter(rows=>rows.length>=sample).map(rows=>{
    const actionType=String(rows[0].action_type);
    const decision=String(rows[0].decision);
    const decisionOutcomes=rows.map(row=>({row,obs:obsByDecision.get(String(row.action_id))||[]}));
    const withOutcome=decisionOutcomes.filter(item=>item.obs.length>0);
    const withPositive=decisionOutcomes.filter(item=>item.obs.some(obs=>obs.polarity==='positive'));
    const withNegative=decisionOutcomes.filter(item=>item.obs.some(obs=>obs.polarity==='negative'));
    const neutralOnly=decisionOutcomes.filter(item=>item.obs.length>0&&!item.obs.some(obs=>obs.polarity==='positive'||obs.polarity==='negative'));
    const noOutcome=decisionOutcomes.filter(item=>item.obs.length===0);
    const firstOutcomeDays=withOutcome.map(item=>Math.min(...item.obs.map(obs=>obs.daysAfterDecision))).filter(Number.isFinite);
    const outcomeCounts=new Map<string,number>();
    for(const item of withOutcome)for(const obs of item.obs)outcomeCounts.set(obs.outcomeCode,(outcomeCounts.get(obs.outcomeCode)||0)+1);
    const uniqueCustomers=new Set(rows.map(row=>String(row.contact_id))).size;
    const sampleSize=rows.length;
    const coveragePct=Math.round(withOutcome.length/sampleSize*100);
    const positivePct=Math.round(withPositive.length/sampleSize*100);
    const negativePct=Math.round(withNegative.length/sampleSize*100);
    const evidenceLevel=sampleSize>=20?'substantial':sampleSize>=10?'established':sampleSize>=5?'developing':'early';
    return{
      key:actionType+'|'+decision,
      actionType,
      decision,
      sampleSize,
      uniqueCustomers,
      decisionsWithObservedOutcome:withOutcome.length,
      noObservedOutcome:noOutcome.length,
      outcomeCoveragePct:coveragePct,
      positiveDecisionCount:withPositive.length,
      negativeDecisionCount:withNegative.length,
      neutralOnlyDecisionCount:neutralOnly.length,
      positiveDecisionPct:positivePct,
      negativeDecisionPct:negativePct,
      medianDaysToFirstOutcome:median(firstOutcomeDays),
      evidenceLevel,
      mostObservedOutcomes:[...outcomeCounts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([code,count])=>({code,count})),
      interpretation:'Em '+sampleSize+' decisão(ões) '+decision+' de '+actionType+', '+withOutcome.length+' tiveram algum resultado posterior observado; '+withPositive.length+' tiveram ao menos um resultado positivo, '+withNegative.length+' tiveram ao menos um resultado negativo e '+noOutcome.length+' não tiveram resultado observado na janela. Associação temporal e descritiva; não mede efeito causal.',
      recommendedUse:'Usar como contexto para revisão humana. Não alterar autonomia, política ou decisão automaticamente.'
    };
  }).sort((a,b)=>b.sampleSize-a.sampleSize||b.outcomeCoveragePct-a.outcomeCoveragePct);

  const decisionsWithObservedOutcome=new Set(observations.map(item=>item.decisionId)).size;
  return{
    generatedAt:new Date().toISOString(),
    windowDays:days,
    minSample:sample,
    patterns:patterns.slice(0,50),
    summary:{
      decisionsAnalyzed:decisions.length,
      decisionsWithObservedOutcome,
      outcomeCoveragePct:decisions.length?Math.round(decisionsWithObservedOutcome/decisions.length*100):0,
      patterns:patterns.length,
      customers:new Set(decisions.map(row=>String(row.contact_id))).size,
      actionTypes:new Set(decisions.map(row=>String(row.action_type))).size
    },
    methodology:{
      observationWindowDays:90,
      minSample:sample,
      unitOfAnalysis:'decision_not_event',
      groupsBy:['action_type','decision'],
      temporalAssociationOnly:true,
      causalClaims:false,
      evidenceLevels:{early:'3-4',developing:'5-9',established:'10-19',substantial:'20+'}
    },
    safety:{readOnly:true,externalEffects:false,automaticPolicyChange:false,automaticAutonomyChange:false,automaticDecisionChange:false}
  };
}

function emptyDecisionPatterns(windowDays:number,minSample:number){
  return{
    generatedAt:new Date().toISOString(),windowDays,minSample,patterns:[],
    summary:{decisionsAnalyzed:0,decisionsWithObservedOutcome:0,outcomeCoveragePct:0,patterns:0,customers:0,actionTypes:0},
    methodology:{observationWindowDays:90,minSample,unitOfAnalysis:'decision_not_event',groupsBy:['action_type','decision'],temporalAssociationOnly:true,causalClaims:false,evidenceLevels:{early:'3-4',developing:'5-9',established:'10-19',substantial:'20+'}},
    safety:{readOnly:true,externalEffects:false,automaticPolicyChange:false,automaticAutonomyChange:false,automaticDecisionChange:false}
  };
}
