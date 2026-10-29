const base=process.env.SMOKE_API_URL||'http://127.0.0.1:4000';
let token='',workspace='';

async function call(path,{method='GET',body,expected=200,auth=true}={}){
  const headers={accept:'application/json','content-type':'application/json'};
  if(auth&&token)headers.authorization=`Bearer ${token}`;
  if(auth&&workspace)headers['x-workspace-id']=workspace;
  const response=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const payload=await response.json().catch(()=>({}));
  if(response.status!==expected)throw new Error(`${method} ${path} -> ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}
const assert=(value,message)=>{if(!value)throw new Error(`ASSERT: ${message}`)};

const registered=await call('/v1/auth/register',{method:'POST',auth:false,body:{
  name:'Workspace Context Smoke',
  email:'workspace-context@nexoffice.test',
  password:'SmokePass123!',
  businessName:'Context Company',
  vertical:'general'
}});
token=registered.token;workspace=registered.workspace.id;

const contact=await call('/v1/crm/contacts',{method:'POST',body:{
  kind:'company',
  name:'Cliente Contexto',
  email:'cliente-contexto@nexoffice.test',
  source:'smoke'
}});

await call('/v1/onboarding/business/confirm',{method:'PUT',body:{
  sector:'services',
  revenueModel:'mixed',
  sellsServices:true,
  usesAgenda:true,
  mainDependency:'sales',
  metadata:{
    commercial:{primaryGoal:'sell'},
    operations:{biggestBottleneck:'sales'},
    systems:{currentTools:['email','calendar'],namedTools:[]},
    onboarding:{version:'business-v2',primaryGoal:'sell'}
  },
  complete:true
}});

const eml=[
  'From: cliente-contexto@nexoffice.test',
  'To: time@nexoffice.test',
  'Date: Tue, 20 Oct 2026 14:00:00 -0300',
  'Message-ID: <context-001@nexoffice.test>',
  'Subject: Revisao da proposta',
  'Content-Type: text/plain; charset=UTF-8',
  '',
  'Podemos revisar a proposta e os proximos passos?'
].join('\n');

const emailPreview=await call('/v1/connect/email/preview',{method:'POST',body:{filename:'contexto.eml',content:eml}});
assert(emailPreview.safety?.persisted===false,'email preview must persist nothing');
assert(emailPreview.safety?.attachmentsStored===false,'email preview must store no attachments');
assert(emailPreview.message?.subject==='Revisao da proposta','email preview must extract subject');

const emailImport=await call('/v1/connect/email/import',{method:'POST',body:{
  filename:'contexto.eml',
  content:eml,
  datasetName:'Caixa comercial',
  humanConfirmed:true
}});
assert(emailImport.imported===1,'email import must add one observation');
assert(emailImport.safety?.externalEffects===false,'email import must have no external effect');

const ics=[
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'UID:context-meeting-001@nexoffice.test',
  'DTSTART:20261021T150000Z',
  'DTEND:20261021T160000Z',
  'SUMMARY:Reuniao com Cliente Contexto',
  'ORGANIZER:mailto:time@nexoffice.test',
  'ATTENDEE:mailto:cliente-contexto@nexoffice.test',
  'LOCATION:Online',
  'DESCRIPTION:Revisao de proposta.',
  'END:VEVENT',
  'END:VCALENDAR'
].join('\r\n');

const calendarPreview=await call('/v1/connect/calendar/preview',{method:'POST',body:{filename:'agenda.ics',content:ics}});
assert(calendarPreview.count===1,'calendar preview must find one event');
assert(calendarPreview.safety?.persisted===false,'calendar preview must persist nothing');

const calendarImport=await call('/v1/connect/calendar/import',{method:'POST',body:{
  filename:'agenda.ics',
  content:ics,
  datasetName:'Agenda comercial',
  humanConfirmed:true
}});
assert(calendarImport.imported===1,'calendar import must add one observation');
assert(calendarImport.safety?.externalEffects===false,'calendar import must have no external effect');

const sources=await call('/v1/business-graph/sources');
assert(sources.external.some(item=>item.source==='external.email'&&item.records===1),'source registry must expose email');
assert(sources.external.some(item=>item.source==='external.calendar'&&item.records===1),'source registry must expose calendar');

const graph=await call('/v1/business-graph/overview?days=90&includeGraph=true');
assert(graph.graph.nodes.some(node=>node.kind==='email_message'&&node.source==='external.email'),'email must be first-class graph node');
assert(graph.graph.nodes.some(node=>node.kind==='calendar_event'&&node.source==='external.calendar'),'calendar must be first-class graph node');
assert(graph.graph.edges.some(edge=>edge.kind==='communicated_with'&&edge.source==='external.email'),'email must link to CRM contact');
assert(graph.graph.edges.some(edge=>edge.kind==='attended'&&edge.source==='external.calendar'),'calendar must link to CRM contact');

const diagnosis=await call('/v1/onboarding/business/diagnosis');
assert(diagnosis.connections.connected.some(item=>item.key==='email'),'email must become connected in discovery');
assert(diagnosis.connections.connected.some(item=>item.key==='calendar'),'calendar must become connected in discovery');

console.log(JSON.stringify({
  ok:true,
  module:'Workspace Context V1',
  contact:contact.id,
  emailImported:emailImport.imported,
  calendarImported:calendarImport.imported,
  emailNode:true,
  calendarNode:true,
  crmRelations:true,
  externalEffects:false
},null,2));
