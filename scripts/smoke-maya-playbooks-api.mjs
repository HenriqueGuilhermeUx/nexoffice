const base=process.env.SMOKE_API_URL||'http://127.0.0.1:4000';
let token='',workspace='';
const call=async(path,{method='GET',body,auth=true,allowError=false}={})=>{
  const headers={'content-type':'application/json'};
  if(auth&&token)headers.authorization='Bearer '+token;
  if(auth&&workspace)headers['x-workspace-id']=workspace;
  const r=await fetch(base+path,{method,headers,body:body!==undefined?JSON.stringify(body):undefined});
  const payload=await r.json().catch(()=>({}));
  if(!r.ok&&!allowError)throw new Error(method+' '+path+' -> '+r.status+' '+JSON.stringify(payload));
  return{status:r.status,payload};
};
const data=async(path,opts)=> (await call(path,opts)).payload;
const assert=(v,m)=>{if(!v)throw new Error('ASSERT: '+m)};
const now=Date.now();

const reg=await data('/v1/auth/register',{method:'POST',auth:false,body:{name:'Maya Smoke',email:'maya-'+now+'@nexoffice.test',password:'SmokePass123!',businessName:'Maya Smoke Co',vertical:'commerce'}});
token=reg.token;workspace=reg.workspace.id;assert(token&&workspace,'register returns token/workspace');

const customer=await data('/v1/crm/contacts',{method:'POST',body:{kind:'company',name:'Cliente Maya',email:'customer-maya-'+now+'@nexoffice.test',source:'smoke',tags:['cliente']}});
assert(customer.id,'customer created');

const product=await data('/v1/catalog/items',{method:'POST',body:{kind:'product',name:'Produto Maya '+now,description:'Produto do smoke Maya',sku:'MAYA-'+now,unit:'unidade',priceMinor:5000,costMinor:1700,currency:'BRL',billingCycle:'one_time',trackInventory:true,reorderPoint:4}});
assert(product.id&&product.track_inventory===true,'low-stock product created');

const preview=await data('/v1/playbooks/maya',{method:'POST',body:{message:'Maya, cuida do que precisa ser reposto',maxRuns:3,mode:'preview'}});
assert(preview.understood===true&&preview.mode==='preview','preview understood');
assert(preview.candidates?.some(x=>x.templateKey==='stock_replenishment'&&x.context.catalogItemId===product.id),'preview sees stock candidate');
let runs=await data('/v1/playbooks/intelligence');
assert(!(runs.activeRuns||[]).some(x=>x.catalog_item_id===product.id),'preview does not create run');

const stock=await data('/v1/playbooks/maya',{method:'POST',body:{message:'Maya, cuida do que precisa ser reposto',maxRuns:3,mode:'execute_safe'}});
assert(stock.understood===true&&stock.agent==='Maya','Maya execution understood');
assert(stock.summary?.selected>=1,'stock candidate selected');
assert(stock.summary?.safeStepsExecuted>=1,'safe purchase planning executed');
const stockAttention=(stock.humanAttention||[]).find(x=>x.actionId==='purchasing.send_to_supplier');
assert(stockAttention&&stockAttention.kind==='external_approval','Maya stops before supplier communication');
assert(stock.safety?.supplierCommunicationAutomatic===false,'supplier communication stays manual');

const orders=await data('/v1/purchasing/orders');
assert(orders.some(x=>x.metadata?.source==='business_action_engine'&&x.metadata?.externalOrderSent===false),'Maya safe step created internal purchase plan only');

const stockAgain=await data('/v1/playbooks/maya',{method:'POST',body:{message:'Maya, cuida do que precisa ser reposto',maxRuns:3,mode:'execute_safe'}});
assert(stockAgain.summary?.reusedRuns>=1,'same request reuses active stock run');
assert(stockAgain.summary?.safeStepsExecuted===0,'reused run does not duplicate safe purchase plan');
const ordersAgain=await data('/v1/purchasing/orders');
assert(ordersAgain.length===orders.length,'repeated Maya command does not duplicate purchase order');

const account=await data('/v1/finance/accounts',{method:'POST',body:{name:'Conta Maya '+now,kind:'bank',openingBalanceMinor:0,currency:'BRL'}});
await data('/v1/ledger',{method:'POST',body:{contactId:customer.id,accountId:account.id,direction:'income',category:'Serviço',description:'Recebível Maya vencido',amountMinor:12000,currency:'BRL',status:'open',dueAt:new Date(now-4*86400000).toISOString()}});

const risk=await data('/v1/playbooks/maya',{method:'POST',body:{message:'Maya, cuida dos clientes em risco',maxRuns:3,mode:'execute_safe'}});
assert(risk.summary?.selected>=1,'risk candidate selected');
assert(risk.summary?.safeStepsExecuted>=1,'Maya creates safe internal follow-up');
const riskAttention=(risk.humanAttention||[]).find(x=>x.actionId==='relationship.review'&&x.subject==='Cliente Maya');
assert(riskAttention&&riskAttention.kind==='context_handoff','Maya stops at relationship context handoff');

const tasks=await data('/v1/tasks');
assert(tasks.some(x=>x.contact_id===customer.id&&x.metadata?.source==='business_action_engine'),'Maya recovery creates real internal task');

const riskAgain=await data('/v1/playbooks/maya',{method:'POST',body:{message:'Maya, cuida dos clientes em risco',maxRuns:3,mode:'execute_safe'}});
assert(riskAgain.summary?.reusedRuns>=1,'risk command reuses active run');
const tasksAgain=await data('/v1/tasks');
assert(tasksAgain.filter(x=>x.contact_id===customer.id&&x.metadata?.source==='business_action_engine').length===1,'risk rerun does not duplicate follow-up task');

const unknown=await data('/v1/playbooks/maya',{method:'POST',body:{message:'Maya, me conte uma curiosidade',maxRuns:3,mode:'execute_safe'}});
assert(unknown.understood===false&&Array.isArray(unknown.suggestedPrompts),'unknown operational intent does not execute');

console.log(JSON.stringify({ok:true,workspace,stockSummary:stock.summary,riskSummary:risk.summary,stockAttention:stockAttention.actionId,riskAttention:riskAttention.actionId},null,2));
