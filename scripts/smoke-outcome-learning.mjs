const base=process.env.SMOKE_API_URL||'http://127.0.0.1:4000';
let token='',workspace='';
async function call(path,{method='GET',body,auth=true}={}){
  const headers={'content-type':'application/json',accept:'application/json'};
  if(auth&&token)headers.authorization='Bearer '+token;
  if(auth&&workspace)headers['x-workspace-id']=workspace;
  const response=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(method+' '+path+' -> '+response.status+' '+JSON.stringify(payload));
  return payload;
}
const assert=(value,message)=>{if(!value)throw new Error('ASSERT: '+message)};

const reg=await call('/v1/auth/register',{method:'POST',auth:false,body:{
  name:'Outcome Learning Smoke',
  email:'outcome-learning-'+Date.now()+'@nexoffice.test',
  password:'SmokePass123!',
  businessName:'Outcome Learning Co',
  vertical:'general'
}});
token=reg.token;workspace=reg.workspace.id;

const contact=await call('/v1/crm/contacts',{method:'POST',body:{
  kind:'company',
  name:'Cliente Outcome',
  email:'outcome@nexoffice.test',
  source:'smoke'
}});

const decisionEvent=await call('/v1/events',{method:'POST',body:{
  type:'lead.followup_due',
  source:'smoke.outcome',
  subjectType:'contact',
  subjectId:contact.id,
  payload:{summary:'Revisar follow-up do cliente Outcome.'}
}});
assert(decisionEvent.action?.id,'first decision action must be created');

await call('/v1/command/actions/'+decisionEvent.action.id+'/decision',{method:'POST',body:{
  decision:'approved',
  reason:'Cliente demonstrou interesse e pediu continuidade da conversa.'
}});

const deal=await call('/v1/crm/deals',{method:'POST',body:{
  contactId:contact.id,
  title:'Expansão Outcome',
  stage:'proposal',
  valueMinor:1500000,
  currency:'BRL',
  source:'smoke'
}});
await call('/v1/crm/activities',{method:'POST',body:{
  contactId:contact.id,
  dealId:deal.id,
  type:'call',
  direction:'outbound',
  subject:'Follow-up realizado',
  body:'Contato registrado após a decisão.',
  metadata:{source:'smoke'}
}});
await call('/v1/crm/deals/'+deal.id,{method:'PATCH',body:{stage:'won'}});

const secondEvent=await call('/v1/events',{method:'POST',body:{
  type:'lead.followup_due',
  source:'smoke.outcome',
  subjectType:'contact',
  subjectId:contact.id,
  payload:{summary:'Novo follow-up para teste sem desfecho posterior.'}
}});
assert(secondEvent.action?.id,'second decision action must be created');
await call('/v1/command/actions/'+secondEvent.action.id+'/decision',{method:'POST',body:{
  decision:'rejected',
  reason:'Não há necessidade de novo contato neste momento.'
}});

const learning=await call('/v1/crm/contacts/'+contact.id+'/outcome-learning');
assert(learning.methodology?.temporalAssociationOnly===true,'Outcome Learning must be temporal association only');
assert(learning.methodology?.causalClaims===false,'Outcome Learning must not claim causality');
assert(learning.safety?.readOnly===true&&learning.safety?.externalEffects===false,'Outcome Learning must remain read-only');
assert(learning.safety?.automaticPolicyChange===false&&learning.safety?.automaticDecisionChange===false,'Outcome Learning must not change policy or decisions');

assert(Number(learning.summary?.decisions)===2,'two decisions must be analyzed');
assert(Number(learning.summary?.decisionsWithObservedOutcome)===1,'only first decision should have observed outcomes');
assert(Number(learning.summary?.coveragePct)===50,'coverage should reflect one of two decisions with outcomes');

const firstOutcomes=learning.observations.filter(x=>x.actionId===decisionEvent.action.id);
assert(firstOutcomes.some(x=>x.outcome?.code==='customer_interaction'),'approved follow-up must observe later customer interaction');
assert(firstOutcomes.some(x=>x.outcome?.code==='deal_won'),'approved follow-up must observe later won deal');
assert(firstOutcomes.every(x=>x.relationship?.causalClaim===false),'all observations must explicitly deny causal claim');
assert(firstOutcomes.every(x=>x.outcome?.daysAfterDecision>=0),'all outcomes must occur after decision');
assert(firstOutcomes.every(x=>x.outcome?.eventId),'all outcomes must preserve event evidence');

const secondOutcomes=learning.observations.filter(x=>x.actionId===secondEvent.action.id);
assert(secondOutcomes.length===0,'decision without later event must not receive invented outcome');

const view=await call('/v1/crm/contacts/'+contact.id+'/360');
assert(view.outcomeLearning?.observations?.some(x=>x.outcome?.code==='deal_won'),'Customer 360 must expose Outcome Learning');
assert(view.timeline.some(x=>x.kind==='outcome'&&x.source==='nexoffice.outcome_learning'),'outcomes must appear in unified timeline');
assert(view.memory?.outcomeLearningStatus==='operational_temporal_observation_v1','Customer 360 must expose operational Outcome Learning status');

console.log(JSON.stringify({
  ok:true,
  module:'Outcome Learning V1',
  contact:contact.id,
  decisions:learning.summary.decisions,
  decisionsWithObservedOutcome:learning.summary.decisionsWithObservedOutcome,
  coveragePct:learning.summary.coveragePct,
  observedCodes:[...new Set(firstOutcomes.map(x=>x.outcome.code))],
  secondDecisionOutcomeInvented:false,
  causalClaims:false,
  externalEffects:false
},null,2));
