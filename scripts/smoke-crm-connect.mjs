const base=process.env.SMOKE_API_URL||'http://127.0.0.1:4000';
let token='',workspace='';
async function call(path,{method='GET',body,auth=true}={}){
  const headers={'content-type':'application/json',accept:'application/json'};
  if(auth&&token)headers.authorization='Bearer '+token;
  if(auth&&workspace)headers['x-workspace-id']=workspace;
  const res=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(method+' '+path+' -> '+res.status+' '+JSON.stringify(data));
  return data;
}
const ok=(v,m)=>{if(!v)throw new Error('ASSERT: '+m)};

const reg=await call('/v1/auth/register',{method:'POST',auth:false,body:{
  name:'CRM Smoke',email:'crm-smoke-'+Date.now()+'@nexoffice.test',password:'A1b2c3d4!',businessName:'CRM Smoke Co',vertical:'general'
}});
token=reg.token;workspace=reg.workspace.id;

const contact=await call('/v1/crm/contacts',{method:'POST',body:{kind:'company',name:'Cliente CRM',email:'cliente.crm@nexoffice.test',source:'smoke'}});
await call('/v1/crm/deals',{method:'POST',body:{contactId:contact.id,title:'Venda histórica',stage:'won',valueMinor:100000,currency:'BRL',source:'smoke'}});
await call('/v1/onboarding/business/confirm',{method:'PUT',body:{
  sector:'services',revenueModel:'mixed',sellsServices:true,mainDependency:'sales',
  metadata:{commercial:{primaryGoal:'sell'},operations:{biggestBottleneck:'sales'},systems:{currentTools:['crm'],namedTools:['CRM Smoke']},onboarding:{version:'business-v2',primaryGoal:'sell'}},
  complete:true
}});

const deals=['Deal_ID;Deal_Name;Email;Stage;Amount;Expected_Close_At','D1;Renovacao CRM;cliente.crm@nexoffice.test;Proposal;25.000,00;01/01/2025'].join('\n');
const preview=await call('/v1/connect/crm/preview',{method:'POST',body:{filename:'deals.csv',content:deals,resourceKind:'deal',sourceSystem:'CRM Smoke'}});
ok(preview.safety?.persisted===false&&preview.safety?.rawFileStored===false,'preview persists nothing');
ok(preview.normalizedSample?.[0]?.stage==='proposal','deal stage normalizes');
ok(preview.normalizedSample?.[0]?.amountMinor===2500000,'deal value normalizes');

const dealImport=await call('/v1/connect/crm/import',{method:'POST',body:{filename:'deals.csv',content:deals,resourceKind:'deal',sourceSystem:'CRM Smoke',datasetName:'Deals',humanConfirmed:true}});
ok(dealImport.imported===1&&dealImport.safety?.migrationPerformed===false,'deal import is context only');

const acts=['Activity_ID;Subject;Email;Type;Date','A1;Follow-up recente;cliente.crm@nexoffice.test;Call;20/10/2026'].join('\n');
const act=await call('/v1/connect/crm/import',{method:'POST',body:{filename:'activities.csv',content:acts,resourceKind:'activity',sourceSystem:'CRM Smoke',datasetName:'Activities',humanConfirmed:true}});
ok(act.imported===1,'activity imported');
const dup=await call('/v1/connect/crm/import',{method:'POST',body:{filename:'activities.csv',content:acts,resourceKind:'activity',sourceSystem:'CRM Smoke',datasetName:'Activities',humanConfirmed:true}});
ok(dup.imported===0&&dup.duplicates===1,'reimport deduplicates');

const graph=await call('/v1/business-graph/overview?days=90&includeGraph=true');
const native=graph.graph.nodes.find(n=>n.source==='nexoffice.crm'&&n.sourceId===contact.id);
const deal=graph.graph.nodes.find(n=>n.source==='external.crm'&&n.kind==='deal'&&n.label==='Renovacao CRM');
const activity=graph.graph.nodes.find(n=>n.source==='external.crm'&&n.kind==='event'&&n.label==='Follow-up recente');
ok(native&&deal&&activity,'external CRM becomes semantic graph nodes');
ok(graph.graph.edges.some(e=>e.from===native.id&&e.to===deal.id&&e.kind==='has_deal'&&e.source==='external.crm'),'deal links by exact email');
ok(graph.graph.edges.some(e=>e.from===native.id&&e.to===activity.id&&e.kind==='related_to'&&e.source==='external.crm'),'activity links by exact email');
ok(graph.executiveSignals.some(s=>s.code==='external_deals_past_expected_close'&&Number(s.evidence?.valueMinor)===2500000),'stale external deal becomes signal');

const diagnosis=await call('/v1/onboarding/business/diagnosis');
ok(diagnosis.connections.connected.some(x=>x.key==='external_crm'),'CRM connection becomes connected');

const rel=await call('/v1/crm/relationship-intelligence?includeDocWallet=false');
const row=rel.relationships.find(x=>x.contactId===contact.id);
ok(row&&Number(row.externalInteractions90)>=1&&row.externalSources.includes('external.crm'),'CRM activity enriches relationship');
ok(Number(rel.sources?.externalCrmActivitiesObserved)>=1,'CRM activity count stays auditable');

const exec=await call('/v1/assistant/executive-context');
const priority=exec.priorities.find(x=>x.code==='external_deals_past_expected_close');
ok(priority?.recommendedNextStep,'Maya surfaces stale external deal with next step');
ok(exec.evidencePolicy?.externalEffects===false,'Maya remains read-only');

console.log(JSON.stringify({ok:true,module:'External CRM Universal Import V1',imported:2,deduplicated:1,crmLinked:true,mayaPriority:priority.code,externalEffects:false},null,2));
