import {execFileSync} from 'node:child_process';

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

const register=await call('/v1/auth/register',{method:'POST',body:{name:'Usage Smoke',email:'usage-smoke@nexoffice.test',password:'SmokePass123!',businessName:'Usage Company',vertical:'general'}});
token=register.token;workspace=register.workspace.id;

const sql=`
insert into usage_events(workspace_id,capability,operation,units,unit_name,provider,cost_minor_estimate,currency,metadata,occurred_at) values
('${workspace}','communication','message_send',3,'operation','smartbots',9,'BRL','{}',now()-interval '2 days'),
('${workspace}','documents','document_analyze',2,'operation','docwallet',40,'BRL','{}',now()-interval '1 day'),
('${workspace}','growth','growth_action',1,'operation','modo',null,'BRL','{}',now());
`;
execFileSync('psql',[process.env.DATABASE_URL,'-v','ON_ERROR_STOP=1','-c',sql],{stdio:'pipe'});

const summary=await call('/v1/usage/summary?days=30');
assert(summary.totals.events===3,'three usage events aggregated');
assert(summary.totals.units===6,'usage units aggregated');
assert(summary.totals.knownCostMinor===49,'known cost sum is correct');
assert(summary.totals.unknownCostEvents===1,'unknown cost event remains explicit');
assert(summary.economics.projected30DayKnownCostMinor>0,'known-cost projection produced');
assert(summary.economics.projectionBasis==='known_cost_only','projection explicitly excludes unknown costs');
assert(String(summary.economics.warning||'').includes('não inclui'),'warning emitted when costs are incomplete');
assert(summary.providers.some(x=>x.provider==='smartbots'),'provider breakdown exists');
assert(summary.capabilities.some(x=>x.capability==='documents'),'capability breakdown exists');
assert(summary.daily.length===3,'daily series exists');
assert(Array.isArray(summary.meteringCatalog)&&summary.meteringCatalog.length>=6,'metering catalog exposed');

const events=await call('/v1/usage/events?days=30&limit=10');
assert(events.length===3,'usage event drill-down works');
assert(events[0].provider==='modo','events ordered newest first');

console.log(JSON.stringify({ok:true,events:summary.totals.events,units:summary.totals.units,knownCostMinor:summary.totals.knownCostMinor,unknownCostEvents:summary.totals.unknownCostEvents,projection30:summary.economics.projected30DayKnownCostMinor},null,2));
