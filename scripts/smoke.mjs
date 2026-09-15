const base=process.env.SMOKE_API_URL||'http://127.0.0.1:4000';
let token='';let workspace='';
const call=async(path,{method='GET',body,auth=true}={})=>{const headers={'content-type':'application/json'};if(auth&&token)headers.authorization=`Bearer ${token}`;if(auth&&workspace)headers['x-workspace-id']=workspace;const r=await fetch(base+path,{method,headers,body:body?JSON.stringify(body):undefined});const payload=await r.json().catch(()=>({}));if(!r.ok)throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(payload)}`);return payload};
const assert=(value,message)=>{if(!value)throw new Error(`ASSERT: ${message}`)};

const register=await call('/v1/auth/register',{method:'POST',auth:false,body:{name:'Smoke Owner',email:'smoke@nexoffice.test',password:'SmokePass123!',businessName:'Smoke Company',vertical:'general'}});
token=register.token;workspace=register.workspace.id;assert(token&&workspace,'register must return token/workspace');

const me=await call('/v1/auth/me');assert(me.user.email==='smoke@nexoffice.test','me email');assert(me.workspaces.length===1,'one workspace');
const contact=await call('/v1/crm/contacts',{method:'POST',body:{kind:'company',name:'Cliente Smoke',email:'cliente@nexoffice.test',phone:'5513999999999',source:'smoke',tags:['teste']}});assert(contact.id,'contact created');
const deal=await call('/v1/crm/deals',{method:'POST',body:{contactId:contact.id,title:'Projeto Smoke',stage:'lead',valueMinor:150000,nextAction:'Agendar conversa'}});assert(deal.id,'deal created');
await call(`/v1/crm/deals/${deal.id}`,{method:'PATCH',body:{stage:'qualified'}});
const task=await call('/v1/tasks',{method:'POST',body:{contactId:contact.id,dealId:deal.id,title:'Retornar cliente',priority:'high',dueAt:new Date(Date.now()+3600000).toISOString()}});assert(task.id,'task created');
await call(`/v1/tasks/${task.id}`,{method:'PATCH',body:{status:'doing'}});
const appointment=await call('/v1/appointments',{method:'POST',body:{contactId:contact.id,title:'Reunião Smoke',startsAt:new Date(Date.now()+7200000).toISOString(),endsAt:new Date(Date.now()+10800000).toISOString()}});assert(appointment.id,'appointment created');
const ledger=await call('/v1/ledger',{method:'POST',body:{contactId:contact.id,direction:'income',category:'serviços',description:'Projeto Smoke',amountMinor:150000,status:'open',dueAt:new Date(Date.now()+86400000).toISOString()}});assert(ledger.id,'ledger created');
await call(`/v1/ledger/${ledger.id}`,{method:'PATCH',body:{status:'paid'}});

const dashboard=await call('/v1/dashboard');assert(Number(dashboard.crm.open_deals)>=1,'dashboard open deals');assert(Number(dashboard.finance.income_paid_minor)===150000,'dashboard paid income');
const actions=await call('/v1/command/actions');assert(actions.length>=2,'event orchestration should create action inbox items');
const policies=await call('/v1/autonomy-policies');assert(policies.some(x=>x.action_type==='lead.created'),'default autonomy policies seeded');

const invite=await call('/v1/members/invite',{method:'POST',body:{email:'member@nexoffice.test',role:'member'}});assert(invite.inviteToken,'invite token returned');
const memberRegister=await call('/v1/auth/register',{method:'POST',auth:false,body:{name:'Smoke Member',email:'member@nexoffice.test',password:'SmokePass123!',inviteToken:invite.inviteToken}});assert(memberRegister.workspace.id===workspace,'invite joins same workspace');

console.log(JSON.stringify({ok:true,workspace,contact:contact.id,deal:deal.id,actions:actions.length,policies:policies.length},null,2));
