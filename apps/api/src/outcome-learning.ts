import {query} from './db.js';
import {buildDecisionMemory,type DecisionMemoryItem} from './decision-memory.js';

export type OutcomePolarity='positive'|'negative'|'neutral'|'unknown';
export type OutcomeObservation={
  id:string;
  decisionId:string;
  actionId:string|null;
  decision:string;
  actionType:string;
  title:string;
  decidedAt:string;
  outcome:{
    code:string;
    label:string;
    polarity:OutcomePolarity;
    observedAt:string;
    daysAfterDecision:number;
    source:string;
    eventId:string;
    subjectType:string|null;
    subjectId:string|null;
    detail:string|null;
  };
  relationship:{
    temporal:true;
    sameBusinessContext:true;
    causalClaim:false;
    interpretation:string;
  };
};

const MS_DAY=86400000;
const obj=(value:unknown):Record<string,any>=>{
  if(value&&typeof value==='object')return value as Record<string,any>;
  try{return JSON.parse(String(value||'{}'))}catch{return{}}
};

export async function buildOutcomeLearning(workspaceId:string,contactId:string){
  const decisionMemory=await buildDecisionMemory(workspaceId,contactId);
  const decisions=decisionMemory.decisions;
  if(!decisions.length)return emptyOutcomeLearning();

  const related=await query<any>(
    `select id,'contact' kind from crm_contacts where workspace_id=$1 and id=$2
     union all select id,'deal' kind from crm_deals where workspace_id=$1 and contact_id=$2
     union all select id,'crm_activity' kind from crm_activities where workspace_id=$1 and contact_id=$2
     union all select id,'ledger_entry' kind from ledger_entries where workspace_id=$1 and contact_id=$2
     union all select id,'task' kind from tasks where workspace_id=$1 and contact_id=$2
     union all select id,'appointment' kind from appointments where workspace_id=$1 and contact_id=$2
     union all select id,'document' kind from document_refs where workspace_id=$1 and contact_id=$2`,
    [workspaceId,contactId]
  );
  const relatedIds=[...new Set(related.map((row:any)=>String(row.id)))];
  const earliestDecision=decisions.map(item=>new Date(item.decidedAt).getTime()).filter(Number.isFinite).sort((a,b)=>a-b)[0]||Date.now();
  const since=new Date(earliestDecision-60000).toISOString();

  const events=await query<any>(
    `select id,type,source,subject_type,subject_id,payload,occurred_at
     from business_events
     where workspace_id=$1
       and occurred_at>=$2
       and (
         subject_id=any($3::uuid[])
         or payload->>'contactId'=$4
       )
     order by occurred_at asc limit 3000`,
    [workspaceId,since,relatedIds,contactId]
  );

  const observations:OutcomeObservation[]=[];
  for(const decision of decisions){
    const decidedAt=new Date(decision.decidedAt).getTime();
    if(!Number.isFinite(decidedAt))continue;
    const candidates=events
      .filter((event:any)=>new Date(event.occurred_at).getTime()>decidedAt)
      .filter((event:any)=>new Date(event.occurred_at).getTime()<=decidedAt+90*MS_DAY)
      .filter((event:any)=>outcomeEventRelevant(event,String(decision.actionType),decision.subject?.id||null,contactId));
    for(const event of candidates.slice(0,12)){
      const mapped=mapOutcomeEvent(event);
      if(!mapped)continue;
      const observedAt=iso(event.occurred_at);
      const daysAfterDecision=Math.max(0,Math.floor((new Date(observedAt).getTime()-decidedAt)/MS_DAY));
      observations.push({
        id:'outcome:'+String(decision.id)+':'+String(event.id),
        decisionId:String(decision.id),
        actionId:decision.actionId||null,
        decision:String(decision.decision),
        actionType:String(decision.actionType),
        title:String(decision.title),
        decidedAt:String(decision.decidedAt),
        outcome:{
          code:mapped.code,
          label:mapped.label,
          polarity:mapped.polarity,
          observedAt,
          daysAfterDecision,
          source:String(event.source||'business_events'),
          eventId:String(event.id),
          subjectType:event.subject_type?String(event.subject_type):null,
          subjectId:event.subject_id?String(event.subject_id):null,
          detail:mapped.detail
        },
        relationship:{
          temporal:true,
          sameBusinessContext:true,
          causalClaim:false,
          interpretation:'Resultado observado depois da decisão no mesmo contexto de negócio; não implica que a decisão tenha causado o resultado.'
        }
      });
    }
  }

  observations.sort((a,b)=>new Date(b.outcome.observedAt).getTime()-new Date(a.outcome.observedAt).getTime());

  const decisionIdsWithOutcome=new Set(observations.map(item=>item.decisionId));
  const approved=decisions.filter(item=>item.decision==='approved');
  const approvedWithOutcome=approved.filter(item=>decisionIdsWithOutcome.has(item.id));
  const positive=observations.filter(item=>item.outcome.polarity==='positive');
  const negative=observations.filter(item=>item.outcome.polarity==='negative');

  const patterns=buildPatterns(decisions,observations);
  return{
    observations:observations.slice(0,200),
    patterns,
    summary:{
      decisions:decisions.length,
      decisionsWithObservedOutcome:decisionIdsWithOutcome.size,
      approvedDecisions:approved.length,
      approvedWithObservedOutcome:approvedWithOutcome.length,
      positiveObservations:positive.length,
      negativeObservations:negative.length,
      neutralObservations:observations.filter(item=>item.outcome.polarity==='neutral').length,
      coveragePct:decisions.length?Math.round(decisionIdsWithOutcome.size/decisions.length*100):0
    },
    methodology:{
      observationWindowDays:90,
      temporalAssociationOnly:true,
      requiresSameBusinessContext:true,
      causalClaims:false,
      patternMinimumSample:2,
      patternLanguage:'observed_after_decision_not_caused_by_decision'
    },
    safety:{readOnly:true,externalEffects:false,automaticPolicyChange:false,automaticDecisionChange:false}
  };
}

