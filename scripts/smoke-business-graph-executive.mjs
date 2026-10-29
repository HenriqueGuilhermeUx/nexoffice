const base=process.env.SMOKE_API_URL||'http://127.0.0.1:4000';
let token='',workspace='';

async function call(path,{method='GET',body,expected=200,auth=true}={}){
  const headers={accept:'application/json','content-type':'application/json'};
  if(auth&&token)headers.authorization=`Bearer ${token}`;
  if(auth&&workspace)headers['x-workspace-id']=workspace;
  const response=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const payload=await response.json().catch(()=>({}));
  if(response.status!==expected)throw new Error(`${method} ${path} -> ${response.status}, expected ${expected}: ${JSON.stringify(payload)}`);
  return payload;
}
const assert=(value,message)=>{if(!value)throw new Error(`ASSERT: ${message}`)};

const registered=await call('/v1/auth/register',{method:'POST',auth:false,body:{
  name:'Business Graph Smoke',
  email:'business-graph@nexoffice.test',
  password:'SmokePass123!',
  businessName:'Graph Company',
  vertical:'general'
}});
token=registered.token;workspace=registered.workspace.id;
assert(token&&workspace,'register returns token/workspace');

const contact=await call('/v1/crm/contacts',{method:'POST',body:{kind:'company',name:'Cliente Atlas',email:'atlas@nexoffice.test',source:'smoke'}});
const deal=await call('/v1/crm/deals',{method:'POST',body:{
  contactId:contact.id,
  title:'Expansão Atlas',
  stage:'proposal',
  valueMinor:2500000,
  currency:'BRL',
  nextAction:'Revisar proposta',
  expectedCloseAt:new Date(Date.now()-3*86400000).toISOString()
}});
const task=await call('/v1/tasks',{method:'POST',body:{
  contactId:contact.id,
  dealId:deal.id,
  title:'Confirmar escopo Atlas',
  priority:'high',
  dueAt:new Date(Date.now()-2*86400000).toISOString()
}});
const ledger=await call('/v1/ledger',{method:'POST',body:{
  contactId:contact.id,
  direction:'income',
  category:'serviços',
  description:'Projeto Atlas vencido',
  amountMinor:420000,
  currency:'BRL',
  status:'overdue',
  dueAt:new Date(Date.now()-5*86400000).toISOString()
}});
await call('/v1/appointments',{method:'POST',body:{
  contactId:contact.id,
  title:'Reunião Atlas',
  startsAt:new Date(Date.now()+2*86400000).toISOString(),
  endsAt:new Date(Date.now()+2*86400000+3600000).toISOString()
}});
await call('/v1/events',{method:'POST',body:{
  type:'deal.review_requested',
  source:'smoke.business-graph',
  subjectType:'crm_deal',
  subjectId:deal.id,
  payload:{reason:'expected close date exceeded'}
}});

const sources=await call('/v1/business-graph/sources');
assert(sources.workspace.id===workspace,'source registry is workspace scoped');
assert(sources.connectorContract?.version==='nex-connect-v1','Nex Connect contract is exposed');
assert(Array.isArray(sources.native)&&sources.native.some(item=>item.source==='nexoffice.crm'),'native CRM source is registered');
assert(sources.safety?.secretsReturned===false&&sources.safety?.externalEffects===false,'source registry leaks no secrets and executes nothing');

const graph=await call('/v1/business-graph/overview?days=90&includeGraph=true');
assert(graph.workspace.id===workspace,'graph is workspace scoped');
assert(graph.safety?.readOnly===true&&graph.safety?.externalEffects===false,'graph is read-only');
assert(Number(graph.coverage?.nodes)>=6,'graph has multiple domain nodes');
assert(Number(graph.coverage?.edges)>=5,'graph has relationships');
assert(Array.isArray(graph.graph?.nodes)&&Array.isArray(graph.graph?.edges),'full graph can be requested explicitly');
assert(graph.graph.nodes.some(node=>node.kind==='external_organization'&&node.label==='Cliente Atlas'),'contact mapped to business graph');
assert(graph.graph.nodes.some(node=>node.kind==='deal'&&node.sourceId===deal.id),'deal mapped to business graph');
assert(graph.graph.nodes.some(node=>node.kind==='financial_entry'&&node.sourceId===ledger.id),'financial entry mapped to business graph');
assert(graph.graph.nodes.some(node=>node.kind==='task'&&node.sourceId===task.id),'task mapped to business graph');
assert(graph.graph.edges.some(edge=>edge.kind==='has_deal'),'customer-to-deal relation exists');
assert(graph.graph.edges.some(edge=>edge.kind==='financial_activity'),'customer-to-finance relation exists');
assert(graph.graph.edges.some(edge=>edge.kind==='supports'),'task-to-deal relation exists');
assert(graph.executiveSignals.some(signal=>signal.code==='receivables_overdue'),'overdue receivable becomes executive signal');
assert(graph.executiveSignals.some(signal=>signal.code==='tasks_overdue'),'overdue task becomes executive signal');
assert(graph.executiveSignals.some(signal=>signal.code==='deals_past_expected_close'),'stalled deal becomes executive signal');

const executive=await call('/v1/assistant/executive-context');
assert(executive.workspace.id===workspace,'executive context is workspace scoped');
assert(executive.evidencePolicy?.causalClaimsRequireEvidence===true,'causal claims are evidence gated');
assert(executive.evidencePolicy?.correlationsAreHypotheses===true,'correlations are labelled as hypotheses');
assert(executive.evidencePolicy?.externalEffects===false,'executive context does not execute');
assert(Array.isArray(executive.priorities)&&executive.priorities.length>=3,'executive context aggregates priorities');
assert(executive.priorities[0].evidence?.length>=1,'priority includes evidence');
assert(Number(executive.businessGraph?.nodes)>=6,'executive context includes graph coverage');

const chat=await call('/v1/assistant/chat',{method:'POST',body:{message:'Como está meu negócio e o que devo priorizar agora?'}});
assert(chat.agentRole==='controller','broad question routes to Maya/controller');
assert(chat.message?.content&&String(chat.message.content).length>20,'Maya returns executive narrative');
assert(chat.facts?.executive?.evidencePolicy?.readOnly===true,'Maya response carries read-only executive evidence');
assert(Array.isArray(chat.facts?.executive?.priorities)&&chat.facts.executive.priorities.length>=3,'Maya receives executive priorities');

console.log(JSON.stringify({
  ok:true,
  workspace,
  graph:{nodes:graph.coverage.nodes,edges:graph.coverage.edges,sources:graph.coverage.sources},
  sourceRegistry:{native:sources.native.length,integrations:sources.integrations.length,alternativeVentures:sources.alternativeVentures.length},
  signals:graph.executiveSignals.map(signal=>signal.code),
  priorities:executive.priorities.map(item=>({code:item.code,level:item.level})),
  maya:{agentRole:chat.agentRole,text:chat.message.content}
},null,2));
