import {NexOfficeCommerceSignalClient} from '../packages/integrations/dist/commerce.js';

const base=process.env.SMOKE_API_URL||'http://127.0.0.1:4000';
const internalKey=process.env.NEXOFFICE_INTERNAL_KEY||'platform-smoke-key';
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

const registered=await call('/v1/auth/register',{method:'POST',body:{name:'Commerce SDK Smoke',email:'commerce-sdk@nexoffice.test',password:'SmokePass123!',businessName:'Commerce SDK Company',vertical:'commerce'}});
token=registered.token;workspace=registered.workspace.id;

const mappings=[
  ['shopify','sdk-shopify-store-001'],
  ['woocommerce','sdk-woocommerce-store-001'],
  ['nuvemshop','sdk-nuvemshop-store-001']
];
for(const [provider,externalAccountRef] of mappings){
  const mapping=await call(`/v1/integrations/commerce/${provider}`,{method:'PUT',body:{externalAccountRef}});
  assert(mapping.provider===provider&&mapping.external_account_ref===externalAccountRef,`${provider} channel maps to commerce workspace`);
  assert(mapping.config?.privacy==='aggregate_only'&&mapping.config?.rawOrders===false&&mapping.config?.customerPII===false,`${provider} mapping keeps aggregate-only privacy`);
}

const client=new NexOfficeCommerceSignalClient(base,internalKey,5000);
const now=new Date(),periodEnd=now.toISOString(),periodStart=new Date(now.getTime()-86_400_000).toISOString();
const results=await client.pushMany([
  {sourceProduct:'shopify',externalWorkspaceRef:'sdk-shopify-store-001',correlationId:'sdk-shopify-orders-001',periodStart,periodEnd,dimensions:{window:'day',scope:'workspace',channel:'store'},signalType:'orders.summary',metrics:{orders:12,grossRevenueMinor:260000,netRevenueMinor:245000,averageOrderValueMinor:21667,cancelled:1,refundedOrders:0,refundedMinor:0}},
  {sourceProduct:'woocommerce',externalWorkspaceRef:'sdk-woocommerce-store-001',correlationId:'sdk-woocommerce-stock-001',periodStart,periodEnd,dimensions:{window:'day',scope:'workspace',channel:'store'},signalType:'inventory.summary',metrics:{activeSkus:80,lowStockSkus:5,outOfStockSkus:2}},
  {sourceProduct:'nuvemshop',externalWorkspaceRef:'sdk-nuvemshop-store-001',correlationId:'sdk-nuvemshop-conv-001',periodStart,periodEnd,dimensions:{window:'day',scope:'workspace',channel:'store'},signalType:'conversion.summary',metrics:{sessions:900,carts:120,checkouts:75,purchases:48,conversionRateBps:533}}
]);
assert(results.length===3,'Commerce SDK pushes all three provider signals');
for(const [index,[provider]] of mappings.entries()){
  assert(results[index].ok===true&&results[index].privacy==='aggregate_only',`${provider} SDK result is aggregate-only`);
  assert(results[index].signal.source_product===provider,`${provider} source survives Commerce SDK boundary`);
  assert(results[index].signal.workspace_id===workspace,`${provider} resolves the same NexOffice Commerce workspace`);
}

const connections=await call('/v1/integrations/commerce');
assert(connections.filter(item=>['shopify','woocommerce','nuvemshop'].includes(item.provider)).length===3,'Commerce workspace exposes the three prepared channel adapters');

console.log(JSON.stringify({ok:true,workspace,providers:mappings.map(([provider])=>provider),privacy:'aggregate_only',rawOrders:false,customerPII:false},null,2));
