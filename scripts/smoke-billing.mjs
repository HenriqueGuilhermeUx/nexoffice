const base=process.env.SMOKE_API_URL||'http://127.0.0.1:4000';
const run=Date.now();let token='',workspace='';
const call=async(path,{method='GET',body}={})=>{const headers={'content-type':'application/json'};if(token)headers.authorization=`Bearer ${token}`;if(workspace)headers['x-workspace-id']=workspace;const r=await fetch(base+path,{method,headers,body:body!==undefined?JSON.stringify(body):undefined});const payload=await r.json().catch(()=>({}));if(!r.ok)throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(payload)}`);return payload};
const assert=(v,m)=>{if(!v)throw new Error(`ASSERT: ${m}`)};

const registration=await call('/v1/auth/register',{method:'POST',body:{name:'Billing Smoke',email:`billing-smoke-${run}@nexoffice.test`,password:'SmokePass123!',businessName:`Billing Smoke ${run}`,vertical:'general'}});
token=registration.token;workspace=registration.workspace.id;
assert(token&&workspace,'registration must return token and workspace');

const billing=await call('/v1/billing/summary');
assert(billing.planCode==='pro','plan code must be pro');
assert(billing.planName==='NexOffice Pro','plan name');
assert(Number(billing.priceMinor)===19700,'founder price must be R$197');
assert(billing.currency==='BRL','currency BRL');
assert(billing.status==='trialing','new workspace must start trialing');
assert(billing.access===true,'trial must grant access');
assert(Number(billing.trialDaysRemaining)>=6&&Number(billing.trialDaysRemaining)<=7,'trial should be seven days');
assert(Boolean(billing.trialEndsAt),'trial end must exist');
assert(billing.billingConfigured===false,'CI billing must stay disabled without provider secret');

const contact=await call('/v1/crm/contacts',{method:'POST',body:{kind:'company',name:'Cliente Trial'}});
assert(contact.id,'trial can create CRM contact');

console.log(JSON.stringify({ok:true,workspace,status:billing.status,trialDaysRemaining:billing.trialDaysRemaining,priceMinor:billing.priceMinor,billingConfigured:billing.billingConfigured},null,2));
