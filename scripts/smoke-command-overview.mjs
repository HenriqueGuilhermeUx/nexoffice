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

const registered=await call('/v1/auth/register',{method:'POST',body:{name:'Command Overview Smoke',email:'command-overview@nexoffice.test',password:'SmokePass123!',businessName:'Command Overview Company',vertical:'general'}});
token=registered.token;workspace=registered.workspace.id;

const events=[
  ['collection.reminder.send',{summary:'Mensagem de cobrança preparada.'}],
  ['payment.charge.create',{summary:'Cobrança Pix preparada.',amountMinor:12500}],
  ['document.signature_request',{summary:'Documento aguardando assinatura.'}],
  ['invoice.issue',{summary:'NFS-e preparada para aprovação.'}],
  ['campaign.opportunity',{summary:'Oportunidade de growth identificada.'}],
  ['appointment.cancelled',{summary:'Agenda precisa de revisão.'}],
  ['lead.created',{summary:'Lead novo precisa de acompanhamento.',name:'Lead Smoke'}]
];
for(const [type,payload] of events)await call('/v1/events',{method:'POST',body:{type,source:'smoke.command-overview',payload}});

const overview=await call('/v1/command/overview');
assert(Array.isArray(overview.areas),'overview returns areas');
assert(overview.areas.length===8,'overview exposes approvals plus seven operational domains');
const byId=Object.fromEntries(overview.areas.map(area=>[area.id,area]));
for(const id of ['approvals','messages','pix','documents','fiscal','growth','agenda','crm'])assert(byId[id],`${id} area exists`);
for(const id of ['messages','pix','documents','fiscal','growth','agenda','crm']){
  assert(byId[id].attention>=1,`${id} reflects seeded action`);
  assert(Array.isArray(byId[id].actions)&&byId[id].actions.length>=1,`${id} exposes actionable snapshot`);
}
assert(overview.pendingApprovals>=1,'approval-first actions surface pending approvals');
assert(byId.approvals.attention===overview.pendingApprovals,'approval card matches overview total');
assert(byId.pix.actions.some(action=>action.actionType==='payment.charge.create'),'Pix area classifies payment charge action');
assert(byId.documents.actions.some(action=>action.actionType==='document.signature_request'),'Documents area classifies document action');
assert(byId.fiscal.actions.some(action=>action.actionType==='invoice.issue'),'Fiscal area classifies invoice action');
assert(byId.growth.actions.some(action=>action.actionType==='campaign.opportunity'),'Growth area classifies campaign action');
assert(byId.agenda.actions.some(action=>action.actionType==='appointment.cancelled'),'Agenda area classifies appointment action');
assert(byId.crm.actions.some(action=>action.actionType==='lead.created'),'CRM area classifies lead action');

console.log(JSON.stringify({ok:true,pendingApprovals:overview.pendingApprovals,areas:overview.areas.map(area=>({id:area.id,attention:area.attention}))},null,2));
