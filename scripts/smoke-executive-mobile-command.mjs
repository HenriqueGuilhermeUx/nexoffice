import pg from 'pg';
const {Client}=pg;
const base=process.env.SMOKE_API_URL||'http://127.0.0.1:4000';
const db=new Client({connectionString:process.env.DATABASE_URL,ssl:false});await db.connect();
let token='',workspace='';
const assert=(v,m)=>{if(!v)throw new Error(`ASSERT: ${m}`)};
const call=async(path,{method='GET',body}={})=>{const headers={'content-type':'application/json'};if(token)headers.authorization=`Bearer ${token}`;if(workspace)headers['x-workspace-id']=workspace;const r=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});const p=await r.json().catch(()=>({}));if(!r.ok)throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(p)}`);return p};
try{
  const stamp=Date.now();
  const reg=await call('/v1/auth/register',{method:'POST',body:{name:'Executive Smoke',email:`executive-${stamp}@nexoffice.test`,password:'SmokePass123!',businessName:'Executive Services',vertical:'general'}});token=reg.token;workspace=reg.workspace.id;
  await call('/v1/intelligence/profile',{method:'PUT',body:{sector:'professional_services',subsector:'consultoria',revenueModel:'project',sellsProducts:false,sellsServices:true,recurringRevenue:false,usesAgenda:false,usesInventory:false,usesContracts:true,employeeCount:4,activeCustomersEstimate:12}});
  const contact=await call('/v1/crm/contacts',{method:'POST',body:{kind:'company',name:'Cliente Executive',source:'Indicação',tags:['executive-smoke'],customFields:{}}});
  const account=await call('/v1/finance/accounts',{method:'POST',body:{name:`Conta Executive ${stamp}`,kind:'bank',openingBalanceMinor:0,currency:'BRL'}});
  await call('/v1/ledger',{method:'POST',body:{contactId:contact.id,accountId:account.id,direction:'income',category:'servicos',description:'Recebível executivo vencido',amountMinor:380000,currency:'BRL',status:'overdue',dueAt:new Date(Date.now()-86400000).toISOString()}});
  await call('/v1/crm/deals',{method:'POST',body:{contactId:contact.id,title:'Oportunidade Executive',stage:'proposal',valueMinor:780000,source:'Indicação',nextAction:'follow-up'}});
  const brief=await call('/v1/intelligence/executive-brief');
  assert(brief.version==='executive-30s-v1','executive brief version');
  assert(typeof brief.headline==='string'&&brief.headline.length>5,'headline generated');
  assert(Array.isArray(brief.decisions)&&brief.decisions.length>=1&&brief.decisions.length<=3,'brief contains bounded executive decisions');
  assert(brief.attention?.kind==='receivables','overdue receivable becomes client-safe attention');
  assert(brief.opportunity?.kind==='pipeline','open pipeline becomes opportunity');
  assert(brief.digitalTeam?.agentRole==='collections','collections specialist selected for overdue receivable');
  assert(Number(brief.weeklyProgress?.total)>=1,'weekly plan connected');
  const serialized=JSON.stringify(brief);for(const forbidden of ['operational_stress','stress_index','risk_score','credit_score','internalRisk'])assert(!serialized.includes(forbidden),`executive payload hides ${forbidden}`);
  const d=brief.decisions[0];const task=await call(`/v1/intelligence/plan/7-days/items/${d.planItemId}/task`,{method:'POST',body:{}});assert(task.task?.id,'decision becomes task');
  const again=await call(`/v1/intelligence/plan/7-days/items/${d.planItemId}/task`,{method:'POST',body:{}});assert(again.existing===true&&again.task?.id===task.task.id,'executive task creation idempotent');
  const counts=(await db.query(`select count(*)::int decisions from intelligence_7day_plan_items where workspace_id=$1 and status<>'superseded'`,[workspace])).rows[0];assert(Number(counts.decisions)>=1,'plan persisted');
  console.log(JSON.stringify({ok:true,workspace,headline:brief.headline,decisions:brief.decisions.length,attention:brief.attention.kind,opportunity:brief.opportunity.kind,agent:brief.digitalTeam.agentRole,planItems:brief.weeklyProgress.total},null,2));
}finally{await db.end()}
