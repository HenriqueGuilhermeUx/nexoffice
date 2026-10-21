// Ephemeral CI-only end-to-end checks for the PJ read-only bridge.
// Never runs against a remote API or database. No sessions or financial rails.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const base='http://127.0.0.1:4000';
const expectedUrl='postgresql://nexoffice:nexoffice@127.0.0.1:5432/nexoffice';
if(process.env.DATABASE_URL!==expectedUrl ||
   process.env.NEXA_PJ_BINDING_PREFLIGHT_KEY!=='ci-only-nexa-pj-separate-binding-key-2026' ||
   process.env.NEXOFFICE_EXTERNAL_ACTIONS!=='false'){
  throw Error('Refusing PJ integration smoke outside isolated local CI');
}
const merchantId=randomUUID(),representativeUserId=randomUUID();
const email='pj-bridge-'+merchantId.slice(0,8)+'@nexoffice.test';
const legacyKey=process.env.NEXOFFICE_INTERNAL_KEY;
const bridgeKey=process.env.NEXA_PJ_BINDING_PREFLIGHT_KEY;
function sql(statement) {
  return execFileSync('psql',[expectedUrl,'-v','ON_ERROR_STOP=1','-At','-c',statement],{encoding:'utf8'}).trim();
}
async function call(path,body,headers={}) {
  const response=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
  return {status:response.status,data:await response.json()};
}
const path='/v1/platform/nexa-pj/binding-preflight';
const candidate={merchantId,representativeUserId,workspaceId:randomUUID()};
const unauthorized=await call(path,candidate);
assert.equal(unauthorized.status,401,'anonymous caller must be denied');
const legacyCredential=await call(path,candidate,{'x-nexoffice-key':legacyKey});
assert.equal(legacyCredential.status,401,'generic platform key must not authorize PJ binding');
const wrong=await call(path,candidate,{'x-nexa-pj-binding-key':'not-the-key'});
assert.equal(wrong.status,401,'incorrect PJ key must be denied');
const auth={'x-nexa-pj-binding-key':bridgeKey};
const malformed=await call(path,{...candidate,workspaceId:'malformed'},auth);
assert.equal(malformed.status,400,'workspace must be canonical UUID');
const withExtra=await call(path,{...candidate,approved:true},auth);
assert.equal(withExtra.status,400,'client claims must be rejected');
const absent=await call(path,candidate,auth);
assert.equal(absent.status,200);
assert.equal(absent.data.bindingMatches,false,'unknown binding must not match');

const provision=await call('/v1/platform/provision',{
  sourceProduct:'nexa',externalWorkspaceRef:merchantId,
  businessName:'Nexa PJ CI Isolada',ownerEmail:email,ownerName:'Nexa PJ CI',
  externalUserSubject:representativeUserId,
},{'x-nexoffice-key':legacyKey});
assert.equal(provision.status,200,JSON.stringify(provision.data));
const workspaceId=provision.data.workspace.id;
const original=await call(path,{merchantId,representativeUserId,workspaceId},auth);
assert.equal(original.data.bindingMatches,false,'legacy nexa origin may not be treated as nexa-pj');
const sourceDenied=await call('/v1/platform/provision',{
  sourceProduct:'nexa-pj',externalWorkspaceRef:merchantId,
  businessName:'Must fail',ownerEmail:email,externalUserSubject:representativeUserId,
},{'x-nexoffice-key':legacyKey});
assert.equal(sourceDenied.status,400,'generic bridge must not provision nexa-pj');

sql(`INSERT INTO workspace_origins(workspace_id,source_product,external_workspace_ref,mode)
VALUES ('${workspaceId}'::uuid,'nexa-pj','${merchantId}','addon')`);
sql(`INSERT INTO external_identities (workspace_id,user_id,provider,external_subject,external_tenant_ref)
SELECT '${workspaceId}'::uuid,user_id,'nexa-pj','${representativeUserId}','${merchantId}'
FROM external_identities
WHERE workspace_id='${workspaceId}'::uuid AND provider='nexa'
  AND external_subject='${representativeUserId}' AND user_id IS NOT NULL`);
const matched=await call(path,{merchantId,representativeUserId,workspaceId},auth);
assert.equal(matched.data.bindingMatches,true,'fully bound synthetic tenant should match');
for(const key of ['legalRepresentationVerified','pjApprovalVerified','ssoAvailable','financialAccess','sessionIssued']){
  assert.equal(matched.data[key],false,key+' must remain disabled even on structural match');
}
assert.deepEqual(Object.keys(matched.data).sort(),[
  'bindingMatches','financialAccess','legalRepresentationVerified',
  'pjApprovalVerified','sessionIssued','ssoAvailable',
].sort(),'no workspace, identity or token data may be returned');

for(const different of [
  {merchantId,representativeUserId,workspaceId:randomUUID()},
  {merchantId:randomUUID(),representativeUserId,workspaceId},
  {merchantId,representativeUserId:randomUUID(),workspaceId},
]){
  const result=await call(path,different,auth);
  assert.equal(result.data.bindingMatches,false,'tenant/user/company mismatch must fail');
}
sql(`UPDATE workspace_members SET active=false WHERE workspace_id='${workspaceId}'::uuid`);
const revoked=await call(path,{merchantId,representativeUserId,workspaceId},auth);
assert.equal(revoked.data.bindingMatches,false,'revoked membership must invalidate preflight');

console.log('PASS: dedicated PJ key, strict request schema, legacy-source isolation, company/identity/tenant match, revoked membership, no session/financial access.');
