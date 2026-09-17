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

const account=await call('/v1/finance/accounts',{method:'POST',body:{name:'Conta Radar',kind:'bank',openingBalanceMinor:100000,currency:'BRL'}});
await call('/v1/ledger',{method:'POST',body:{accountId:account.id,direction:'expense',category:'fornecedores',description:'Pagamento que pressiona caixa',amountMinor:350000,currency:'BRL',status:'open',dueAt:new Date(Date.now()+7*86400000).toISOString()}});
await call('/v1/finance/intelligence/refresh',{method:'POST',body:{}});

const overview=await call('/v1/command/overview');
assert(Array.isArray(overview.areas),'overview returns areas');
assert(overview.areas.length===8,'base overview exposes approvals plus seven operational domains');
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

const intelligence=await call('/v1/command/intelligence');
assert(intelligence.finance?.id==='finance','command intelligence exposes finance area');
assert(intelligence.finance.attention>=1,'finance area surfaces projected cash risk');
assert(Number(intelligence.finance.metrics.projectedCash30Minor)<0,'finance card receives negative 30-day cash projection');
assert(Array.isArray(intelligence.finance.actions)&&intelligence.finance.actions.length>=1,'finance card exposes top recommendation');
assert(intelligence.marketing&&typeof intelligence.marketing.detail==='string','marketing intelligence has a safe no-data state');

console.log(JSON.stringify({ok:true,pendingApprovals:overview.pendingApprovals,areas:overview.areas.map(area=>({id:area.id,attention:area.attention})),finance:{attention:intelligence.finance.attention,projectedCash30Minor:intelligence.finance.metrics.projectedCash30Minor,topRecommendation:intelligence.finance.actions?.[0]?.title||null},marketing:{attention:intelligence.marketing.attention,detail:intelligence.marketing.detail}},null,2));
