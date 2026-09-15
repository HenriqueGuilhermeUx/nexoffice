const base=process.env.SMOKE_API_URL||'http://127.0.0.1:4000';
let token='';let workspace='';
const call=async(path,{method='GET',body,auth=true}={})=>{const headers={'content-type':'application/json'};if(auth&&token)headers.authorization=`Bearer ${token}`;if(auth&&workspace)headers['x-workspace-id']=workspace;const r=await fetch(base+path,{method,headers,body:body!==undefined?JSON.stringify(body):undefined});const payload=await r.json().catch(()=>({}));if(!r.ok)throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(payload)}`);return payload};
const assert=(value,message)=>{if(!value)throw new Error(`ASSERT: ${message}`)};

const register=await call('/v1/auth/register',{method:'POST',auth:false,body:{name:'Fiscal Smoke Owner',email:'fiscal-smoke@nexoffice.test',password:'SmokePass123!',businessName:'Fiscal Smoke Company',vertical:'general'}});
token=register.token;workspace=register.workspace.id;assert(token&&workspace,'register must return token/workspace');

const mapping=await call('/v1/integrations/taxagent',{method:'PUT',body:{companyId:'company-taxagent-smoke',environment:'test',secretRef:'TAXAGENT_SMOKE_KEY'}});
assert(mapping.companyId==='company-taxagent-smoke','TaxAgent company mapping saved');
assert(mapping.environment==='test','TaxAgent test environment saved');
assert(mapping.secretConfigured===true,'secret reference saved without secret value');

const prepared=await call('/v1/fiscal/invoices/prepare',{method:'POST',body:{
  customer:{taxId:'12345678000190',name:'Cliente Fiscal Smoke',cityCode:'3550308'},
  service:{description:'Serviço de teste NexOffice',amount:1500,nationalServiceCode:'010201',serviceLocationCityCode:'3550308'}
}});
assert(prepared.prepared===true&&prepared.externalEffect===false,'invoice preparation is internal only');
assert(prepared.action?.id,'invoice preparation creates command action');
assert(prepared.action?.approval_id,'invoice issuance requires approval');

const actionId=prepared.action.id;
await call(`/v1/command/actions/${actionId}/decision`,{method:'POST',body:{decision:'approved'}});
const execution=await call(`/v1/command/actions/${actionId}/execute`,{method:'POST',body:{}});
assert(execution.run?.status==='queued_external','approved invoice queues TaxAgent adapter');

const outbox=await call('/v1/outbox');
const fiscalMessage=outbox.find(x=>x.topic==='taxagent.invoice.issue');
assert(fiscalMessage,'TaxAgent invoice is present in outbox');
const processed=await call('/v1/outbox/process',{method:'POST',body:{limit:20}});
const fiscalResult=processed.results.find(x=>x.topic==='taxagent.invoice.issue');
assert(fiscalResult?.ok===true&&fiscalResult?.dryRun===true,'CI keeps TaxAgent transmission in dry-run');

const status=await call('/v1/fiscal/status');
assert(status.integration?.company_id==='company-taxagent-smoke','fiscal status exposes company mapping');
assert(status.recentActions?.some(x=>x.id===actionId),'fiscal status exposes recent invoice action');

console.log(JSON.stringify({ok:true,workspace,actionId,outboxId:fiscalMessage.id,dryRun:true},null,2));
