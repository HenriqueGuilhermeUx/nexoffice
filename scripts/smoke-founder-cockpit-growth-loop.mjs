import pg from 'pg';
const {Client}=pg;
const base=process.env.SMOKE_API_URL||'http://127.0.0.1:4000';
const db=new Client({connectionString:process.env.DATABASE_URL,ssl:false});await db.connect();
let token='',workspace='';
const assert=(v,m)=>{if(!v)throw new Error(`ASSERT: ${m}`)};
const call=async(path,{method='GET',body}={})=>{const headers={'content-type':'application/json'};if(token)headers.authorization=`Bearer ${token}`;if(workspace)headers['x-workspace-id']=workspace;const r=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});const p=await r.json().catch(()=>({}));if(!r.ok)throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(p)}`);return p};
try{
  const stamp=Date.now();const email=`founder-${stamp}@nexoffice.test`;
  const reg=await call('/v1/auth/register',{method:'POST',body:{name:'Founder Smoke',email,password:'SmokePass123!',businessName:'Founder Services',vertical:'services'}});token=reg.token;workspace=reg.workspace.id;assert(token&&workspace,'workspace registered');
  await call('/v1/intelligence/profile',{method:'PUT',body:{sector:'professional_services',subsector:'consultoria',revenueModel:'project',sellsProducts:false,sellsServices:true,recurringRevenue:false,usesAgenda:false,usesInventory:false,usesContracts:true,employeeCount:3,activeCustomersEstimate:8}});

  await call('/v1/intelligence/activation/event',{method:'POST',body:{recommendationKey:'customers',target:'crm',event:'shown'}});
  await call('/v1/intelligence/activation/event',{method:'POST',body:{recommendationKey:'customers',target:'crm',event:'clicked'}});
  let activation=await call('/v1/intelligence/activation');assert(Number(activation.summary.clicked)>=1,'activation click recorded');assert(Number(activation.summary.value)===0,'first value is not invented before real module use');

  const contact=await call('/v1/crm/contacts',{method:'POST',body:{kind:'company',name:'Cliente Founder',source:'Indicação',tags:['founder-smoke'],customFields:{}}});assert(contact.id,'contact created');
  const account=await call('/v1/finance/accounts',{method:'POST',body:{name:`Conta Founder ${stamp}`,kind:'bank',openingBalanceMinor:0,currency:'BRL'}});
  const overdue=new Date(Date.now()-2*86400000).toISOString();
  await call('/v1/ledger',{method:'POST',body:{contactId:contact.id,accountId:account.id,direction:'income',category:'servicos',description:'Recebível vencido Founder',amountMinor:245000,currency:'BRL',status:'overdue',dueAt:overdue}});
  await call('/v1/crm/deals',{method:'POST',body:{contactId:contact.id,title:'Projeto Founder',stage:'proposal',valueMinor:500000,source:'Indicação',nextAction:'follow-up'}});

  const cockpit=await call('/v1/intelligence/founder-cockpit');assert(cockpit?.money?.overdueCount>=1,'cockpit exposes overdue operational money');assert(cockpit?.sales?.openDeals>=1,'cockpit exposes pipeline');assert(Array.isArray(cockpit?.plan?.items)&&cockpit.plan.items.length>=1&&cockpit.plan.items.length<=5,'seven-day plan generated with bounded actions');assert(Array.isArray(cockpit.results),'closed-loop result surface exists');
  const serialized=JSON.stringify(cockpit);for(const forbidden of ['operational_stress','stress_index','risk_score','credit_score'])assert(!serialized.includes(forbidden),`client cockpit hides internal field ${forbidden}`);

  activation=await call('/v1/intelligence/activation');assert(Number(activation.summary.value)>=1,'real CRM use closes activation first-value journey');assert(Number(activation.summary.clicked_to_value_pct)>=0,'time-to-value analytics exposed');
  const journey=(await db.query(`select * from intelligence_activation_journeys where workspace_id=$1 and recommendation_key='customers'`,[workspace])).rows[0];assert(journey?.clicked_at&&journey?.first_value_at,'journey stores click and first value timestamps');

  const item=cockpit.plan.items[0];const first=await call(`/v1/intelligence/plan/7-days/items/${item.id}/task`,{method:'POST',body:{}});assert(first.task?.id&&first.item?.task_id===first.task.id,'plan item becomes a real task');const second=await call(`/v1/intelligence/plan/7-days/items/${item.id}/task`,{method:'POST',body:{}});assert(second.existing===true&&second.task?.id===first.task.id,'plan task creation is idempotent');
  await call(`/v1/tasks/${first.task.id}`,{method:'PATCH',body:{status:'done'}});
  const refreshed=await call('/v1/intelligence/plan/7-days');const tracked=refreshed.items.find(x=>x.id===item.id);assert(tracked?.status==='done','completed task closes plan item');

  const planRow=(await db.query(`select count(*)::int c from intelligence_7day_plans where workspace_id=$1`,[workspace])).rows[0];assert(Number(planRow.c)===1,'weekly plan is versioned once per week');
  console.log(JSON.stringify({ok:true,workspace,activation:activation.summary,planItems:cockpit.plan.items.length,trackedStatus:tracked.status,overdueCount:cockpit.money.overdueCount,openDeals:cockpit.sales.openDeals},null,2));
}finally{await db.end()}
