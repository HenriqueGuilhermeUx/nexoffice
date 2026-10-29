import assert from 'node:assert/strict';
import {evaluateCorporateReadConsent,evaluateVerifiedCorporateReadConsent,authorizeCorporateRead,authorizeCorporateReadWithinDeadline,DisabledCorporateConsentVerifier,DisabledOpenFinanceConnector} from '../apps/api/dist/nexa-pj-finance-connector.js';
const now=new Date('2026-10-28T12:00:00Z');
const ctx={workspaceId:'company-A',representativeUserId:'member-A',verifiedCorporateIdentityRef:'kyb-A',consentRef:'consent-A',requestedScopes:['accounts.read']};
const record={...ctx,providerId:'provider-A',scopes:['accounts.read','balances.read'],status:'active',expiresAt:'2026-10-29T12:00:00Z'};
assert.equal(evaluateCorporateReadConsent(ctx,record,true,'provider-A',now),'allow_read');
assert.equal(evaluateCorporateReadConsent(ctx,record,true,'provider-B',now),'deny','provider mismatch must fail');
for(const evidence of [null,{...record,status:'revoked'},{...record,status:'expired'},{...record,status:'pending'},{...record,workspaceId:'company-B'},{...record,representativeUserId:'member-B'},{...record,verifiedCorporateIdentityRef:'kyb-B'},{...record,consentRef:'other'},{...record,expiresAt:'2026-10-27T12:00:00Z'},{...record,expiresAt:'invalid'}, {...record,scopes:['balances.read']}]){
 assert.equal(evaluateCorporateReadConsent(ctx,evidence,true,'provider-A',now),'deny');
}
assert.equal(evaluateCorporateReadConsent(ctx,record,false,'provider-A',now),'deny');
assert.equal(evaluateCorporateReadConsent({...ctx,requestedScopes:['payments.write']},{...record,scopes:['accounts.read','payments.write']},true,'provider-A',now),'deny','write scopes cannot be authorized through a read-only adapter');
assert.equal(evaluateCorporateReadConsent({...ctx,requestedScopes:['transfers.write']},{...record,scopes:['transfers.write']},true,'provider-A',now),'deny','transfers are not read-only scopes');
assert.equal(evaluateCorporateReadConsent({...ctx,requestedScopes:[]},record,true,'provider-A',now),'deny');
assert.equal(evaluateCorporateReadConsent({...ctx,requestedScopes:['payments.write']},record,true,'provider-A',now),'deny');
const proof={consent:record,verifiedBy:'trusted_provider_backchannel',verifiedAt:'2026-10-28T11:58:00Z',providerSignatureValidated:true,revocationChecked:true};
assert.equal(evaluateVerifiedCorporateReadConsent(ctx,proof,true,'provider-A',now),'allow_read');
for(const invalid of [null,{...proof,verifiedBy:'browser'},{...proof,providerSignatureValidated:false},{...proof,revocationChecked:false},{...proof,verifiedAt:'2026-10-28T11:54:00Z'},{...proof,verifiedAt:'2026-10-28T12:01:00Z'}, {...proof,consent:{...record,status:'revoked'}}])
  assert.equal(evaluateVerifiedCorporateReadConsent(ctx,invalid,true,'provider-A',now),'deny');
assert.equal(evaluateVerifiedCorporateReadConsent(ctx,proof,false,'provider-A',now),'deny');
assert.equal(evaluateVerifiedCorporateReadConsent(ctx,proof,true,'provider-B',now),'deny');
assert.equal(await authorizeCorporateRead(new DisabledCorporateConsentVerifier(),ctx,'provider-A',true,now),'deny');
assert.equal(await authorizeCorporateRead({verify:async()=>{throw Error('provider timeout')}},ctx,'provider-A',true,now),'deny');
assert.equal(await authorizeCorporateRead({verify:async()=>proof},ctx,'provider-A',true,now),'allow_read');
assert.equal(await authorizeCorporateRead({verify:async()=>proof},ctx,'provider-B',true,now),'deny');
assert.equal(await authorizeCorporateRead({verify:async()=>proof},ctx,'provider-A',false,now),'deny');
let verifierCalls=0;
const countingVerifier={verify:async()=>{verifierCalls++;return proof}};
for(const invalid of [
  {...ctx,requestedScopes:['payments.write']},
  {...ctx,requestedScopes:['balances.read','transfers.write']},
  {...ctx,requestedScopes:[]},
  {...ctx,workspaceId:''},
  {...ctx,representativeUserId:''},
  {...ctx,consentRef:''},
  {...ctx,verifiedCorporateIdentityRef:''},
]){
  assert.equal(await authorizeCorporateRead(countingVerifier,invalid,'provider-A',true,now),'deny');
}
assert.equal(await authorizeCorporateRead(countingVerifier,ctx,'provider-A',false,now),'deny');
assert.equal(verifierCalls,0,'invalid read authorization must not contact provider');
assert.equal(await authorizeCorporateReadWithinDeadline({verify:async()=>new Promise(()=>{})},ctx,'provider-A',true,10,now),'deny','provider timeout must fail closed');
assert.equal(await authorizeCorporateReadWithinDeadline({verify:async()=>proof},ctx,'provider-A',true,100,now),'allow_read');
assert.equal(await authorizeCorporateReadWithinDeadline({verify:async()=>proof},ctx,'provider-A',true,0,now),'deny');
const disabled=new DisabledOpenFinanceConnector();
assert.equal(await disabled.getConnectionStatus(ctx),'not_connected');
await assert.rejects(()=>disabled.listBalances(ctx),/NOT_AUTHORIZED/);
console.log('PASS corporate Finance Hub consent policy, revoked and expired access, scope and tenant isolation');
