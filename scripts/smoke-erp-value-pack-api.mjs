const base=process.env.SMOKE_API_URL||'http://127.0.0.1:4000';
let token='',workspace='';
const call=async(path,{method='GET',body,auth=true,allowError=false}={})=>{
  const headers={'content-type':'application/json'};
  if(auth&&token)headers.authorization='Bearer '+token;
  if(auth&&workspace)headers['x-workspace-id']=workspace;
  const r=await fetch(base+path,{method,headers,body:body!==undefined?JSON.stringify(body):undefined});
  const payload=await r.json().catch(()=>({}));
  if(!r.ok&&!allowError)throw new Error(method+' '+path+' -> '+r.status+' '+JSON.stringify(payload));
  return {status:r.status,payload};
};
const data=async(path,opts)=> (await call(path,opts)).payload;
const assert=(v,m)=>{if(!v)throw new Error('ASSERT: '+m)};
const now=Date.now();

const reg=await data('/v1/auth/register',{method:'POST',auth:false,body:{name:'ERP Pack Smoke',email:'erp-pack-'+now+'@nexoffice.test',password:'SmokePass123!',businessName:'ERP Pack Smoke Co',vertical:'commerce'}});
token=reg.token;workspace=reg.workspace.id;assert(token&&workspace,'register returns token/workspace');

const supplier=await data('/v1/crm/contacts',{method:'POST',body:{kind:'company',name:'Fornecedor Smoke',email:'fornecedor-'+now+'@nexoffice.test',source:'smoke',tags:['fornecedor']}});
const customer=await data('/v1/crm/contacts',{method:'POST',body:{kind:'company',name:'Cliente Smoke ERP',email:'cliente-'+now+'@nexoffice.test',source:'smoke',tags:['cliente']}});
assert(supplier.id&&customer.id,'contacts created');

const product=await data('/v1/catalog/items',{method:'POST',body:{kind:'product',name:'Produto Controlado '+now,description:'Produto do smoke ERP Value Pack',sku:'ERP-'+now,unit:'unidade',priceMinor:3000,costMinor:1000,currency:'BRL',billingCycle:'one_time',trackInventory:true,reorderPoint:5}});
assert(product.id&&product.track_inventory===true,'tracked catalog product created');

let inv=await data('/v1/inventory/summary');
assert(inv.summary.trackedProducts===1,'tracked product appears in inventory');
assert(inv.summary.belowReorder===1,'zero stock is below reorder point');
assert(inv.items[0].suggested_purchase_quantity>=10,'replenishment quantity suggested');

const actionCatalog=await data('/v1/business-actions');
assert(actionCatalog.some(x=>x.id==='purchasing.plan'&&x.externalEffect===false),'internal purchase planning action exposed');
assert(actionCatalog.some(x=>x.id==='message.send'&&x.externalEffect===true&&x.humanApprovalRequired===true),'external communication action classified');

const blocked=await call('/v1/business-actions/execute',{method:'POST',allowError:true,body:{action:'message.send',payload:{}}});
assert(blocked.status===409,'generic action engine blocks external message send');

const planned=await data('/v1/business-actions/execute',{method:'POST',body:{action:'purchasing.plan',payload:{catalogItemId:product.id,quantity:10,supplierContactId:supplier.id}}});
assert(planned.externalEffect===false&&planned.result?.id,'purchase plan created without external effect');

let orders=await data('/v1/purchasing/orders');
const order=orders.find(x=>x.id===planned.result.id);
assert(order&&order.status==='draft'&&order.items?.length===1,'purchase draft contains item');
await data('/v1/purchasing/orders/'+order.id+'/mark-ordered',{method:'POST',body:{}});
await data('/v1/purchasing/orders/'+order.id+'/receive',{method:'POST',body:{items:order.items.map(i=>({itemId:i.id,quantity:Number(i.quantity)-Number(i.receivedQuantity)}))}});

inv=await data('/v1/inventory/summary');
const stock=inv.items.find(x=>x.id===product.id);
assert(Number(stock.on_hand)===10,'receiving purchase increases stock');
assert(stock.below_reorder===false,'received stock clears reorder alert');

const deal=await data('/v1/crm/deals',{method:'POST',body:{contactId:customer.id,title:'Venda ERP Pack',stage:'won',valueMinor:6000,currency:'BRL',source:'smoke'}});
const op=await data('/v1/business-operations',{method:'POST',body:{contactId:customer.id,dealId:deal.id,catalogItemId:product.id,quantity:2,dueAt:new Date(now+7*86400000).toISOString()}});
assert(op.id,'business operation created');

const looseDeal=await data('/v1/crm/deals',{method:'POST',body:{contactId:customer.id,title:'Oportunidade sem operação',stage:'qualified',valueMinor:9000,currency:'BRL',source:'smoke'}});
let commercial=await data('/v1/operations/commercial-360');
assert(commercial.flows.some(x=>x.id===op.id&&x.stages.some(s=>s.id==='payment')),'commercial 360 includes operation lineage');
assert(commercial.opportunities.some(x=>x.id===looseDeal.id),'commercial 360 surfaces deal without operation');

const account=await data('/v1/finance/accounts',{method:'POST',body:{name:'Banco Smoke '+now,kind:'bank',openingBalanceMinor:0,currency:'BRL'}});
const occurredAt=new Date().toISOString();
const ledger=await data('/v1/ledger',{method:'POST',body:{contactId:customer.id,accountId:account.id,direction:'income',category:'Venda',description:'Recebimento Cliente Smoke ERP',amountMinor:12345,currency:'BRL',status:'open',dueAt:occurredAt}});
await data('/v1/reconciliation/import',{method:'POST',body:{accountId:account.id,provider:'smoke-bank',items:[{externalRef:'smoke-'+now,provider:'smoke-bank',occurredAt,direction:'income',amountMinor:12345,currency:'BRL',description:'PIX Cliente Smoke ERP',counterparty:'Cliente Smoke ERP'}]}});
const intel=await data('/v1/reconciliation/intelligence?max=20');
const bankTx=intel.items.find(x=>x.amount_minor===12345);
assert(bankTx&&bankTx.match.strength==='strong','reconciliation identifies strong match');
assert(bankTx.match.bestCandidate?.id===ledger.id,'reconciliation suggests expected ledger');
await data('/v1/reconciliation/'+bankTx.id+'/match',{method:'POST',body:{ledgerEntryId:ledger.id}});
const ledgerList=await data('/v1/ledger');
assert(ledgerList.find(x=>x.id===ledger.id)?.status==='paid','confirmed reconciliation marks ledger paid');

console.log(JSON.stringify({ok:true,workspace,product:product.id,purchaseOrder:order.id,operation:op.id,reconciliation:bankTx.id},null,2));
