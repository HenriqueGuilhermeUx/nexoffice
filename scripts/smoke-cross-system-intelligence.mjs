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
  name:'Cross System Smoke',
  email:'cross-system-'+Date.now()+'@nexoffice.test',
  password:'SmokePass123!',
  businessName:'Cross System Co',
  vertical:'general'
}});
token=reg.token;workspace=reg.workspace.id;

const contact=await call('/v1/crm/contacts',{method:'POST',body:{
  kind:'company',
  name:'Cliente Cross',
  email:'cliente.cross@nexoffice.test',
  source:'smoke'
}});

const deals=['Deal_ID;Deal_Name;Email;Stage;Amount;Expected_Close_At','D1;Expansao Cross;cliente.cross@nexoffice.test;Proposal;20.000,00;01/10/2026'].join('\n');
await call('/v1/connect/crm/import',{method:'POST',body:{
  filename:'deals.csv',content:deals,resourceKind:'deal',sourceSystem:'CRM Smoke',datasetName:'Deals Cross',humanConfirmed:true
}});

const receivables=['Numero;Cliente;Email;Valor;Vencimento;Status','R1;Cliente Cross;cliente.cross@nexoffice.test;5.000,00;01/10/2026;Aberto'].join('\n');
await call('/v1/connect/erp/import',{method:'POST',body:{
  filename:'receber.csv',content:receivables,resourceKind:'receivable',sourceSystem:'ERP Smoke',datasetName:'Recebiveis Cross',humanConfirmed:true
}});

const eml1=['From: cliente.cross@nexoffice.test','To: comercial@nexoffice.test','Date: Sun, 25 Oct 2026 14:00:00 -0300','Message-ID: <cross-1@nexoffice.test>','Subject: Retorno proposta','','Podemos revisar a proposta?'].join('\n');
const eml2=['From: comercial@nexoffice.test','To: cliente.cross@nexoffice.test','Date: Mon, 26 Oct 2026 15:00:00 -0300','Message-ID: <cross-2@nexoffice.test>','Subject: Proximos passos','','Envio dos proximos passos.'].join('\n');
await call('/v1/connect/email/import',{method:'POST',body:{filename:'cross1.eml',content:eml1,datasetName:'Comercial Cross',humanConfirmed:true}});
await call('/v1/connect/email/import',{method:'POST',body:{filename:'cross2.eml',content:eml2,datasetName:'Comercial Cross',humanConfirmed:true}});

const cross=await call('/v1/intelligence/cross-system');
assert(cross.summary?.customers===1,'one customer must have cross-system insights');
assert(Number(cross.summary?.insights)>=2,'cross-system engine must produce at least two insights');
assert(cross.methodology?.minimumDistinctSources===2,'cross-system methodology must require two sources');
assert(cross.methodology?.causalClaims===false,'cross-system engine must not claim causality');
assert(cross.safety?.readOnly===true&&cross.safety?.externalEffects===false,'cross-system engine must remain read-only');

const paymentRisk=cross.insights.find(x=>x.code==='opportunity_vs_payment_risk'&&x.contactId===contact.id);
assert(paymentRisk,'CRM opportunity plus ERP overdue must create payment-risk correlation');
assert(paymentRisk.confidence==='high','payment-risk correlation must be high confidence');
assert(paymentRisk.sourceSystems.includes('external.crm')&&paymentRisk.sourceSystems.includes('external.erp'),'payment-risk correlation must expose CRM and ERP sources');
assert(paymentRisk.facts.some(x=>x.label==='pipelineMinor'&&Number(x.value)===2000000),'payment-risk correlation must preserve pipeline amount');
assert(paymentRisk.facts.some(x=>x.label==='overdueMinor'&&Number(x.value)===500000),'payment-risk correlation must preserve overdue amount');

const stalled=cross.insights.find(x=>x.code==='engagement_without_progress'&&x.contactId===contact.id);
assert(stalled,'recent communications plus stale opportunity must create engagement-without-progress correlation');
assert(stalled.sourceSystems.includes('external.crm')&&stalled.sourceSystems.includes('external.email'),'engagement correlation must expose CRM and email sources');
assert(stalled.facts.some(x=>x.label==='externalInteractions'&&Number(x.value)>=2),'engagement correlation must count recent interactions');

const executive=await call('/v1/assistant/executive-context');
assert(Number(executive.crossSystem?.insights)>=2,'Maya executive context must expose cross-system summary');
assert(executive.priorities.some(x=>x.code==='opportunity_vs_payment_risk'),'Maya must surface cross-system payment-risk priority');
assert(executive.priorities.some(x=>x.evidence?.some(e=>e.source==='nex.cross_system')),'Maya priority must keep cross-system evidence');
assert(executive.evidencePolicy?.correlationsAreHypotheses===true&&executive.evidencePolicy?.externalEffects===false,'Maya must keep hypothesis and no-effect policy');

console.log(JSON.stringify({
  ok:true,
  module:'Cross-System Intelligence V1',
  customer:contact.id,
  insights:cross.summary.insights,
  sources:cross.summary.sourceSystems,
  mayaPriority:true,
  causalClaims:false,
  externalEffects:false
},null,2));
