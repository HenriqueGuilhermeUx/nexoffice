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

const reg=await data('/v1/auth/register',{method:'POST',auth:false,body:{name:'Multi Agent Smoke',email:'multi-agent-'+now+'@nexoffice.test',password:'SmokePass123!',businessName:'Multi Agent Co',vertical:'commerce'}});
token=reg.token;workspace=reg.workspace.id;assert(token&&workspace,'register returns token/workspace');

const customer=await data('/v1/crm/contacts',{method:'POST',body:{kind:'company',name:'Cliente Multi Agent',email:'multi-customer-'+now+'@nexoffice.test',source:'smoke',tags:['cliente']}});
const supplier=await data('/v1/crm/contacts',{method:'POST',body:{kind:'company',name:'Fornecedor Multi Agent',email:'multi-supplier-'+now+'@nexoffice.test',source:'smoke',tags:['fornecedor']}});
assert(customer.id&&supplier.id,'contacts created');

const product=await data('/v1/catalog/items',{method:'POST',body:{kind:'product',name:'Produto Multi Agent '+now,description:'Produto multiagente',sku:'MAG-'+now,unit:'unidade',priceMinor:6500,costMinor:2200,currency:'BRL',billingCycle:'one_time',trackInventory:true,reorderPoint:5,preferredSupplierId:supplier.id}});
assert(product.id,'tracked product created');

const stock=await data('/v1/playbooks/maya',{method:'POST',body:{message:'Maya, cuida do que precisa ser reposto',maxRuns:2,mode:'execute_safe'}});
assert(stock.agent==='Maya','Maya remains orchestrator');
assert(stock.orchestrator?.name==='Maya','orchestrator identity returned');
assert((stock.team||[]).some(a=>a.name==='Nico'&&a.role==='erp'),'Nico participates in stock playbook');
const stockResult=(stock.results||[]).find(r=>r.candidate?.context?.catalogItemId===product.id);
assert(stockResult,'stock run returned');
assert(stockResult.safeStepsExecuted?.[0]?.agent?.name==='Nico','Nico executes safe purchasing plan');
assert(stockResult.humanAttention?.agent?.name==='Nico','Nico owns supplier handoff');
assert(stockResult.humanAttention?.actionId==='purchasing.send_to_supplier','supplier action remains human gate');

const stockRun=await data('/v1/playbooks/runs/'+stockResult.run.id);
assert(stockRun.orchestrator?.name==='Maya','run stores Maya orchestration');
assert((stockRun.team||[]).some(a=>a.name==='Nico'),'run exposes Nico team ownership');
const planned=stockRun.steps.find(s=>s.action_id==='purchasing.plan');
const supplierStep=stockRun.steps.find(s=>s.action_id==='purchasing.send_to_supplier');
assert(planned?.assignedAgent?.name==='Nico','safe stock step assigned to Nico');
assert(planned?.result?.delegatedAgent?.name==='Nico','completed result records Nico delegation');
assert(supplierStep?.assignedAgent?.name==='Nico','external supplier step remains owned by Nico');

const account=await data('/v1/finance/accounts',{method:'POST',body:{name:'Conta Multi Agent '+now,kind:'bank',openingBalanceMinor:0,currency:'BRL'}});
await data('/v1/ledger',{method:'POST',body:{contactId:customer.id,accountId:account.id,direction:'income',category:'Serviço',description:'Recebível multiagente vencido',amountMinor:17000,currency:'BRL',status:'open',dueAt:new Date(now-5*86400000).toISOString()}});

const risk=await data('/v1/playbooks/maya',{method:'POST',body:{message:'Maya, cuida dos clientes em risco',maxRuns:2,mode:'execute_safe'}});
const riskResult=(risk.results||[]).find(r=>r.candidate?.context?.contactId===customer.id);
assert(riskResult,'risk run returned');
assert(riskResult.safeStepsExecuted?.[0]?.agent?.name==='Sofia','Sofia executes internal follow-up');
assert(riskResult.humanAttention?.agent?.name==='Clara','Clara owns relationship review handoff');
assert((riskResult.team||[]).some(a=>a.name==='Dora'&&a.role==='documents'),'Dora is part of recovery team for proposal preparation');

const riskRun=await data('/v1/playbooks/runs/'+riskResult.run.id);
const followup=riskRun.steps.find(s=>s.action_id==='task.followup.create');
const relationship=riskRun.steps.find(s=>s.action_id==='relationship.review');
const proposal=riskRun.steps.find(s=>s.action_id==='materials.proposal.prepare');
assert(followup?.assignedAgent?.name==='Sofia'&&followup?.result?.delegatedAgent?.name==='Sofia','follow-up persists Sofia ownership and execution');
assert(relationship?.assignedAgent?.name==='Clara','relationship step assigned to Clara');
assert(proposal?.assignedAgent?.name==='Dora','proposal step assigned to Dora');

const intel=await data('/v1/playbooks/intelligence');
const activeRisk=(intel.activeRuns||[]).find(r=>r.id===riskRun.id);
assert(activeRisk?.currentStep?.assignedAgent?.name==='Clara','Command Center intelligence exposes current specialist');
assert((activeRisk?.team||[]).some(a=>a.name==='Sofia')&&(activeRisk?.team||[]).some(a=>a.name==='Clara')&&(activeRisk?.team||[]).some(a=>a.name==='Dora'),'active run exposes complete specialist team');

console.log(JSON.stringify({ok:true,workspace,stock:{run:stockRun.id,agent:'Nico'},risk:{run:riskRun.id,executedBy:'Sofia',next:'Clara',later:'Dora'}},null,2));
