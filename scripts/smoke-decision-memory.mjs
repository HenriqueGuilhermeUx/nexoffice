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
  name:'Decision Memory Smoke',
  email:'decision-memory-'+Date.now()+'@nexoffice.test',
  password:'SmokePass123!',
  businessName:'Decision Memory Co',
  vertical:'general'
}});
token=reg.token;workspace=reg.workspace.id;

const contact=await call('/v1/crm/contacts',{method:'POST',body:{
  kind:'company',name:'Cliente Decision',email:'decision@nexoffice.test',source:'smoke'
}});

const first=await call('/v1/events',{method:'POST',body:{
  type:'lead.followup_due',
  source:'smoke.decision',
  subjectType:'contact',
  subjectId:contact.id,
  payload:{summary:'Revisar proposta antes do próximo contato.'}
}});
assert(first.action?.id,'event must create command action');
assert(first.action?.approval_id,'event must create approval request');

await call('/v1/command/actions/'+first.action.id+'/decision',{method:'POST',body:{
  decision:'approved',
  reason:'Cliente pediu revisão comercial antes do próximo contato.'
}});

const second=await call('/v1/events',{method:'POST',body:{
  type:'lead.followup_due',
  source:'smoke.decision',
  subjectType:'contact',
  subjectId:contact.id,
  payload:{summary:'Enviar follow-up adicional.'}
}});
assert(second.action?.id,'second event must create command action');
await call('/v1/command/actions/'+second.action.id+'/decision',{method:'POST',body:{decision:'rejected'}});

const view=await call('/v1/crm/contacts/'+contact.id+'/360');
assert(view.memory?.decisionsIncluded===true,'Customer 360 must include Decision Memory');
assert(view.memory?.decisionMemoryStatus==='operational_from_audit_and_approval_trail','Decision Memory must be operational');
assert(Number(view.decisionSummary?.total)===2,'two explicit decisions must be reconstructed');
assert(Number(view.decisionSummary?.approved)===1,'one approved decision expected');
assert(Number(view.decisionSummary?.rejected)===1,'one rejected decision expected');
assert(Number(view.decisionSummary?.withRationale)===1,'only explicitly supplied rationale may be recorded');

const approved=view.decisions.find(x=>x.actionId===first.action.id);
assert(approved?.decision==='approved','first decision must be approved');
assert(approved?.decidedBy?.name==='Decision Memory Smoke','human actor must resolve to workspace user');
assert(approved?.rationale==='Cliente pediu revisão comercial antes do próximo contato.','explicit rationale must be preserved verbatim');
assert(approved?.rationaleStatus==='recorded','explicit rationale must be marked recorded');
assert(approved?.observedOutcome?.status==='approved_waiting_execution','approval must not be confused with completed execution');
assert(approved?.observedOutcome?.executionObserved===false,'execution must remain unobserved after approval only');

const rejected=view.decisions.find(x=>x.actionId===second.action.id);
assert(rejected?.decision==='rejected','second decision must be rejected');
assert(rejected?.rationale===null&&rejected?.rationaleStatus==='not_recorded','missing rationale must not be inferred');

const decisionTimeline=view.timeline.filter(x=>x.kind==='decision');
assert(decisionTimeline.length===2,'both decisions must appear in unified timeline');
assert(decisionTimeline.every(x=>x.source==='nexoffice.decision_memory'),'decision timeline source must remain auditable');
assert(view.safety?.readOnly===true&&view.safety?.externalEffects===false,'Customer 360 read must remain effect-free');

console.log(JSON.stringify({
  ok:true,
  module:'Decision Memory V1',
  contact:contact.id,
  decisions:view.decisionSummary,
  actor:approved.decidedBy.name,
  rationalePreserved:true,
  missingRationaleInferred:false,
  executionObserved:false,
  externalEffects:false
},null,2));
