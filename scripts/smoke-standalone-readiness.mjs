const base=process.env.SMOKE_API_URL||'http://127.0.0.1:4000';
const suffix=Date.now();
let token='';let workspace='';
const call=async(path,{method='GET',body,auth=true}={})=>{const headers={'content-type':'application/json'};if(auth&&token)headers.authorization=`Bearer ${token}`;if(auth&&workspace)headers['x-workspace-id']=workspace;const r=await fetch(base+path,{method,headers,body:body!==undefined?JSON.stringify(body):undefined});const payload=await r.json().catch(()=>({}));if(!r.ok)throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(payload)}`);return payload};
const assert=(value,message)=>{if(!value)throw new Error(`ASSERT: ${message}`)};

const register=await call('/v1/auth/register',{method:'POST',auth:false,body:{name:'Standalone Owner',email:`standalone-${suffix}@nexoffice.test`,password:'SmokePass123!',businessName:`Standalone ${suffix}`,vertical:'general'}});
token=register.token;workspace=register.workspace.id;

let readiness=await call('/v1/standalone/readiness');
assert(readiness.workspace.id===workspace,'readiness workspace');
assert(readiness.safety.externalActionsEnabled===false,'external actions must remain disabled');
assert(readiness.metrics.financeAccounts>=1,'finance account must exist from workspace bootstrap');
assert(readiness.metrics.members===1,'owner must be the initial member');
assert(readiness.operationalReady===false,'fresh workspace should require activation');
assert(readiness.steps.some(x=>x.key==='contact'&&!x.done),'contact should start incomplete');

const contact=await call('/v1/crm/contacts',{method:'POST',body:{kind:'company',name:'Cliente Standalone',email:`cliente-${suffix}@nexoffice.test`,source:'standalone-smoke',tags:['setup']}});
assert(contact.id,'contact created');
const deal=await call('/v1/crm/deals',{method:'POST',body:{contactId:contact.id,title:'Primeira oportunidade standalone',stage:'lead',valueMinor:125000,nextAction:'Enviar proposta',source:'standalone-smoke'}});
assert(deal.id,'deal created');
const task=await call('/v1/tasks',{method:'POST',body:{title:'Primeira tarefa standalone',priority:'normal',dueAt:new Date(Date.now()+3600000).toISOString()}});
assert(task.id,'task created');
const ledger=await call('/v1/ledger',{method:'POST',body:{direction:'income',category:'serviços',description:'Primeiro lançamento standalone',amountMinor:125000,status:'open',dueAt:new Date(Date.now()+86400000).toISOString()}});
assert(ledger.id,'ledger created');
const invite=await call('/v1/members/invite',{method:'POST',body:{email:`member-${suffix}@nexoffice.test`,role:'member'}});
assert(invite.inviteToken&&invite.inviteUrl,'invite created');

readiness=await call('/v1/standalone/readiness');
assert(readiness.operationalReady===true,'workspace should be operationally ready');
assert(readiness.completionPct===100,'readiness should reach 100%');
assert(readiness.completed===readiness.total,'all readiness steps complete');
assert(readiness.metrics.contacts>=1&&readiness.metrics.deals>=1&&readiness.metrics.tasks>=1&&readiness.metrics.ledgerEntries>=1,'operational metrics populated');
assert(readiness.metrics.pendingInvites>=1,'pending invite satisfies team activation step');

console.log(JSON.stringify({ok:true,workspace,completionPct:readiness.completionPct,completed:readiness.completed,total:readiness.total,metrics:readiness.metrics},null,2));
