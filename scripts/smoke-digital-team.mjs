const base=process.env.SMOKE_API_URL||'http://127.0.0.1:4000';
let token='',workspace='';

async function call(path,{method='GET',body,expected=200}={}){
  const headers={accept:'application/json','content-type':'application/json'};
  if(token)headers.authorization=`Bearer ${token}`;
  if(workspace)headers['x-workspace-id']=workspace;
  const response=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const payload=await response.json().catch(()=>({}));
  if(response.status!==expected)throw new Error(`${method} ${path} -> ${response.status}, expected ${expected}: ${JSON.stringify(payload)}`);
  return payload;
}
const assert=(value,message)=>{if(!value)throw new Error(`ASSERT: ${message}`)};

const registered=await call('/v1/auth/register',{method:'POST',body:{name:'Digital Team Smoke',email:'digital-team@nexoffice.test',password:'SmokePass123!',businessName:'Digital Team Company',vertical:'general'}});
token=registered.token;workspace=registered.workspace.id;

const roles=['secretary','service','crm','erp','collections','controller','documents','growth'];
const prompts={
  secretary:'Como está minha agenda?',
  service:'O que precisa de atenção no atendimento?',
  crm:'Como está meu pipeline?',
  erp:'Como está a operação do negócio?',
  collections:'O que tenho para receber?',
  controller:'Quais despesas e riscos financeiros devo acompanhar?',
  documents:'Quais documentos precisam de atenção?',
  growth:'Como está minha prospecção B2B?'
};

for(const role of roles){
  const result=await call('/v1/assistant/chat',{method:'POST',body:{message:prompts[role],agentRole:role}});
  assert(result.conversationId,`${role} creates conversation`);
  assert(result.agentRole===role,`${role} remains the forced specialist role`);
  assert(result.message?.content,`${role} returns a grounded response`);
  if(role==='documents'){
    assert(result.facts?.docWallet,'Dora returns explicit DocWallet capability state');
    assert(result.facts.docWallet.connected===false,'Dora degrades safely when DocWallet runtime is not configured in CI');
    assert(Array.isArray(result.facts.docWallet.upcomingAlerts),'Dora keeps a stable document-alert contract');
  }
  if(role==='growth'){
    assert(result.facts?.modo,'Maya returns explicit MODO capability state');
    assert(result.facts.modo.connected===false,'Maya degrades safely when MODO runtime is not configured in CI');
    assert(result.facts.modo.prospecting?.discoveryRequiresExplicitApproval===true,'Maya keeps B2B discovery approval-first');
    assert(result.facts.modo.prospecting?.externalOutreach===false,'Maya never implies automatic B2B outreach');
    assert(result.actions?.some(item=>item.label==='Ver Prospecção'),'Maya routes explicit B2B prospecting intent to the marketing workspace');
  }
  const messages=await call(`/v1/assistant/conversations/${result.conversationId}/messages`);
  assert(messages.length===2,`${role} persists user and assistant messages`);
  assert(messages[0].agent_role===role||messages[1].agent_role===role,`${role} is persisted in conversation messages`);
}

const radar=await call('/v1/assistant/chat',{method:'POST',body:{message:'Como está meu radar de mercado?',agentRole:'growth'}});
assert(radar.agentRole==='growth','Maya owns Market Radar intent');
assert(radar.facts?.modo?.marketRadar,'Maya returns an explicit Market Radar capability state');
assert(radar.facts.modo.marketRadar.configured===false,'CI keeps external Market Radar provider unconfigured');
assert(radar.facts.modo.marketRadar.collectionRequiresExplicitApproval===true,'Market Radar collection stays approval-first');
assert(radar.facts.modo.marketRadar.externalCommunication===false,'Market Radar never implies external communication');
assert(radar.actions?.some(item=>item.label==='Ver Radar de Mercado'),'Maya exposes a Market Radar navigation action');

const conversations=await call('/v1/assistant/conversations');
assert(conversations.length===roles.length+1,'all eight specialists plus Market Radar conversation are persisted');
for(const role of roles)assert(conversations.some(item=>item.agent_role===role),`${role} conversation is discoverable`);

console.log(JSON.stringify({ok:true,workspace,roles,conversations:conversations.length,sharedWorkspace:true,docWalletFallbackSafe:true,modoFallbackSafe:true,prospectingApprovalFirst:true,externalProspectingOutreach:false,marketRadarApprovalFirst:true,marketRadarExternalCommunication:false},null,2));