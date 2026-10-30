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
  name:'Customer 360 Smoke',
  email:'customer360-'+Date.now()+'@nexoffice.test',
  password:'SmokePass123!',
  businessName:'Customer 360 Co',
  vertical:'general'
}});
token=reg.token;workspace=reg.workspace.id;

const contact=await call('/v1/crm/contacts',{method:'POST',body:{
  kind:'company',name:'Cliente 360',email:'cliente.360@nexoffice.test',source:'smoke'
}});
await call('/v1/crm/deals',{method:'POST',body:{
  contactId:contact.id,title:'Venda anterior',stage:'won',valueMinor:100000,currency:'BRL',source:'smoke'
}});
await call('/v1/appointments',{method:'POST',body:{
  contactId:contact.id,title:'Reunião nativa',startsAt:'2026-10-28T15:00:00.000Z',endsAt:'2026-10-28T15:30:00.000Z',status:'completed'
}});

const deals=['Deal_ID;Deal_Name;Email;Stage;Amount;Expected_Close_At','D1;Expansao 360;cliente.360@nexoffice.test;Proposal;20.000,00;01/10/2026'].join('\n');
await call('/v1/connect/crm/import',{method:'POST',body:{
  filename:'deals.csv',content:deals,resourceKind:'deal',sourceSystem:'CRM 360',datasetName:'Deals 360',humanConfirmed:true
}});
const acts=['Activity_ID;Subject;Email;Type;Date','A1;Call externo;cliente.360@nexoffice.test;Call;27/10/2026'].join('\n');
await call('/v1/connect/crm/import',{method:'POST',body:{
  filename:'activities.csv',content:acts,resourceKind:'activity',sourceSystem:'CRM 360',datasetName:'Activities 360',humanConfirmed:true
}});

const receivables=['Numero;Cliente;Email;Valor;Vencimento;Status','R1;Cliente 360;cliente.360@nexoffice.test;5.000,00;01/10/2026;Aberto'].join('\n');
await call('/v1/connect/erp/import',{method:'POST',body:{
  filename:'receber.csv',content:receivables,resourceKind:'receivable',sourceSystem:'ERP 360',datasetName:'Recebiveis 360',humanConfirmed:true
}});

const eml1=['From: cliente.360@nexoffice.test','To: comercial@nexoffice.test','Date: Sun, 25 Oct 2026 14:00:00 -0300','Message-ID: <360-1@nexoffice.test>','Subject: Retorno proposta 360','','Podemos revisar a proposta?'].join('\n');
const eml2=['From: comercial@nexoffice.test','To: cliente.360@nexoffice.test','Date: Mon, 26 Oct 2026 15:00:00 -0300','Message-ID: <360-2@nexoffice.test>','Subject: Proximos passos 360','','Envio dos proximos passos.'].join('\n');
await call('/v1/connect/email/import',{method:'POST',body:{filename:'360-1.eml',content:eml1,datasetName:'Emails 360',humanConfirmed:true}});
await call('/v1/connect/email/import',{method:'POST',body:{filename:'360-2.eml',content:eml2,datasetName:'Emails 360',humanConfirmed:true}});

const view=await call('/v1/crm/contacts/'+contact.id+'/360');
assert(view.contact?.id===contact.id&&view.contact?.name==='Cliente 360','Customer 360 must preserve contact identity');
assert(view.currentState?.openDeals===1,'external open deal must count in current state');
assert(Number(view.currentState?.openPipelineMinor)===2000000,'external pipeline value must count in current state');
assert(view.currentState?.overdueReceivables===1,'external ERP overdue must count in current state');
assert(Number(view.currentState?.overdueMinor)===500000,'external overdue value must count in current state');
assert(Number(view.currentState?.externalInteractions90)>=3,'external CRM and email interactions must enrich current state');

const sources=new Set(view.timeline.map(x=>x.source));
for(const source of ['nexoffice.crm','nexoffice.agenda','external.crm','external.erp','external.email'])assert(sources.has(source),'timeline must include '+source);
assert(view.memory?.sourceSystems.length>=5,'memory must expose multi-source coverage');
assert(view.memory?.factsOnly===true&&view.memory?.decisionsIncluded===false,'V1 memory must distinguish facts from future decision memory');

assert(view.crossSystemInsights.some(x=>x.code==='opportunity_vs_payment_risk'),'Customer 360 must include cross-system payment-risk insight');
assert(view.crossSystemInsights.some(x=>x.code==='engagement_without_progress'),'Customer 360 must include engagement-without-progress insight');
assert(view.maya?.headline&&view.maya?.recommendedNextStep,'Maya must summarize current state and next step');
assert(view.safety?.readOnly===true&&view.safety?.externalEffects===false&&view.safety?.causalClaims===false,'Customer 360 must remain read-only and non-causal');

console.log(JSON.stringify({
  ok:true,
  module:'Business Memory Customer 360 V1',
  contact:contact.id,
  timeline:view.timeline.length,
  sources:view.memory.sourceSystems,
  insights:view.crossSystemInsights.length,
  openPipelineMinor:view.currentState.openPipelineMinor,
  overdueMinor:view.currentState.overdueMinor,
  externalEffects:false
},null,2));
