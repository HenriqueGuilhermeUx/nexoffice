const base=process.env.SMOKE_API_URL||'http://127.0.0.1:4000';
const internalKey=process.env.NEXOFFICE_INTERNAL_KEY||'platform-smoke-key';
let token='',workspace='';

async function userCall(path,{method='GET',body,expected=200}={}){
  const headers={accept:'application/json','content-type':'application/json'};
  if(token)headers.authorization=`Bearer ${token}`;
  if(workspace)headers['x-workspace-id']=workspace;
  const response=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const payload=await response.json().catch(()=>({}));
  if(response.status!==expected)throw new Error(`${method} ${path} -> ${response.status}, expected ${expected}: ${JSON.stringify(payload)}`);
  return payload;
}
async function internalCall(path,{method='GET',body,expected=200}={}){
  const headers={accept:'application/json','x-nexoffice-key':internalKey};
  if(body!==undefined)headers['content-type']='application/json';
  const response=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const payload=await response.json().catch(()=>({}));
  if(response.status!==expected)throw new Error(`${method} ${path} -> ${response.status}, expected ${expected}: ${JSON.stringify(payload)}`);
  return payload;
}
const assert=(value,message)=>{if(!value)throw new Error(`ASSERT: ${message}`)};

const register=await userCall('/v1/auth/register',{method:'POST',body:{name:'Commerce Smoke',email:'commerce-smoke@nexoffice.test',password:'SmokePass123!',businessName:'Loja Smoke',vertical:'commerce'}});
token=register.token;workspace=register.workspace.id;assert(token&&workspace,'commerce workspace registered');

const connection=await userCall('/v1/integrations/commerce/shopify',{method:'PUT',body:{externalAccountRef:'shop-smoke-001'}});
assert(connection.provider==='shopify'&&connection.external_account_ref==='shop-smoke-001','shopify workspace mapping configured');
assert(connection.config?.privacy==='aggregate_only','commerce mapping declares aggregate privacy');

const now=new Date(),periodEnd=now.toISOString(),periodStart=new Date(now.getTime()-24*60*60*1000).toISOString();
const orders=await internalCall('/v1/platform/commerce-signals',{method:'POST',body:{sourceProduct:'shopify',externalWorkspaceRef:'shop-smoke-001',correlationId:'commerce-smoke-orders',signalType:'orders.summary',periodStart,periodEnd,dimensions:{window:'day',scope:'workspace',channel:'store'},metrics:{orders:18,grossRevenueMinor:420000,netRevenueMinor:390000,averageOrderValueMinor:23333,cancelled:1,refundedOrders:1,refundedMinor:12000}}});
assert(orders.ok===true&&orders.privacy==='aggregate_only','orders aggregate accepted');

await internalCall('/v1/platform/commerce-signals',{method:'POST',body:{sourceProduct:'shopify',externalWorkspaceRef:'shop-smoke-001',correlationId:'commerce-smoke-fulfillment',signalType:'fulfillment.summary',periodStart,periodEnd,dimensions:{window:'day',scope:'workspace',channel:'store'},metrics:{pending:4,shipped:8,delivered:6,delayed:2,returnsRequested:1}}});
await internalCall('/v1/platform/commerce-signals',{method:'POST',body:{sourceProduct:'shopify',externalWorkspaceRef:'shop-smoke-001',correlationId:'commerce-smoke-inventory',signalType:'inventory.summary',periodStart,periodEnd,dimensions:{window:'day',scope:'workspace',channel:'store'},metrics:{activeSkus:120,lowStockSkus:7,outOfStockSkus:3}}});
const customers=await internalCall('/v1/platform/commerce-signals',{method:'POST',body:{sourceProduct:'shopify',externalWorkspaceRef:'shop-smoke-001',correlationId:'commerce-smoke-customers',signalType:'customers.summary',periodStart,periodEnd,dimensions:{window:'day',scope:'workspace',channel:'store'},metrics:{newCustomers:9,returningCustomers:5,abandonedCarts:11,recoveredCarts:3}}});
assert(Number(customers.actionSync?.priorities||0)>=3,'signal ingestion materializes Command Center priorities');

const forbidden=await internalCall('/v1/platform/commerce-signals',{method:'POST',expected:400,body:{sourceProduct:'shopify',externalWorkspaceRef:'shop-smoke-001',correlationId:'commerce-smoke-pii',signalType:'orders.summary',periodStart,periodEnd,dimensions:{window:'day',scope:'workspace'},metrics:{orders:1,grossRevenueMinor:10000,netRevenueMinor:10000,averageOrderValueMinor:10000,cancelled:0,refundedOrders:0,refundedMinor:0},customerEmail:'cliente@example.com',orderId:'ORDER-123',shippingAddress:'Rua privada, 1'}});
assert(forbidden.error==='request_failed'||forbidden.issues,'customer/order PII fields rejected');

const forbiddenMetrics=await internalCall('/v1/platform/commerce-signals',{method:'POST',expected:400,body:{sourceProduct:'shopify',externalWorkspaceRef:'shop-smoke-001',correlationId:'commerce-smoke-pii-metrics',signalType:'customers.summary',periodStart,periodEnd,dimensions:{window:'day',scope:'workspace'},metrics:{newCustomers:1,returningCustomers:0,abandonedCarts:1,recoveredCarts:0,email:'private@example.com',cpf:'00000000000'}}});
assert(forbiddenMetrics.error==='request_failed'||forbiddenMetrics.issues,'PII inside metrics rejected');

const listed=await internalCall('/v1/platform/commerce-signals?sourceProduct=shopify&externalWorkspaceRef=shop-smoke-001&limit=20');
assert(listed.signals.length===4&&listed.allowedSignalTypes.includes('inventory.summary'),'only valid commerce aggregates listed');

const brief=await userCall('/v1/assistant/brief');
assert(brief.workspace.vertical==='commerce','assistant sees commerce vertical');
assert(brief.priorities.some(x=>String(x.title).includes('SKU')||String(x.title).includes('pedido')),'commerce signals create operational priorities');
assert(brief.suggestedPrompts.some(x=>String(x).toLowerCase().includes('commerce')),'commerce prompt suggested');

const actions=await userCall('/v1/command/actions');
const operationalActions=actions.filter(x=>x.metadata?.source==='operational_signals');
assert(operationalActions.length>=3,'Commerce priorities appear as Command Center cards');
assert(operationalActions.some(x=>x.primary_action?.type==='operational.review'),'materialized cards use safe internal review action');
const syncAgain=await userCall('/v1/workspace/operational-actions/sync',{method:'POST',body:{}});
assert(syncAgain.created===0&&syncAgain.updated>=3,'manual sync is idempotent for same operational period');

const chat=await userCall('/v1/assistant/chat',{method:'POST',body:{message:'Como está minha operação de commerce?'}});
assert(String(chat.message?.content||'').includes('pedidos')&&chat.facts?.privacy==='aggregate_only','assistant narrates aggregate commerce operation');

console.log(JSON.stringify({ok:true,privacy:'aggregate_only',accepted:4,rejectedSensitivePayloads:2,priorities:brief.priorities.length,commandActions:operationalActions.length,assistant:true},null,2));
