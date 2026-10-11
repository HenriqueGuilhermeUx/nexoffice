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

const reg=await data('/v1/auth/register',{method:'POST',auth:false,body:{name:'Playbook Smoke',email:'playbook-'+now+'@nexoffice.test',password:'SmokePass123!',businessName:'Playbook Smoke Co',vertical:'commerce'}});
token=reg.token;workspace=reg.workspace.id;assert(token&&workspace,'register returns token/workspace');

const supplier=await data('/v1/crm/contacts',{method:'POST',body:{kind:'company',name:'Fornecedor Playbook',email:'supplier-'+now+'@nexoffice.test',source:'smoke',tags:['fornecedor']}});
const customer=await data('/v1/crm/contacts',{method:'POST',body:{kind:'company',name:'Cliente Playbook',email:'customer-'+now+'@nexoffice.test',source:'smoke',tags:['cliente']}});
assert(supplier.id&&customer.id,'contacts created');

const product=await data('/v1/catalog/items',{method:'POST',body:{kind:'product',name:'Produto Playbook '+now,description:'Produto do smoke de playbooks',sku:'PB-'+now,unit:'unidade',priceMinor:4500,costMinor:1500,currency:'BRL',billingCycle:'one_time',trackInventory:true,reorderPoint:5}});
assert(product.id&&product.track_inventory===true,'tracked product created');

let intel=await data('/v1/playbooks/intelligence');
const stockRec=intel.recommendations.find(x=>x.templateKey==='stock_replenishment'&&x.context.catalogItemId===product.id);
assert(stockRec,'low-stock playbook is recommended');

const started=await data('/v1/playbooks/start',{method:'POST',body:{templateKey:'stock_replenishment',context:stockRec.context}});
assert(started.reused===false&&started.run?.id,'stock playbook starts');
const runId=started.run.id;
let run=await data('/v1/playbooks/runs/'+runId);
assert(run.currentStep?.action_id==='purchasing.plan'&&run.currentStep?.status==='ready','first step is safe purchase planning');

const first=await data('/v1/playbooks/runs/'+runId+'/steps/'+run.currentStep.id+'/execute',{method:'POST',body:{}});
const orderId=first.result?.result?.id;
assert(first.executed===true&&orderId,'safe first step creates internal purchase plan');

run=await data('/v1/playbooks/runs/'+runId);
assert(run.currentStep?.action_id==='purchasing.send_to_supplier','external supplier step follows purchase plan');

const genericBlocked=await call('/v1/business-actions/execute',{method:'POST',allowError:true,body:{action:'purchasing.send_to_supplier',payload:{purchaseOrderId:orderId}}});
assert(genericBlocked.status===409,'generic engine blocks external supplier action');

const gate=await data('/v1/playbooks/runs/'+runId+'/steps/'+run.currentStep.id+'/execute',{method:'POST',body:{}});
assert(gate.humanGate===true&&gate.externalEffect===true,'playbook stops at external supplier gate');

run=await data('/v1/playbooks/runs/'+runId);
assert(run.status==='waiting_human'&&run.currentStep?.status==='waiting_human','run waits for human at supplier step');

await data('/v1/playbooks/runs/'+runId+'/steps/'+run.currentStep.id+'/complete',{method:'POST',body:{outcome:'completed',note:'Pedido tratado manualmente no smoke'}});
run=await data('/v1/playbooks/runs/'+runId);
assert(run.currentStep?.action_id==='purchasing.receive','receiving step unlocked');

const receiveGate=await data('/v1/playbooks/runs/'+runId+'/steps/'+run.currentStep.id+'/execute',{method:'POST',body:{}});
assert(receiveGate.humanGate===true&&receiveGate.externalEffect===false,'physical receiving requires human confirmation');

run=await data('/v1/playbooks/runs/'+runId);
const earlyComplete=await call('/v1/playbooks/runs/'+runId+'/steps/'+run.currentStep.id+'/complete',{method:'POST',allowError:true,body:{outcome:'completed'}});
assert(earlyComplete.status===409&&earlyComplete.payload?.error==='playbook_evidence_not_met','cannot fake received stock');

let orders=await data('/v1/purchasing/orders');
const order=orders.find(x=>x.id===orderId);
assert(order&&order.items?.length===1,'purchase order from playbook is visible');
await data('/v1/purchasing/orders/'+order.id+'/mark-ordered',{method:'POST',body:{}});
await data('/v1/purchasing/orders/'+order.id+'/receive',{method:'POST',body:{items:order.items.map(i=>({itemId:i.id,quantity:Number(i.quantity)-Number(i.receivedQuantity)}))}});
await data('/v1/playbooks/runs/'+runId+'/steps/'+run.currentStep.id+'/complete',{method:'POST',body:{outcome:'completed'}});

run=await data('/v1/playbooks/runs/'+runId);
assert(run.status==='completed'&&run.progress===100,'stock playbook completes only after real receiving evidence');

const account=await data('/v1/finance/accounts',{method:'POST',body:{name:'Conta Playbook '+now,kind:'bank',openingBalanceMinor:0,currency:'BRL'}});
await data('/v1/ledger',{method:'POST',body:{contactId:customer.id,accountId:account.id,direction:'income',category:'Serviço',description:'Recebível vencido Playbook',amountMinor:9000,currency:'BRL',status:'open',dueAt:new Date(now-3*86400000).toISOString()}});
intel=await data('/v1/playbooks/intelligence');
const recoveryRec=intel.recommendations.find(x=>x.templateKey==='relationship_recovery'&&x.context.contactId===customer.id);
assert(recoveryRec,'overdue relationship recommends recovery playbook');

const recovery=await data('/v1/playbooks/start',{method:'POST',body:{templateKey:'relationship_recovery',context:recoveryRec.context}});
assert(recovery.run?.currentStep?.action_id==='task.followup.create','recovery starts with internal follow-up');
const taskStep=recovery.run.currentStep;
const taskExec=await data('/v1/playbooks/runs/'+recovery.run.id+'/steps/'+taskStep.id+'/execute',{method:'POST',body:{}});
assert(taskExec.executed===true&&taskExec.result?.result?.id,'safe recovery step creates real task');

const recoveryRun=await data('/v1/playbooks/runs/'+recovery.run.id);
assert(recoveryRun.currentStep?.action_id==='relationship.review','relationship review becomes next step');
const handoff=await data('/v1/playbooks/runs/'+recovery.run.id+'/steps/'+recoveryRun.currentStep.id+'/execute',{method:'POST',body:{}});
assert(handoff.handoff===true&&handoff.externalEffect===false,'relationship review is a safe contextual handoff');

console.log(JSON.stringify({ok:true,workspace,stockPlaybook:runId,recoveryPlaybook:recovery.run.id,purchaseOrder:orderId},null,2));
