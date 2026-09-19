const base=process.env.SMOKE_API_URL||'http://127.0.0.1:4000';
let token='',workspace='';
const call=async(path,{method='GET',body,workspaceHeader=true}={})=>{const headers={'content-type':'application/json',authorization:`Bearer ${token}`};if(workspace&&workspaceHeader)headers['x-workspace-id']=workspace;const r=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});const payload=await r.json().catch(()=>({}));if(!r.ok)throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(payload)}`);return payload};
const assert=(v,m)=>{if(!v)throw new Error(`ASSERT: ${m}`)};

const login=await fetch(base+'/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'admin-smoke@nexoffice.test',password:'SmokePass123!'})});
const auth=await login.json();if(!login.ok)throw new Error(`login -> ${login.status} ${JSON.stringify(auth)}`);token=auth.token;
const me=await call('/v1/auth/me',{workspaceHeader:false});const radarWorkspace=(me.workspaces||[]).find(x=>x.name==='Radar Smoke')||(me.workspaces||[])[0];assert(radarWorkspace,'admin smoke workspace exists');workspace=radarWorkspace.id;

const radar=await call('/v1/intelligence/radar');assert((radar.priorities||[]).length,'radar has priorities');
let tracked=null;
for(let i=0;i<Math.min(3,radar.priorities.length);i++){
  const created=await call('/v1/intelligence/actions/task',{method:'POST',body:{priorityIndex:i}});
  const actions=await call('/v1/intelligence/actions');
  tracked=actions.find(x=>x.id===created.action.id&&x.metric_key&&x.baseline_value!==null&&x.desired_direction);
  if(tracked)break;
}
assert(tracked,'at least one top priority is linked to a measurable rule');
await call(`/v1/tasks/${tracked.task_id}`,{method:'PATCH',body:{status:'done'}});
const baseline=Number(tracked.baseline_value);const movement=Math.max(Math.abs(baseline)*.2,2);const improved=tracked.desired_direction==='down'?baseline-movement:baseline+movement;
await new Promise(r=>setTimeout(r,25));
await call('/v1/intelligence/metrics',{method:'POST',body:{metricKey:tracked.metric_key,valueNumeric:improved,source:'client_reported',quality:'high',confidence:.9,metadata:{smoke:'learning-loop'}}});
const evaluated=await call(`/v1/admin/intelligence/learning/actions/${tracked.id}/evaluate`,{method:'POST',body:{},workspaceHeader:false});
assert(evaluated.evaluation_status==='improved',`completed action evaluates as improved, got ${evaluated.evaluation_status}`);
assert(Number(evaluated.observed_value)===improved,'observed metric stored');
const customerActions=await call('/v1/intelligence/actions');const customerAction=customerActions.find(x=>x.id===tracked.id);assert(customerAction?.evaluation_status==='improved','customer action endpoint exposes result');
const refresh=await call('/v1/admin/intelligence/learning/refresh',{method:'POST',body:{},workspaceHeader:false});assert(refresh.overview?.summary,'learning overview returned');assert(Number(refresh.overview.summary.actions)>=1,'learning overview counts actions');assert(Array.isArray(refresh.overview.byRule),'learning overview groups by rule');assert(Array.isArray(refresh.overview.suggestions),'learning suggestions returned');
console.log(JSON.stringify({ok:true,workspace,actionId:tracked.id,metric:tracked.metric_key,baseline,observed:improved,evaluation:evaluated.evaluation_status,actions:refresh.overview.summary.actions},null,2));
