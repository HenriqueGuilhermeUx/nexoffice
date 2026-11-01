const base=process.env.SMOKE_API_URL||'http://127.0.0.1:4000';
let token='';let workspace='';
const call=async(path,{method='GET',body,auth=true}={})=>{
  const headers={'content-type':'application/json'};
  if(auth&&token)headers.authorization='Bearer '+token;
  if(auth&&workspace)headers['x-workspace-id']=workspace;
  const r=await fetch(base+path,{method,headers,body:body!==undefined?JSON.stringify(body):undefined});
  const payload=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(method+' '+path+' -> '+r.status+' '+JSON.stringify(payload));
  return payload;
};
const assert=(value,message)=>{if(!value)throw new Error('ASSERT: '+message)};
const now=Date.now();

const register=await call('/v1/auth/register',{method:'POST',auth:false,body:{name:'Relationship Smoke',email:'relationship-'+now+'@nexoffice.test',password:'SmokePass123!',businessName:'Relationship Smoke Company',vertical:'general'}});
token=register.token;workspace=register.workspace.id;assert(token&&workspace,'register must return token/workspace');

// 1) Renewal: active monthly recurrence ending inside 60 days.
const renewalContact=await call('/v1/crm/contacts',{method:'POST',body:{kind:'company',name:'Cliente Renovação',email:'renovacao@nexoffice.test',phone:'5513999991001',source:'smoke',tags:['cliente']}});
await call('/v1/recurring-rules',{method:'POST',body:{contactId:renewalContact.id,direction:'income',category:'mensalidade',description:'Plano recorrente',amountMinor:80000,currency:'BRL',frequency:'monthly',intervalCount:1,nextRunAt:new Date(now+10*86400000).toISOString(),endsAt:new Date(now+35*86400000).toISOString(),metadata:{source:'relationship-smoke'}}});
await call('/v1/events',{method:'POST',body:{
  type:'calendar.event.observed',
  source:'external.google.calendar',
  subjectType:null,
  subjectId:null,
  payload:{summary:'Revisão de renovação',organizerEmail:'equipe@nexoffice.test',attendeeEmails:['renovacao@nexoffice.test'],privacy:'calendar_readonly'}
}});
await call('/v1/events',{method:'POST',body:{
  type:'external_calendar.observed',
  source:'external.calendar',
  subjectType:null,
  subjectId:null,
  payload:{summary:'Reunião importada de renovação',organizer:['equipe@nexoffice.test'],attendees:['renovacao@nexoffice.test'],privacy:'manual_readonly'}
}});
await call('/v1/events',{method:'POST',body:{
  type:'calendar.event.observed',
  source:'external.microsoft.calendar',
  subjectType:null,
  subjectId:null,
  payload:{summary:'Microsoft reunião de renovação',organizerEmail:'equipe@nexoffice.test',attendeeEmails:['renovacao@nexoffice.test'],privacy:'calendar_read_basic'}
}});

// 2) Risk: real customer with won deal plus repeated overdue receivables.
const riskContact=await call('/v1/crm/contacts',{method:'POST',body:{kind:'company',name:'Cliente Risco',email:'risco@nexoffice.test',phone:'5513999991002',source:'smoke',tags:['cliente']}});
await call('/v1/crm/deals',{method:'POST',body:{contactId:riskContact.id,title:'Contrato ganho',stage:'won',valueMinor:180000,currency:'BRL',source:'smoke'}});
await call('/v1/ledger',{method:'POST',body:{contactId:riskContact.id,direction:'income',category:'serviço',description:'Parcela vencida 1',amountMinor:90000,status:'open',dueAt:new Date(now-20*86400000).toISOString()}});
await call('/v1/ledger',{method:'POST',body:{contactId:riskContact.id,direction:'income',category:'serviço',description:'Parcela vencida 2',amountMinor:90000,status:'overdue',dueAt:new Date(now-5*86400000).toISOString()}});
await call('/v1/events',{method:'POST',body:{
  type:'email.metadata.observed',
  source:'external.google.gmail',
  subjectType:null,
  subjectId:null,
  payload:{subject:'Negociação de pendência',from:['risco@nexoffice.test'],to:['financeiro@nexoffice.test'],cc:[],privacy:'metadata_only'}
}});
await call('/v1/events',{method:'POST',body:{
  type:'external_email.observed',
  source:'external.email',
  subjectType:null,
  subjectId:null,
  payload:{subject:'E-mail importado de pendência',from:['risco@nexoffice.test'],to:['financeiro@nexoffice.test'],cc:[],privacy:'manual_readonly'}
}});
await call('/v1/events',{method:'POST',body:{
  type:'email.metadata.observed',
  source:'external.microsoft.mail',
  subjectType:null,
  subjectId:null,
  payload:{subject:'Outlook pendência',from:['risco@nexoffice.test'],to:['financeiro@nexoffice.test'],cc:[],privacy:'mail_read_basic'}
}});

