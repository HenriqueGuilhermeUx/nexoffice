const base=process.env.SMOKE_API_URL||'http://127.0.0.1:4000';
const internalKey=process.env.NEXOFFICE_INTERNAL_KEY||'platform-smoke-key';

async function call(path,{method='GET',body,expected=200}={}){
  const headers={accept:'application/json','x-nexoffice-key':internalKey};
  if(body!==undefined)headers['content-type']='application/json';
  const response=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const payload=await response.json().catch(()=>({}));
  if(response.status!==expected)throw new Error(`${method} ${path} -> ${response.status}, expected ${expected}: ${JSON.stringify(payload)}`);
  return payload;
}

async function userCall(path,{method='GET',body,expected=200,token,workspaceId}={}){
  const headers={accept:'application/json',authorization:`Bearer ${token}`,'x-workspace-id':workspaceId};
  if(body!==undefined)headers['content-type']='application/json';
  const response=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const payload=await response.json().catch(()=>({}));
  if(response.status!==expected)throw new Error(`${method} ${path} -> ${response.status}, expected ${expected}: ${JSON.stringify(payload)}`);
  return payload;
}

const assert=(value,message)=>{if(!value)throw new Error(`ASSERT: ${message}`)};
const workspaceRef='legal-smoke-office';
const access={sourceProduct:'nexjud',externalWorkspaceRef:workspaceRef,externalUserSubject:'legal-smoke-owner',email:'legal-smoke@nexoffice.test'};

const provision=await call('/v1/platform/provision',{method:'POST',body:{
  sourceProduct:'nexjud',
  externalWorkspaceRef:workspaceRef,
  businessName:'Escritório Legal Smoke',
  vertical:'legal',
  ownerEmail:access.email,
  ownerName:'Legal Smoke Owner',
  memberRole:'owner',
  externalUserSubject:access.externalUserSubject,
  entitlements:['addon.nexjud']
}});
assert(provision.workspace?.vertical==='legal','legal workspace must be provisioned');

const now=new Date();
const periodEnd=now.toISOString();
const periodStart=new Date(now.getTime()-24*60*60*1000).toISOString();
const correlationId='legal-signal-smoke-001';

const accepted=await call('/v1/platform/legal-signals',{method:'POST',body:{
  sourceProduct:'nexjud',
  externalWorkspaceRef:workspaceRef,
  correlationId,
  signalType:'activity.summary',
  periodStart,
  periodEnd,
  dimensions:{window:'day',scope:'workspace'},
  metrics:{strategicAnalyses:7,drafts:4,judgeSessions:2,agentRuns:11}
}});
assert(accepted.ok===true,'valid legal aggregate accepted');
assert(accepted.privacy==='aggregate_only','aggregate privacy marker');
assert(accepted.signal?.signal_type==='activity.summary','legal signal type persisted');

const deadlineCorrelation='legal-signal-smoke-deadlines';
await call('/v1/platform/legal-signals',{method:'POST',body:{
  sourceProduct:'nexjud',externalWorkspaceRef:workspaceRef,correlationId:deadlineCorrelation,
  signalType:'deadlines.summary',periodStart,periodEnd,dimensions:{window:'day',scope:'workspace'},
  metrics:{dueToday:2,due7Days:6,overdue:1,completed:5}
}});

const listed=await call(`/v1/platform/legal-signals?sourceProduct=nexjud&externalWorkspaceRef=${encodeURIComponent(workspaceRef)}&limit=10`);
assert(listed.privacy==='aggregate_only','list privacy marker');
assert(Array.isArray(listed.signals)&&listed.signals.some(x=>x.correlation_id===correlationId),'accepted legal signal listed');

// Strict schema rejects matter identity, process number, client identity and legal text.
const forbiddenMatter=await call('/v1/platform/legal-signals',{method:'POST',expected:400,body:{
  sourceProduct:'nexjud',externalWorkspaceRef:workspaceRef,correlationId:'legal-signal-smoke-matter',
  signalType:'matters.summary',periodStart,periodEnd,dimensions:{window:'day',scope:'workspace'},
  metrics:{active:12,opened:2,closed:1,attentionRequired:3},
  processNumber:'0001234-56.2026.8.26.0000',clientName:'Cliente Sigiloso',legalStrategy:'contestar mérito'
}});
assert(forbiddenMatter.error==='request_failed'||forbiddenMatter.issues,'matter identity and legal text rejected');