export function outcomeEventRelevant(event:any,actionType:string,decisionSubjectId:string|null,contactId:string){
  const payload=obj(event.payload);
  const subjectId=String(event.subject_id||'');
  const subjectRef=String(decisionSubjectId||'');
  if(subjectRef&&subjectId===subjectRef)return true;
  if(String(payload.contactId||'')===contactId)return true;
  const eventType=String(event.type||'');
  if(actionType.startsWith('payment.')&&eventType.startsWith('payment.'))return true;
  if((actionType.startsWith('lead.')||actionType.startsWith('deal.'))&&(eventType.startsWith('deal.')||eventType==='customer.interaction_logged'))return true;
  if(actionType.startsWith('document.')&&eventType.startsWith('document.'))return true;
  if(actionType.startsWith('appointment.')&&eventType.startsWith('appointment.'))return true;
  return false;
}

export function mapOutcomeEvent(event:any):{code:string;label:string;polarity:OutcomePolarity;detail:string|null}|null{
  const type=String(event.type||'');
  const payload=obj(event.payload);
  if(type==='deal.won')return{code:'deal_won',label:'Oportunidade ganha',polarity:'positive',detail:detail(payload)};
  if(type==='deal.stage_changed'){
    const to=String(payload.to||'').toLowerCase();
    if(to==='lost')return{code:'deal_lost',label:'Oportunidade perdida',polarity:'negative',detail:detail(payload)};
    if(to==='won')return{code:'deal_won',label:'Oportunidade ganha',polarity:'positive',detail:detail(payload)};
    return{code:'deal_progressed',label:'Oportunidade mudou de estágio',polarity:'neutral',detail:detail(payload)};
  }
  if(type==='payment.received')return{code:'payment_received',label:'Pagamento recebido',polarity:'positive',detail:detail(payload)};
  if(type==='customer.interaction_logged')return{code:'customer_interaction',label:'Nova interação registrada',polarity:'neutral',detail:detail(payload)};
  if(type==='document.signed')return{code:'document_signed',label:'Documento assinado',polarity:'positive',detail:detail(payload)};
  if(type==='document.signature_required')return{code:'document_signature_required',label:'Documento passou a exigir assinatura',polarity:'neutral',detail:detail(payload)};
  if(type==='appointment.cancelled')return{code:'appointment_cancelled',label:'Compromisso cancelado',polarity:'negative',detail:detail(payload)};
  if(type==='payment.overdue')return{code:'payment_overdue',label:'Pagamento venceu',polarity:'negative',detail:detail(payload)};
  return null;
}

function iso(value:unknown){
  const d=value instanceof Date?value:new Date(String(value||''));
  return Number.isNaN(d.getTime())?String(value||''):d.toISOString();
}
function detail(payload:Record<string,any>){
  const text=String(payload.summary||payload.description||payload.title||'').replace(/\s+/g,' ').trim();
  return text?text.slice(0,500):null;
}

function buildPatterns(decisions:DecisionMemoryItem[],observations:OutcomeObservation[]){
  const groups=new Map<string,{actionType:string;decision:string;count:number;positive:number;negative:number;neutral:number;outcomeCodes:Map<string,number>}>();
  for(const decision of decisions){
    const key=String(decision.actionType)+'|'+String(decision.decision);
    let row=groups.get(key);
    if(!row){row={actionType:String(decision.actionType),decision:String(decision.decision),count:0,positive:0,negative:0,neutral:0,outcomeCodes:new Map()};groups.set(key,row)}
    row.count++;
  }
  for(const obs of observations){
    const key=String(obs.actionType)+'|'+String(obs.decision);
    const row=groups.get(key);if(!row)continue;
    if(obs.outcome.polarity==='positive')row.positive++;
    else if(obs.outcome.polarity==='negative')row.negative++;
    else row.neutral++;
    row.outcomeCodes.set(obs.outcome.code,(row.outcomeCodes.get(obs.outcome.code)||0)+1);
  }
  return [...groups.values()].filter(row=>row.count>=2).map(row=>({
    actionType:row.actionType,
    decision:row.decision,
    sampleSize:row.count,
    positiveObservations:row.positive,
    negativeObservations:row.negative,
    neutralObservations:row.neutral,
    mostObservedOutcomes:[...row.outcomeCodes.entries()].sort((a,b)=>b[1]-a[1]).slice(0,3).map(([code,count])=>({code,count})),
    interpretation:'Padrão descritivo de resultados observados depois de decisões semelhantes; não mede efeito causal.'
  }));
}

function emptyOutcomeLearning(){
  return{
    observations:[] as OutcomeObservation[],
    patterns:[] as any[],
    summary:{decisions:0,decisionsWithObservedOutcome:0,approvedDecisions:0,approvedWithObservedOutcome:0,positiveObservations:0,negativeObservations:0,neutralObservations:0,coveragePct:0},
    methodology:{observationWindowDays:90,temporalAssociationOnly:true,requiresSameBusinessContext:true,causalClaims:false,patternMinimumSample:2,patternLanguage:'observed_after_decision_not_caused_by_decision'},
    safety:{readOnly:true,externalEffects:false,automaticPolicyChange:false,automaticDecisionChange:false}
  };
}
