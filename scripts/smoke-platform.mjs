const base=process.env.SMOKE_API_URL||'http://127.0.0.1:4000';
const internalKey=process.env.NEXOFFICE_INTERNAL_KEY||'platform-smoke-key';
let token='';let workspace='';

const request=async(path,{method='GET',body,auth=false,internal=false}={})=>{
  const headers={'content-type':'application/json'};
  if(auth&&token)headers.authorization=`Bearer ${token}`;
  if(auth&&workspace)headers['x-workspace-id']=workspace;
  if(internal)headers['x-nexoffice-key']=internalKey;
  const r=await fetch(base+path,{method,headers,body:body!==undefined?JSON.stringify(body):undefined});
  const payload=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(payload)}`);
  return payload;
};
const assert=(value,message)=>{if(!value)throw new Error(`ASSERT: ${message}`)};

const health=await request('/v1/platform/health',{internal:true});
assert(health.status==='ok'&&health.capabilities.includes('provision'),'platform bridge health');

const provisionInput={
  sourceProduct:'nexjud',
  externalWorkspaceRef:'nexjud-office-smoke-001',
  businessName:'Escritório Jurídico Smoke',
  vertical:'legal',
  ownerEmail:'platform-owner@nexoffice.test',
  ownerName:'Platform Owner',
  externalUserSubject:'nexjud-user-smoke-001',
  entitlements:['addon.nexjud']
};

const first=await request('/v1/platform/provision',{method:'POST',internal:true,body:provisionInput});
assert(first.created===true,'first provision creates workspace');
assert(first.workspace?.id,'provision returns workspace');
assert(first.workspace.vertical==='legal','provision applies legal vertical');
assert(first.workspace.modules.includes('legal-pack'),'provision applies legal pack');
assert(first.inviteToken,'new external owner receives onboarding token');
const provisionedWorkspace=first.workspace.id;

const registration=await request('/v1/auth/register',{method:'POST',body:{name:'Platform Owner',email:provisionInput.ownerEmail,password:'SmokePass123!',inviteToken:first.inviteToken}});
token=registration.token;workspace=registration.workspace.id;
assert(workspace===provisionedWorkspace,'owner joins provisioned workspace');
const me=await request('/v1/auth/me',{auth:true});
const membership=me.workspaces.find(x=>x.id===workspace);
assert(membership?.role==='owner','provisioned user is workspace owner');

const second=await request('/v1/platform/provision',{method:'POST',internal:true,body:provisionInput});
assert(second.created===false,'repeat provision is idempotent');
assert(second.workspace.id===provisionedWorkspace,'repeat provision returns same workspace');
assert(second.userExists===true,'repeat provision recognizes existing NexOffice owner');

const exchange=await request('/v1/platform/session-exchange',{method:'POST',internal:true,body:{sourceProduct:'nexjud',externalWorkspaceRef:provisionInput.externalWorkspaceRef,externalUserSubject:provisionInput.externalUserSubject,email:provisionInput.ownerEmail}});
assert(exchange.token,'session exchange returns NexOffice session');
assert(exchange.workspace.id===provisionedWorkspace,'session exchange resolves correct workspace');
assert(exchange.workspace.role==='owner','session exchange preserves owner role');

const exchangeAgain=await request('/v1/platform/session-exchange',{method:'POST',internal:true,body:{sourceProduct:'nexjud',externalWorkspaceRef:provisionInput.externalWorkspaceRef,externalUserSubject:provisionInput.externalUserSubject,email:provisionInput.ownerEmail}});
assert(exchangeAgain.token&&exchangeAgain.workspace.id===provisionedWorkspace,'repeat exchange reuses bound external identity');

console.log(JSON.stringify({ok:true,workspace:provisionedWorkspace,source:'nexjud',vertical:'legal',idempotent:true,sessionExchange:true},null,2));