// 3) Expansion: customer has bought one offer; another active offer exists and relationship is current.
const expansionContact=await call('/v1/crm/contacts',{method:'POST',body:{kind:'company',name:'Cliente Expansão',email:'expansao@nexoffice.test',phone:'5513999991003',source:'smoke',tags:['cliente']}});
await call('/v1/crm/deals',{method:'POST',body:{contactId:expansionContact.id,title:'Cliente ativo para expansão',stage:'won',valueMinor:120000,currency:'BRL',source:'smoke'}});
const offerA=await call('/v1/catalog/items',{method:'POST',body:{kind:'service',name:'Plano Base Relationship Smoke',description:'Oferta já utilizada',unit:'mês',priceMinor:120000,costMinor:50000,currency:'BRL',billingCycle:'monthly'}});
const offerB=await call('/v1/catalog/items',{method:'POST',body:{kind:'service',name:'Plano Growth Relationship Smoke',description:'Oferta adicional',unit:'mês',priceMinor:220000,costMinor:70000,currency:'BRL',billingCycle:'monthly'}});
await call('/v1/business-operations',{method:'POST',body:{contactId:expansionContact.id,catalogItemId:offerA.id,quantity:1,dueAt:new Date(now+7*86400000).toISOString()}});

const intel=await call('/v1/crm/relationship-intelligence');
assert(intel.summary.customers>=3,'three customer relationships should be analyzed');
assert(intel.sources?.docWalletExpirationsAvailable===false,'CI without DocWallet must degrade gracefully');
assert(Number(intel.sources?.googleWorkspaceEventsObserved)>=2,'Google read-only activity must be observed as relationship context');
assert(Number(intel.sources?.manualWorkspaceContextEventsObserved)>=2,'manual EML/ICS activity must be observed as relationship context');
assert(Number(intel.sources?.microsoft365EventsObserved)>=2,'Microsoft 365 activity must be observed as relationship context');
assert(Number(intel.sources?.externalContextEventsObserved)>=6,'all external context events must remain auditable');

const renewal=intel.relationships.find(x=>x.contactId===renewalContact.id);
assert(renewal?.status==='renewal','ending recurrence must be classified as renewal');
assert(renewal.bestOptions.some(x=>x.action==='create_renewal_proposal'),'renewal proposal option must be ready');
assert(Number(renewal.externalInteractions90)>=3,'Google, Microsoft and manual calendar activity must count as recent external interaction');
assert(renewal.externalSources.includes('external.google.calendar'),'Google Calendar source must be exposed for auditability');
assert(renewal.externalSources.includes('external.calendar'),'manual ICS source must be exposed for auditability');
assert(renewal.externalSources.includes('external.microsoft.calendar'),'Microsoft Calendar source must be exposed for auditability');

const risk=intel.relationships.find(x=>x.contactId===riskContact.id);
assert(risk?.status==='risk','repeated overdue receivables must create risk');
assert(Number(risk.overdueCount)>=2,'risk relationship must expose overdue count');
assert(risk.bestOptions.some(x=>x.action==='review_finance'),'risk relationship must offer finance review');
assert(risk.bestOptions.some(x=>x.action==='create_followup_task'),'risk relationship must offer internal follow-up');
assert(Number(risk.externalInteractions90)>=3,'Google, Microsoft and manual email activity must count as recent external interaction');
assert(risk.externalSources.includes('external.google.gmail'),'Gmail source must be exposed for auditability');
assert(risk.externalSources.includes('external.email'),'manual EML source must be exposed for auditability');
assert(risk.externalSources.includes('external.microsoft.mail'),'Microsoft Outlook source must be exposed for auditability');

const expansion=intel.relationships.find(x=>x.contactId===expansionContact.id);
assert(expansion?.status==='expansion','healthy customer with unused catalog offer must expose expansion');
assert(expansion.expansionCandidate?.id===offerB.id,'expansion candidate must exclude already purchased offer');
assert(expansion.bestOptions.some(x=>x.action==='create_expansion_proposal'&&x.catalogItemId===offerB.id),'expansion proposal must carry candidate offer');

const executive=await call('/v1/assistant/executive-context');
assert(Number(executive.indicators?.relationshipAtRisk)>=1,'Executive Context must reuse relationship risk classification');
assert(Number(executive.indicators?.relationshipRenewalSoon)>=1,'Executive Context must reuse renewal classification');
const riskPriority=executive.priorities.find(x=>x.code==='relationship_at_risk');
const renewalPriority=executive.priorities.find(x=>x.code==='relationship_renewal_soon');
assert(riskPriority,'Maya Executive Context must surface relationship risk');
assert(renewalPriority,'Maya Executive Context must surface renewal preparation');
assert(riskPriority.evidence?.some(x=>x.source==='nex.relationship_intelligence'),'relationship risk priority must carry shared intelligence evidence');
assert(renewalPriority.evidence?.some(x=>x.source==='nex.relationship_intelligence'),'renewal priority must carry shared intelligence evidence');
assert(executive.evidencePolicy?.externalEffects===false,'Maya relationship priorities must remain read-only');

const task=await call('/v1/tasks',{method:'POST',body:{contactId:riskContact.id,title:'Recuperar relacionamento · Cliente Risco',description:risk.reasons.join(' · '),priority:'high',dueAt:new Date(now+86400000).toISOString(),metadata:{source:'relationship_intelligence_v1',relationshipStatus:risk.status}}});
assert(task.id,'explicit internal follow-up task must be creatable');
const tasks=await call('/v1/tasks');
assert(tasks.some(x=>x.id===task.id&&x.contact_id===riskContact.id),'follow-up task must retain client linkage');

console.log(JSON.stringify({ok:true,workspace,summary:intel.summary,renewal:{status:renewal.status,external:renewal.externalSources},risk:{status:risk.status,external:risk.externalSources},expansion:expansion.status,executive:{atRisk:executive.indicators.relationshipAtRisk,renewalSoon:executive.indicators.relationshipRenewalSoon,priorities:executive.priorities.map(x=>x.code)},task:task.id},null,2));
