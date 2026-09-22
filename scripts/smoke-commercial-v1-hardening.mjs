const base=process.env.SMOKE_API_URL||'http://127.0.0.1:4000';
const modoBase=(process.env.MODO_BASE_URL||'http://127.0.0.1:4999').replace(/\/$/,'');
const modoKey=process.env.MODO_API_KEY||'test-key';
const smokePassword=process.env.SMOKE_USER_PASSWORD;if(!smokePassword)throw new Error('SMOKE_USER_PASSWORD required');
const assert=(v,m)=>{if(!v)throw new Error(`ASSERT: ${m}`)};

async function api(path,{method='GET',body,token,workspace,expect}={}){
  const headers={'content-type':'application/json'};if(token)headers.authorization=`Bearer ${token}`;if(workspace)headers['x-workspace-id']=workspace;
  const r=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});const payload=await r.json().catch(()=>({}));
  if(expect!==undefined){assert(r.status===expect,`${method} ${path} expected ${expect}, got ${r.status}: ${JSON.stringify(payload)}`);return{status:r.status,payload}}
  if(!r.ok)throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(payload)}`);return payload;
}
async function register(suffix,businessName){const reg=await api('/v1/auth/register',{method:'POST',body:{name:`Owner ${suffix}`,email:`commercial-hardening-${suffix}-${Date.now()}@nexoffice.test`,password:smokePassword,businessName,vertical:'general'}});return{token:reg.token,workspace:reg.workspace.id}}
async function profile(auth){return api('/v1/intelligence/profile',{method:'PUT',...auth,body:{sector:'professional_services',subsector:'consultoria',revenueModel:'project',sellsServices:true,primarySalesChannel:'indicação',metadata:{commercial:{offer:'Consultoria operacional para PMEs',location:'Santos e Baixada Santista',audience:'Donos de pequenas e médias empresas',differentiators:['Atendimento consultivo'],proofs:[],allowedClaims:[]}}}})}
async function campaign(auth){return api('/v1/marketing/commercial/campaigns',{method:'POST',...auth,body:{objective:'Gerar novos clientes',monthlyBudget:1500,ticket:3000,provider:'google_ads',generateLanding:false,createCreative:false}})}

const a=await register('tenant-a','Empresa A');await profile(a);const ca=await campaign(a);const projectA=ca.project.id;
const [syncA1,syncA2]=await Promise.all([
  api(`/v1/marketing/commercial/projects/${projectA}/sync-crm`,{method:'POST',...a,body:{}}),
  api(`/v1/marketing/commercial/projects/${projectA}/sync-crm`,{method:'POST',...a,body:{}})
]);
assert(syncA1.total===1&&syncA2.total===1,'concurrent syncs both complete');
const contactsA=await api('/v1/crm/contacts',{...a});const dealsA=await api('/v1/crm/deals',{...a});
const leadContactsA=contactsA.filter(x=>x.custom_fields?.modoLeadId==='11111111-1111-4111-8111-111111111111');
const leadDealsA=dealsA.filter(x=>x.metadata?.marketingLeadId==='11111111-1111-4111-8111-111111111111');
assert(leadContactsA.length===1,`concurrent sync creates exactly one contact, got ${leadContactsA.length}`);assert(leadDealsA.length===1,`concurrent sync creates exactly one deal, got ${leadDealsA.length}`);

const unsafeResp=await fetch(`${modoBase}/api/v1/internal/nexoffice/marketing/v1/content/drafts`,{method:'POST',headers:{'content-type':'application/json','x-nexoffice-key':modoKey,'x-nexoffice-workspace-id':a.workspace},body:JSON.stringify({brandName:'Empresa A',niche:'servicos_profissionais',contentType:'static_post',objective:'conversao',brief:'[TEST_UNSAFE_CLAIM] force adversarial fixture',channel:'Google Ads'})});
const unsafe=await unsafeResp.json();assert(unsafeResp.ok&&unsafe.request?.id,'unsafe fixture created only in fake provider');
const gate=await api(`/v1/marketing/commercial/creatives/${unsafe.request.id}/quality`,{...a});assert(gate.passed===false,'adversarial unsupported claims are blocked');assert(gate.blockers.some(x=>x.code==='claim_price'),'price claim is blocked');assert(gate.blockers.some(x=>x.code==='claim_numeric_result'),'numeric result claim is blocked');
const rejected=await api(`/v1/marketing/commercial/creatives/${unsafe.request.id}/approve`,{method:'POST',...a,body:{approved:true},expect:409});assert(rejected.payload?.code==='commercial_quality_gate_failed'||String(rejected.payload?.message||'').includes('Quality Gate'),'approval cannot bypass quality gate');

const b=await register('tenant-b','Empresa B');await profile(b);const cb=await campaign(b);const projectB=cb.project.id;await api(`/v1/marketing/commercial/projects/${projectB}/sync-crm`,{method:'POST',...b,body:{}});
const contactsB=await api('/v1/crm/contacts',{...b});const dealsB=await api('/v1/crm/deals',{...b});
const leadContactsB=contactsB.filter(x=>x.custom_fields?.modoLeadId==='11111111-1111-4111-8111-111111111111');const leadDealsB=dealsB.filter(x=>x.metadata?.marketingLeadId==='11111111-1111-4111-8111-111111111111');
assert(leadContactsB.length===1&&leadDealsB.length===1,'same upstream lead id is isolated per workspace');assert(leadContactsB[0].id!==leadContactsA[0].id&&leadDealsB[0].id!==leadDealsA[0].id,'tenant records never share IDs');
await api('/v1/crm/deals',{token:a.token,workspace:b.workspace,expect:403});
const learnA=await api(`/v1/marketing/commercial/projects/${projectA}/learning`,{...a});const learnB=await api(`/v1/marketing/commercial/projects/${projectB}/learning`,{...b});
assert(learnA.crm.opportunities===1&&learnB.crm.opportunities===1,'learning remains tenant-scoped');assert(learnA.attribution.causalityClaimed===false&&learnB.attribution.causalityClaimed===false,'hardening preserves conservative attribution');
const status=await api('/v1/marketing/status',{...a});assert(status.externalCampaignActivation===false,'external campaign activation remains disabled');
console.log(JSON.stringify({ok:true,concurrency:{contacts:leadContactsA.length,deals:leadDealsA.length},qualityGate:{blocked:gate.blockers.map(x=>x.code)},tenantIsolation:true,externalCampaignActivation:status.externalCampaignActivation},null,2));
