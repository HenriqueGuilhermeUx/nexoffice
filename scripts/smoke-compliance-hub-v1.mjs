const base=process.env.SMOKE_API_URL||'http://127.0.0.1:4000';
const internalKey=process.env.NEXOFFICE_INTERNAL_KEY;if(!internalKey)throw new Error('NEXOFFICE_INTERNAL_KEY required');
const password=process.env.SMOKE_USER_PASSWORD;if(!password)throw new Error('SMOKE_USER_PASSWORD required');
const assert=(value,message)=>{if(!value)throw new Error(`ASSERT: ${message}`)};

async function call(path,{method='GET',body,token,workspace,key,expect}={}){
  const headers={'content-type':'application/json'};if(token)headers.authorization=`Bearer ${token}`;if(workspace)headers['x-workspace-id']=workspace;if(key)headers['x-nexoffice-key']=key;
  const response=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});const payload=await response.json().catch(()=>({}));
  if(expect!==undefined){assert(response.status===expect,`${method} ${path}: expected ${expect}, got ${response.status} ${JSON.stringify(payload)}`);return{status:response.status,payload}}
  if(!response.ok)throw new Error(`${method} ${path} -> ${response.status} ${JSON.stringify(payload)}`);return payload;
}
async function register(suffix,businessName){const r=await call('/v1/auth/register',{method:'POST',body:{name:`Compliance ${suffix}`,email:`compliance-${suffix}-${Date.now()}@nexoffice.test`,password,businessName,vertical:'general'}});return{token:r.token,workspace:r.workspace.id,businessName}}

const a=await register('a','Empresa Compliance A');
await call('/v1/intelligence/profile',{method:'PUT',...a,body:{sector:'professional_services',subsector:'consultoria',revenueModel:'project',sellsServices:true}});
let overview=await call('/v1/compliance/overview',a);
assert(overview.available===true,'Compliance Hub is available');
assert(overview.privacy?.mode==='aggregate_only','privacy mode is aggregate-only');
assert(overview.legalGuidance?.automaticLegalConclusion===false,'triage never makes automatic legal conclusions');
assert(overview.relevance?.state==='worth_checking','unknown company starts with a neutral worth-checking state');
assert(Array.isArray(overview.privacy?.forbidden)&&overview.privacy.forbidden.includes('psychosocial_answers'),'sensitive answer class is explicitly forbidden');
assert(overview.nr1check?.configured===true,'NR1Check fallback is configured');
assert(overview.nr1check?.federated===false,'isolated smoke intentionally runs without federation credentials');

const triage=await call('/v1/compliance/triage',{method:'PUT',...a,body:{hasEmployees:'yes',companyType:'other',hasSstSupport:'unknown',nr1ReviewStatus:'not_reviewed'}});
assert(triage.relevance?.state==='review_recommended','employees + not reviewed raises product-level review recommendation');
assert(triage.legalGuidance?.automaticLegalConclusion===false,'review recommendation is not legal conclusion');

const unsafeTriage=await call('/v1/compliance/triage',{method:'PUT',...a,body:{hasEmployees:'yes',companyType:'other',hasSstSupport:'unknown',nr1ReviewStatus:'not_reviewed',employeeName:'Pessoa X'},expect:400});
assert(unsafeTriage.status===400,'triage rejects employee-level fields');

const handoff=await call('/v1/compliance/nr1check/handoff',{method:'POST',...a,body:{}});
assert(handoff.mode==='fallback','safe fallback remains available when federation is not configured');
assert(handoff.sensitiveBusinessDataShared===false,'handoff declares zero sensitive business sharing');
assert(handoff.identityTransferredServerSide===false,'fallback does not transfer NexOffice identity');
assert(handoff.sharedBusinessFields.join(',')==='workspaceRef,businessName,sector','handoff has exact safe business field allowlist');
const handoffUrl=new URL(handoff.url);const params=[...handoffUrl.searchParams.keys()].sort();
assert(handoffUrl.origin==='https://nr1check.test','handoff uses configured NR1Check origin');
assert(JSON.stringify(params)===JSON.stringify(['businessName','sector','source','workspaceRef']),'fallback URL exposes only safe business context fields');
assert(handoffUrl.searchParams.get('workspaceRef')===a.workspace,'handoff is bound to active workspace');
assert(!handoffUrl.searchParams.has('email')&&!handoffUrl.searchParams.has('userEmail')&&!handoffUrl.searchParams.has('userName'),'identity is never placed in fallback browser URL');

await call('/v1/internal/compliance/summary',{method:'POST',key:'wrong-key',body:{workspaceRef:a.workspace,sourceProduct:'mindcompliance',openActions:2,overdueActions:1},expect:401});
const unsafeSummary=await call('/v1/internal/compliance/summary',{method:'POST',key:internalKey,body:{workspaceRef:a.workspace,sourceProduct:'mindcompliance',openActions:2,overdueActions:1,psychosocialAnswers:[{employee:'x',answer:'secret'}]},expect:400});
assert(unsafeSummary.status===400,'aggregate ingestion rejects raw sensitive payloads');

await call('/v1/internal/compliance/summary',{method:'POST',key:internalKey,body:{workspaceRef:a.workspace,sourceProduct:'mindcompliance',diagnosticStatus:'completed',programStatus:'attention',openActions:3,overdueActions:1,nextDueAt:new Date(Date.now()+3*86400000).toISOString(),completionPct:62,categories:['NR-1','Plano de ação'],deepLink:'https://mindcompliance.test/company-safe-dashboard'}});
overview=await call('/v1/compliance/overview',a);
assert(overview.mindcompliance?.connected===true,'aggregate compliance summary is connected');
assert(overview.mindcompliance.summary.openActions===3&&overview.mindcompliance.summary.overdueActions===1,'only operational aggregate counts are surfaced');
assert(!('psychosocialAnswers' in overview.mindcompliance.summary)&&!('employeeName' in overview.mindcompliance.summary),'sensitive fields never surface');

const executive=await call('/v1/intelligence/executive-brief',a);
assert(executive.compliance?.privacy==='aggregate_only','executive briefing receives only aggregate compliance snapshot');
assert(executive.compliance?.overdueActions===1,'executive briefing sees aggregate overdue count');
assert(executive.attention?.target==='compliance','overdue compliance becomes a day-to-day attention item when no higher cash urgency exists');
assert(!JSON.stringify(executive).includes('psychosocialAnswers'),'executive payload cannot expose raw psychosocial data');

const b=await register('b','Empresa Compliance B');
const overviewB=await call('/v1/compliance/overview',b);
assert(overviewB.mindcompliance?.connected===false,'compliance summary is tenant isolated');
await call('/v1/compliance/overview',{token:a.token,workspace:b.workspace,expect:403});

const health=await call('/health',{token:null,workspace:null});assert(health.status==='ok','API remains healthy');
console.log(JSON.stringify({ok:true,workspaceA:a.workspace,workspaceB:b.workspace,triage:overview.relevance,nr1checkMode:handoff.mode,aggregateSummary:{openActions:overview.mindcompliance.summary.openActions,overdueActions:overview.mindcompliance.summary.overdueActions,completionPct:overview.mindcompliance.summary.completionPct},executiveAttention:executive.attention,tenantIsolation:true,privacy:'aggregate_only'},null,2));
