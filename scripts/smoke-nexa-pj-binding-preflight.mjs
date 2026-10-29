// Ephemeral CI-only end-to-end checks for the PJ read-only bridge.
// Never runs against a remote API or database. No sessions or financial rails.
import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
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
async function readCurrentWorkspace(token,workspaceId){
  const response=await fetch(base+'/v1/platform/nexa-pj/connection-preflight',{
    headers:token?{'authorization':'Bearer '+token,'x-workspace-id':workspaceId}:{'x-workspace-id':workspaceId}
  });
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
// The actual browser must use a NexOffice-authenticated user session from
// the current tenant, not the private key used for the operator backchannel.
const nexofficeUserId=sql(`SELECT user_id FROM external_identities
  WHERE workspace_id='${workspaceId}'::uuid AND provider='nexa'
  AND user_id IS NOT NULL LIMIT 1`);
assert.match(nexofficeUserId,/^[0-9a-f-]{36}$/i);
const browserToken=randomBytes(32).toString('base64url');
const tokenHash=createHash('sha256').update(browserToken).digest('hex');
sql(`INSERT INTO auth_sessions(user_id,token_hash,expires_at)
 VALUES ('${nexofficeUserId}'::uuid,'${tokenHash}',now()+interval '1 hour')`);
assert.equal((await readCurrentWorkspace('',workspaceId)).status,401,
  'anonymous browsers cannot inspect Nexa PJ link state');
// An expired independently authenticated session cannot inspect PJ readiness.
const expiredToken=randomBytes(32).toString('base64url');
const expiredHash=createHash('sha256').update(expiredToken).digest('hex');
sql(`INSERT INTO auth_sessions(user_id,token_hash,expires_at)
 VALUES ('${nexofficeUserId}'::uuid,'${expiredHash}',now()-interval '1 minute')`);
assert.equal((await readCurrentWorkspace(expiredToken,workspaceId)).status,401,
  'expired browser session must not inspect the PJ workspace');
assert.equal((await readCurrentWorkspace('bad-token',workspaceId)).status,401,
  'invalid bearer tokens cannot inspect corporate link state');
const beforeBinding=await readCurrentWorkspace(browserToken,workspaceId);
assert.equal(beforeBinding.status,200,JSON.stringify(beforeBinding.data));
assert.equal(beforeBinding.data.structuralBindingPresent,false,
  'legacy Nexa origin cannot impersonate Nexa PJ in the browser');

// An independently authenticated user may belong to multiple workspaces,
// but the current workspace must never inherit another company's identity.
const otherMerchantId=randomUUID();
const secondProvision=await call('/v1/platform/provision',{
  sourceProduct:'nexa',externalWorkspaceRef:otherMerchantId,
  businessName:'Outra Empresa CI NexOffice',ownerEmail:email,
  externalUserSubject:randomUUID(),
},{'x-nexoffice-key':legacyKey});
assert.equal(secondProvision.status,200,JSON.stringify(secondProvision.data));
const otherWorkspaceId=secondProvision.data.workspace.id;
const otherView=await readCurrentWorkspace(browserToken,otherWorkspaceId);
assert.equal(otherView.status,200,JSON.stringify(otherView.data));
assert.equal(otherView.data.structuralBindingPresent,false,
  'member of another company must never inherit a PJ binding');
assert.equal((await readCurrentWorkspace(browserToken,randomUUID())).status,403,
  'users cannot probe a workspace where they are not a member');

const original=await call(path,{merchantId,representativeUserId,workspaceId},auth);
assert.equal(original.data.bindingMatches,false,'legacy nexa origin may not be treated as nexa-pj');
const genericHandoffDenied=await call('/v1/platform/handoff',{
  sourceProduct:'nexa-pj',externalWorkspaceRef:merchantId,
  externalUserSubject:representativeUserId,email,
},{'x-nexoffice-key':legacyKey});
assert.equal(genericHandoffDenied.status,400,
  'legacy generic federation must never issue a Nexa PJ session');
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
const browserLinked=await readCurrentWorkspace(browserToken,workspaceId);
assert.equal(browserLinked.status,200,JSON.stringify(browserLinked.data));
assert.equal(browserLinked.data.structuralBindingPresent,true,
  'current authenticated member can see company structural readiness');
for(const key of [
  'companyKybApproved','legalRepresentationVerified','nexaAccountAuthenticated',
  'corporateWalletConnected','financialAccess','balancesVisible','pixEnabled',
  'cryptoEnabled','ssoAvailable','handoffTokenIssued','externalEffect'
])assert.equal(browserLinked.data[key],false,key+' must remain denied');
assert.equal((await readCurrentWorkspace(expiredToken,workspaceId)).status,401,
  'expired session must stay denied even after the PJ structural link appears');
assert.equal(browserLinked.data.workspaceMembershipVerifiedByNexOffice,true);
for(const pii of [merchantId,representativeUserId,workspaceId,nexofficeUserId,browserToken])
  assert.equal(JSON.stringify(browserLinked.data).includes(pii),false,
    'readiness must not expose user, company, tenant or token data');
// Finance Hub readiness must remain deny-by-default, even when a PJ
// structural binding exists in this isolated test database.
async function readFinanceHub(token,tenant){
  const response=await fetch(base+'/v1/platform/nexa-pj/finance-hub/readiness',{
    headers:{...(token?{'authorization':'Bearer '+token}:{}),'x-workspace-id':tenant},
  });
  return {status:response.status,data:await response.json()};
}
async function readWalletReadiness(token,tenant){
 const response=await fetch(base+'/v1/platform/nexa-pj/wallet/readiness',{
  headers:{...(token?{'authorization':'Bearer '+token}:{}),'x-workspace-id':tenant},
 });
 return {status:response.status,data:await response.json()};
}
assert.equal((await readWalletReadiness('',workspaceId)).status,401,'wallet readiness requires auth');
const walletReadiness=await readWalletReadiness(browserToken,workspaceId);
assert.equal(walletReadiness.status,200);
assert.equal(walletReadiness.data.workspaceId,workspaceId);
assert.equal(walletReadiness.data.corporateWalletVerified,false);
assert.equal(walletReadiness.data.balancesVisible,false);
assert.equal(walletReadiness.data.transactionsVisible,false);
assert.equal(walletReadiness.data.transfersEnabled,false);
assert.equal(walletReadiness.data.balanceUsdc,null);
assert.equal(walletReadiness.data.walletAddress,null);
assert.equal((await readFinanceHub('',workspaceId)).status,401,'finance hub anonymous access');
const financeHub=await readFinanceHub(browserToken,workspaceId);
assert.equal(financeHub.status,200,'authenticated finance hub readiness');
assert.equal(financeHub.data.gateEvaluation.decision,'deny');
assert.equal(financeHub.data.gateEvaluation.defaultPolicy,'fail_closed');
assert.equal(financeHub.data.gateEvaluation.evidenceAccepted,false);
assert.equal(financeHub.data.gateEvaluation.checks.find(c=>c.id==='workspace_membership').passed,true);
for(const gate of financeHub.data.gateEvaluation.checks.filter(c=>c.id!=='workspace_membership'))
  assert.equal(gate.passed,false,gate.id+' must stay denied');
for(const key of ['aggregatedBalance','investmentsTotal','outstandingDebt'])
  assert.equal(financeHub.data[key],null,key+' must not invent financial values');
for(const key of ['paymentInitiationEnabled','walletProvisioningEnabled','agenticActionsEnabled','externalEffectsEnabled'])
  assert.equal(financeHub.data[key],false,key+' must remain disabled');
assert.ok(financeHub.data.sources.every(s=>s.status==='not_connected'&&s.dataAvailable===false));
assert.equal(financeHub.data.sources.find(s=>s.id==='open-finance')?.status,'not_connected','disabled adapter must not open provider connection');
assert.equal(financeHub.data.sources.find(s=>s.id==='open-finance')?.consent,'not_granted');
for(const pii of [merchantId,representativeUserId,workspaceId,nexofficeUserId,browserToken])
  assert.equal(JSON.stringify(financeHub.data).includes(pii),false,'finance hub must not expose corporate identifiers or tokens');

const unrelatedAfterBinding=await readCurrentWorkspace(browserToken,otherWorkspaceId);
assert.equal(unrelatedAfterBinding.data.structuralBindingPresent,false,
  'one company binding cannot appear in another workspace');

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
assert.equal((await readFinanceHub(browserToken,workspaceId)).status,403,'revoked workspace must not read finance hub');
const revokedBrowser=await readCurrentWorkspace(browserToken,workspaceId);
assert.equal(revokedBrowser.status,403,
  'revoked member must not inspect even the company connection state');
const revoked=await call(path,{merchantId,representativeUserId,workspaceId},auth);
assert.equal(revoked.data.bindingMatches,false,'revoked membership must invalidate preflight');

// Revoking the independently authenticated session must deny access regardless
// of company binding or membership state. All changes are local CI-only.
sql(`DELETE FROM auth_sessions WHERE token_hash='${tokenHash}'`);
assert.equal((await readCurrentWorkspace(browserToken,otherWorkspaceId)).status,401,
  'revoked session must not access even an otherwise authorized workspace');
assert.equal((await readCurrentWorkspace(browserToken,workspaceId)).status,401,
  'revoked session must not inspect any corporate linkage');
console.log('PASS: dedicated PJ backchannel and tenant-scoped browser preflight, PF/PJ and cross-workspace isolation, revocation, no tokens, money or corporate authority.');
