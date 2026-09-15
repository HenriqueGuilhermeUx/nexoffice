const base=process.env.SMOKE_API_URL||'http://127.0.0.1:4000';
let token='';let workspace='';
const call=async(path,{method='GET',body,auth=true}={})=>{const headers={'content-type':'application/json'};if(auth&&token)headers.authorization=`Bearer ${token}`;if(auth&&workspace)headers['x-workspace-id']=workspace;const r=await fetch(base+path,{method,headers,body:body!==undefined?JSON.stringify(body):undefined});const payload=await r.json().catch(()=>({}));if(!r.ok)throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(payload)}`);return payload};
const assert=(value,message)=>{if(!value)throw new Error(`ASSERT: ${message}`)};
const findAction=(actions,type,subjectId)=>actions.find(x=>String(x?.primary_action?.type||'')===type&&(!subjectId||x.subject_id===subjectId));

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
let actions=await call('/v1/command/actions');assert(actions.length>=2,'event orchestration should create action inbox items');
const policies=await call('/v1/autonomy-policies');assert(policies.some(x=>x.action_type==='lead.created'),'default autonomy policies seeded');assert(policies.some(x=>x.action_type==='collection.reminder.send'),'collections autonomy policy seeded');

// Business-aware assistant: real workspace facts, persisted conversation.
const brief=await call('/v1/assistant/brief');assert(brief.workspace.id===workspace,'assistant brief workspace');assert(Array.isArray(brief.suggestedPrompts)&&brief.suggestedPrompts.length>=3,'assistant suggested prompts');
const chat=await call('/v1/assistant/chat',{method:'POST',body:{message:'Como está meu pipeline de vendas?'}});assert(chat.conversationId&&chat.message?.content,'assistant chat persisted');assert(chat.agentRole==='crm','assistant routes CRM intent');
const messages=await call(`/v1/assistant/conversations/${chat.conversationId}/messages`);assert(messages.length===2,'assistant conversation stores user and assistant messages');

// Document refs are horizontal: raw document stays in DocWallet; NexOffice queues actions safely.
const doc=await call('/v1/documents',{method:'POST',body:{contactId:contact.id,provider:'docwallet',externalRef:'dw-smoke-001',title:'Contrato Smoke',status:'active',documentType:'contract'}});assert(doc.id,'document ref created');
await call(`/v1/documents/${doc.id}/analyze`,{method:'POST',body:{}});
actions=await call('/v1/command/actions');
const analyzeAction=findAction(actions,'document.analyze',doc.id);assert(analyzeAction,'document analyze action created');
const analyzeRun=await call(`/v1/command/actions/${analyzeAction.id}/execute`,{method:'POST',body:{}});assert(analyzeRun.run?.status==='queued_external','document analyze queued to adapter');
const analyzeRunAgain=await call(`/v1/command/actions/${analyzeAction.id}/execute`,{method:'POST',body:{}});assert(analyzeRunAgain.reused===true,'agent execution is idempotent');

await call(`/v1/documents/${doc.id}/signature-request`,{method:'POST',body:{signers:[{name:'Cliente Smoke',email:'cliente@nexoffice.test'}]}});
actions=await call('/v1/command/actions');
const signAction=findAction(actions,'document.signature_request',doc.id);assert(signAction&&signAction.approval_id,'signature request requires approval');
await call(`/v1/command/actions/${signAction.id}/decision`,{method:'POST',body:{decision:'approved'}});
const signRun=await call(`/v1/command/actions/${signAction.id}/execute`,{method:'POST',body:{}});assert(signRun.run?.status==='queued_external','approved signature request queues adapter');

// Overdue receivable -> collection rule -> human approval -> agent/outbox.
const overdue=await call('/v1/ledger',{method:'POST',body:{contactId:contact.id,direction:'income',category:'mensalidade',description:'Mensalidade vencida Smoke',amountMinor:99000,status:'open',dueAt:new Date(Date.now()-2*86400000).toISOString()}});assert(overdue.id,'overdue receivable created');
const collectionScan=await call('/v1/collections/scan',{method:'POST',body:{}});assert(collectionScan.created>=1,'collection scan creates reminder attempt');
const collectionOverview=await call('/v1/collections/overview');assert(Number(collectionOverview.summary.overdue_count)>=1,'collections overview sees overdue item');
actions=await call('/v1/command/actions');
const reminderAction=findAction(actions,'collection.reminder.send',overdue.id);assert(reminderAction&&reminderAction.approval_id,'collection reminder is approval-first');
await call(`/v1/command/actions/${reminderAction.id}/decision`,{method:'POST',body:{decision:'approved'}});
const reminderRun=await call(`/v1/command/actions/${reminderAction.id}/execute`,{method:'POST',body:{}});assert(reminderRun.run?.status==='queued_external','collection reminder queues messaging adapter');

// A charge request is also approval-gated and goes to NextGen through the same runtime.
await call(`/v1/collections/ledger/${overdue.id}/create-charge`,{method:'POST',body:{}});
actions=await call('/v1/command/actions');
const chargeAction=findAction(actions,'payment.charge.create',overdue.id);assert(chargeAction&&chargeAction.approval_id,'charge creation requires approval');
await call(`/v1/command/actions/${chargeAction.id}/decision`,{method:'POST',body:{decision:'approved'}});
await call(`/v1/command/actions/${chargeAction.id}/execute`,{method:'POST',body:{}});

const outboxBefore=await call('/v1/outbox');assert(outboxBefore.length>=4,'document, signature, reminder and charge are in outbox');
const processed=await call('/v1/outbox/process',{method:'POST',body:{limit:20}});assert(processed.processed>=4,'outbox dry-run processes queued external actions');assert(processed.results.every(x=>x.ok===true&&x.dryRun===true),'CI external effects remain dry-run');
const runs=await call('/v1/agent-runs');assert(runs.length>=4,'agent runs persisted');assert(runs.some(x=>x.status==='succeeded'),'agent runs complete after dry-run dispatch');

// ERP Lite reconciliation: imported bank transaction can be matched automatically to a unique ledger entry.
const accounts=await call('/v1/finance/accounts');assert(accounts.length>=1,'default finance account exists');
const reconcileLedger=await call('/v1/ledger',{method:'POST',body:{contactId:contact.id,accountId:accounts[0].id,direction:'income',category:'serviços',description:'Recebível para conciliação',amountMinor:123400,status:'open',dueAt:new Date().toISOString()}});assert(reconcileLedger.id,'reconciliation ledger created');
const bankTime=new Date().toISOString();
const imported=await call('/v1/reconciliation/import',{method:'POST',body:{accountId:accounts[0].id,provider:'smoke-bank',items:[{externalRef:'smoke-bank-001',occurredAt:bankTime,direction:'income',amountMinor:123400,currency:'BRL',description:'PIX recebido Cliente Smoke',counterparty:'Cliente Smoke'}]}});assert(imported.inserted===1,'bank transaction imported');
const autoMatch=await call('/v1/reconciliation/auto-match',{method:'POST',body:{max:20,minConfidence:.9}});assert(autoMatch.matched===1,'auto reconciliation matches unique transaction');
const reconciliation=await call('/v1/reconciliation/summary');assert(reconciliation.matched===1&&reconciliation.unmatched===0,'reconciliation summary updated');
const ledgerAfter=await call('/v1/ledger');const matchedLedger=ledgerAfter.find(x=>x.id===reconcileLedger.id);assert(matchedLedger?.status==='paid','reconciliation settles ledger entry');

const invite=await call('/v1/members/invite',{method:'POST',body:{email:'member@nexoffice.test',role:'member'}});assert(invite.inviteToken,'invite token returned');
const memberRegister=await call('/v1/auth/register',{method:'POST',auth:false,body:{name:'Smoke Member',email:'member@nexoffice.test',password:'SmokePass123!',inviteToken:invite.inviteToken}});assert(memberRegister.workspace.id===workspace,'invite joins same workspace');

console.log(JSON.stringify({ok:true,workspace,contact:contact.id,deal:deal.id,assistantConversation:chat.conversationId,document:doc.id,collectionAttempts:collectionScan.created,agentRuns:runs.length,outboxProcessed:processed.processed,reconciliationMatches:autoMatch.matched,actions:actions.length,policies:policies.length},null,2));