const forbiddenMetric=await call('/v1/platform/legal-signals',{method:'POST',expected:400,body:{
  sourceProduct:'nexjud',externalWorkspaceRef:workspaceRef,correlationId:'legal-signal-smoke-content',
  signalType:'deadlines.summary',periodStart,periodEnd,dimensions:{window:'day',scope:'workspace'},
  metrics:{dueToday:2,due7Days:6,overdue:1,completed:5,petitionText:'conteúdo da peça',caseId:'case-123'}
}});
assert(forbiddenMetric.error==='request_failed'||forbiddenMetric.issues,'legal content rejected inside metrics');

await call('/v1/platform/provision',{method:'POST',body:{
  sourceProduct:'nexjud',externalWorkspaceRef:'legal-smoke-general',businessName:'General Legal Smoke',vertical:'general',
  ownerEmail:'general-legal-smoke@nexoffice.test',ownerName:'General Legal Smoke Owner',memberRole:'owner',externalUserSubject:'general-legal-smoke-owner'
}});
const wrongVertical=await call('/v1/platform/legal-signals',{method:'POST',expected:409,body:{
  sourceProduct:'nexjud',externalWorkspaceRef:'legal-smoke-general',correlationId:'legal-signal-smoke-general',
  signalType:'workload.summary',periodStart,periodEnd,dimensions:{window:'day',scope:'workspace'},
  metrics:{activeMatters:3,dueToday:1,waitingReview:1,backlog:1}
}});
assert(wrongVertical.error==='legal_workspace_required','non-legal workspace rejects legal signals');

const updated=await call('/v1/platform/legal-signals',{method:'POST',body:{
  sourceProduct:'nexjud',externalWorkspaceRef:workspaceRef,correlationId,
  signalType:'activity.summary',periodStart,periodEnd,dimensions:{window:'day',scope:'workspace'},
  metrics:{strategicAnalyses:8,drafts:5,judgeSessions:2,agentRuns:13}
}});
assert(Number(updated.signal?.metrics?.strategicAnalyses)===8,'idempotent legal aggregate update applied');
const relisted=await call(`/v1/platform/legal-signals?sourceProduct=nexjud&externalWorkspaceRef=${encodeURIComponent(workspaceRef)}&limit=100`);
assert(relisted.signals.filter(x=>x.correlation_id===correlationId).length===1,'idempotency prevents duplicate legal aggregate');

// Federated user can consume the same aggregate safely inside the NexOffice workspace.
const exchange=await call('/v1/platform/session-exchange',{method:'POST',body:access});
assert(exchange.token&&exchange.workspace?.id===provision.workspace.id,'federated session exchange works');
const auth={token:exchange.token,workspaceId:exchange.workspace.id};
const workspaceSignals=await userCall('/v1/workspace/operational-signals?sourceProduct=nexjud&limit=20',{...auth});
assert(workspaceSignals.privacy==='aggregate_only','workspace API preserves privacy marker');
assert(workspaceSignals.signals.some(x=>x.signal_type==='activity.summary'),'workspace sees legal aggregate');
assert(workspaceSignals.signals.every(x=>!('correlation_id' in x)&&!('external_workspace_ref' in x)),'workspace response hides bridge identifiers');
assert(workspaceSignals.priorities.some(x=>String(x.title).includes('vencido')),'deterministic overdue priority generated');

const brief=await userCall('/v1/assistant/brief',{...auth});
assert(brief.workspace?.vertical==='legal','assistant knows legal vertical');
assert(brief.pulse?.operational?.privacy==='aggregate_only','brief exposes aggregate privacy boundary');
assert(brief.priorities.some(x=>String(x.title).includes('NexJud')),'NexJud priority appears in Copilot brief');
assert(brief.suggestedPrompts.some(x=>String(x).includes('NexJud')),'vertical-aware Copilot prompt appears');

const chat=await userCall('/v1/assistant/chat',{...auth,method:'POST',body:{message:'Como está a operação jurídica no NexJud?'}});
assert(String(chat.message?.content||'').includes('análise(s) estratégica(s)'),'Copilot summarizes aggregate NexJud activity');
assert(String(chat.message?.content||'').includes('não recebe número de processo'),'Copilot states legal privacy boundary');
const serialized=JSON.stringify(chat);
assert(!serialized.includes('0001234-56.2026.8.26.0000')&&!serialized.includes('Cliente Sigiloso')&&!serialized.includes('contestar mérito'),'rejected sensitive content never appears in Copilot');

console.log(JSON.stringify({ok:true,privacy:'aggregate_only',accepted:2,rejectedSensitivePayloads:2,rejectedWrongVertical:1,idempotency:true,authenticatedWorkspace:true,copilot:true},null,2));
