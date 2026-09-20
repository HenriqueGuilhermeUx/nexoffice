import pg from 'pg';
const {Client}=pg;
const base=process.env.SMOKE_API_URL||'http://127.0.0.1:4000';
const db=new Client({connectionString:process.env.DATABASE_URL,ssl:false});await db.connect();
const assert=(v,m)=>{if(!v)throw new Error(`ASSERT: ${m}`)};
const call=async(path,{method='GET',body,token,workspace}={})=>{const headers={'content-type':'application/json'};if(token)headers.authorization=`Bearer ${token}`;if(workspace)headers['x-workspace-id']=workspace;const r=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});const p=await r.json().catch(()=>({}));if(!r.ok)throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(p)}`);return p};
try{
  const admin=(await db.query(`select id from users where lower(email)=lower($1)`,['admin-smoke@nexoffice.test'])).rows[0];assert(admin,'admin smoke user exists');
  let targetWorkspace='';
  for(let i=0;i<11;i++){
    const w=(await db.query(`insert into workspaces(name,slug,vertical,status) values($1,$2,'commerce','active') returning id`,[`Benchmark Commerce ${i+1}`,`benchmark-commerce-${i+1}-${Date.now()}`])).rows[0];if(i===0)targetWorkspace=w.id;
    await db.query(`insert into business_profiles(workspace_id,sector,revenue_model,sells_products,sells_services,employee_count,completeness_pct) values($1,'commerce','mixed',true,false,5,90)`,[w.id]);
    const score=60+i;const metrics={overdue_receivable_share_pct:5+i,top_client_share_pct:20+i,task_overdue_rate_pct:4+i,appointment_problem_rate_pct:3+i,pipeline_coverage_months:1.2+i*.1,cash_coverage_months:1.5+i*.1};
    await db.query(`insert into intelligence_snapshots(workspace_id,overall_score,finance_score,sales_score,customer_score,operation_score,resilience_score,knowledge_pct,status,trend,summary,metrics) values($1,$2,$3,$4,$5,$6,$7,85,'healthy','stable','benchmark smoke',$8::jsonb)`,[w.id,score,score+1,score+2,score+3,score+4,score+5,JSON.stringify(metrics)]);
  }
  await db.query(`insert into workspace_members(workspace_id,user_id,role,permissions) values($1,$2,'owner',array['workspace.read','agenda.read','agenda.write','command.read']) on conflict do nothing`,[targetWorkspace,admin.id]);
  for(let i=0;i<9;i++){
    const w=(await db.query(`insert into workspaces(name,slug,vertical,status) values($1,$2,'general','active') returning id`,[`Privacy Benchmark ${i+1}`,`privacy-benchmark-${i+1}-${Date.now()}`])).rows[0];
    await db.query(`insert into business_profiles(workspace_id,sector,revenue_model,sells_services,employee_count,completeness_pct) values($1,'privacy_test_sector','mixed',true,5,90)`,[w.id]);
    await db.query(`insert into intelligence_snapshots(workspace_id,overall_score,finance_score,sales_score,customer_score,operation_score,resilience_score,knowledge_pct,status,trend,summary,metrics) values($1,$2,$2,$2,$2,$2,$2,85,'healthy','stable','privacy smoke','{}'::jsonb)`,[w.id,70+i]);
  }
  const login=await call('/v1/auth/login',{method:'POST',body:{email:'admin-smoke@nexoffice.test',password:'SmokePass123!'}});const token=login.token;assert(token,'admin token');
  const refreshed=await call('/v1/admin/intelligence/benchmarks/refresh',{method:'POST',body:{},token});assert(refreshed.rebuild?.cohortsCreated>=1,'benchmark cohorts created');assert(refreshed.overview?.available===true,'benchmark admin overview available');
  const commerce=refreshed.overview.sectors.find(x=>x.sector==='commerce');assert(commerce&&Number(commerce.sample_size)>=10,'commerce benchmark published with minimum sample');
  const privateSmall=refreshed.overview.sectors.find(x=>x.sector==='privacy_test_sector');assert(!privateSmall,'cohort below privacy threshold is withheld');
  const customer=await call('/v1/intelligence/benchmark',{token,workspace:targetWorkspace});assert(customer.available===true,'customer benchmark available');assert(Number(customer.cohort?.sampleSize)>=10,'customer cohort respects privacy minimum');assert(customer.items.some(x=>x.key==='overall_score'),'overall score benchmark returned');
  const serialized=JSON.stringify(customer);assert(!serialized.includes('Benchmark Commerce 2'),'payload never exposes peer company names');assert(!serialized.includes('Privacy Benchmark'),'payload never exposes other company names');
  console.log(JSON.stringify({ok:true,cohorts:refreshed.rebuild.cohortsCreated,metricRows:refreshed.rebuild.metricRowsCreated,customerCohort:customer.cohort,items:customer.items.length},null,2));
}finally{await db.end()}
