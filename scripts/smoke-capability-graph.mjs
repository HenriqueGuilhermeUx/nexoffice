const base=process.env.SMOKE_API_URL||'http://127.0.0.1:4000';
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

const registered=await call('/v1/auth/register',{method:'POST',body:{name:'Capability Graph Smoke',email:'capability-graph@nexoffice.test',password:'SmokePass123!',businessName:'Capability Graph Company',vertical:'general'}});
token=registered.token;workspace=registered.workspace.id;

const graph=await call('/v1/capabilities');
assert(graph.version==='2026-09-17','capability graph version is explicit');
assert(graph.externalActionsEnabled===false,'CI keeps external actions disabled');
assert(Array.isArray(graph.capabilities)&&graph.capabilities.length>=20,'ecosystem capabilities are exposed');
assert(graph.byAgent&&graph.byAgent.growth&&graph.byAgent.documents&&graph.byAgent.controller,'agent capability views exist');

const googleAds=graph.capabilities.find(item=>item.id==='growth.google_ads.metrics.read');
assert(googleAds&&googleAds.provider==='modo','Google Ads metrics are owned by MODO');
assert(googleAds.maturity==='active','Google Ads read capability is active, not planning-only');
assert(googleAds.effect==='read','Google Ads metrics remain read-only');

const campaignActivation=graph.capabilities.find(item=>item.id==='growth.campaign.activate');
assert(campaignActivation&&campaignActivation.maturity==='planned','campaign activation remains outside current rollout');
assert(campaignActivation.approvalRequired===true,'future campaign activation remains approval-first');

const finance=graph.capabilities.find(item=>item.id==='finance.interpret');
assert(finance&&String(finance.source).includes('F-Insight'),'financial intelligence records F-Insight methodology reuse');

const rules=graph.capabilities.find(item=>item.id==='automation.rule.evaluate');
assert(rules&&String(rules.source).includes('NextGen'),'rule engine records NextGen execution-pattern reuse');

const doc=graph.capabilities.find(item=>item.id==='documents.analyze');
assert(doc&&doc.provider==='docwallet','document intelligence is routed to DocWallet');

const legal=graph.capabilities.find(item=>item.id==='legal.operational_signals.read');
assert(legal&&legal.availability==='inactive_for_workspace','legal capability stays scoped out of a general workspace');

const detail=await call('/v1/capabilities/growth.google_ads.metrics.read');
assert(detail.id==='growth.google_ads.metrics.read','individual capability lookup works');

console.log(JSON.stringify({ok:true,workspace,total:graph.summary.total,ready:graph.summary.ready,planned:graph.summary.planned,externalActionsEnabled:graph.externalActionsEnabled},null,2));
