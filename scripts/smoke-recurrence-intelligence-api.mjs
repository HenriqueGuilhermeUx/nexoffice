const base=process.env.SMOKE_API_URL||'http://127.0.0.1:4000';
let token='';let workspace='';
const call=async(path,{method='GET',body,auth=true}={})=>{
  const headers={'content-type':'application/json'};
  if(auth&&token)headers.authorization='Bearer '+token;
  if(auth&&workspace)headers['x-workspace-id']=workspace;
  const r=await fetch(base+path,{method,headers,body:body!==undefined?JSON.stringify(body):undefined});
  const payload=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(method+' '+path+' -> '+r.status+' '+JSON.stringify(payload));
  return payload;
};
const assert=(value,message)=>{if(!value)throw new Error('ASSERT: '+message)};

const email='recurrence-smoke-'+Date.now()+'@nexoffice.test';
const register=await call('/v1/auth/register',{method:'POST',auth:false,body:{name:'Recurrence Smoke',email,password:'SmokePass123!',businessName:'Recurrence Smoke Company',vertical:'general'}});
token=register.token;workspace=register.workspace.id;assert(token&&workspace,'register must return token/workspace');

const contact=await call('/v1/crm/contacts',{method:'POST',body:{kind:'company',name:'Cliente Recorrente',email:'cliente-recorrente@nexoffice.test',phone:'5513999999999',source:'smoke',tags:['recorrente']}});
assert(contact.id,'contact created');

const catalog=await call('/v1/catalog/items',{method:'POST',body:{kind:'service',name:'Acompanhamento semanal',description:'Serviço recorrente para teste',unit:'semana',priceMinor:25000,costMinor:10000,currency:'BRL',billingCycle:'weekly'}});
assert(catalog.id,'recurring catalog item created');

const operation=await call('/v1/business-operations',{method:'POST',body:{contactId:contact.id,catalogItemId:catalog.id,quantity:1,dueAt:new Date(Date.now()+86400000).toISOString()}});
assert(operation.id,'business operation created');

let intelligence=await call('/v1/finance/recurrence-intelligence');
const uncovered=intelligence.uncovered.find(x=>x.operation_id===operation.id);
assert(uncovered,'recurring sale must appear as not activated');
assert(uncovered.best_options.some(x=>x.action==='activate_recurrence'),'activation must be offered');

const activated=await call('/v1/finance/recurrence-intelligence/activate/'+operation.id,{method:'POST',body:{}});
assert(activated.rule?.id,'activation must create recurring rule');
assert(activated.externalEffect===false,'activation must have no external effect');
assert(activated.retroactiveGeneration===false,'activation must not backfill old charges');

const activatedAgain=await call('/v1/finance/recurrence-intelligence/activate/'+operation.id,{method:'POST',body:{}});
assert(activatedAgain.reused===true,'activation must be idempotent');

intelligence=await call('/v1/finance/recurrence-intelligence');
const rule=intelligence.rules.find(x=>x.id===activated.rule.id);
assert(rule&&rule.active===true,'active recurring rule must be visible');
assert(Number(rule.expected_30_minor)>=25000,'30-day forecast must include weekly recurrence');
assert(!intelligence.uncovered.some(x=>x.operation_id===operation.id),'activated sale must leave uncovered list');
assert(intelligence.safety?.automaticExternalActions===false,'recurrence intelligence must not enable external actions');

const generated=await call('/v1/recurring-rules/run',{method:'POST',body:{days:30}});
assert(generated.created>=1,'explicit generation must create upcoming receivables');

const ledger=await call('/v1/ledger');
const recurringEntries=ledger.filter(x=>String(x.recurrence_key||'').startsWith('recurring:'+activated.rule.id+':'));
assert(recurringEntries.length>=1,'generated recurring receivables must be traceable to the rule');

console.log(JSON.stringify({ok:true,workspace,operation:operation.id,rule:activated.rule.id,generated:generated.created,forecast30:intelligence.summary.expected30Minor},null,2));
