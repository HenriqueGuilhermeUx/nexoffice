import assert from 'node:assert/strict';
import {evaluateCorporateReadConsent,DisabledOpenFinanceConnector} from '../apps/api/dist/nexa-pj-finance-connector.js';
const now=new Date('2026-10-28T12:00:00Z');
const ctx={workspaceId:'company-A',representativeUserId:'member-A',verifiedCorporateIdentityRef:'kyb-A',consentRef:'consent-A',requestedScopes:['accounts.read']};
const record={...ctx,providerId:'provider-A',scopes:['accounts.read','balances.read'],status:'active',expiresAt:'2026-10-29T12:00:00Z'};
assert.equal(evaluateCorporateReadConsent(ctx,record,true,'provider-A',now),'allow_read');
assert.equal(evaluateCorporateReadConsent(ctx,record,true,'provider-B',now),'deny','provider mismatch must fail');
for(const evidence of [null,{...record,status:'revoked'},{...record,status:'expired'},{...record,status:'pending'},{...record,workspaceId:'company-B'},{...record,representativeUserId:'member-B'},{...record,verifiedCorporateIdentityRef:'kyb-B'},{...record,consentRef:'other'},{...record,expiresAt:'2026-10-27T12:00:00Z'},{...record,expiresAt:'invalid'}, {...record,scopes:['balances.read']}]){
 assert.equal(evaluateCorporateReadConsent(ctx,evidence,true,'provider-A',now),'deny');
}
assert.equal(evaluateCorporateReadConsent(ctx,record,true,'provider-A',now),'deny');
assert.equal(evaluateCorporateReadConsent({...ctx,requestedScopes:['payments.write']},{...record,scopes:['accounts.read','payments.write']},true,'provider-A',now),'deny','write scopes cannot be authorized through a read-only adapter');
assert.equal(evaluateCorporateReadConsent({...ctx,requestedScopes:['transfers.write']},{...record,scopes:['transfers.write']},true,'provider-A',now),'deny','transfers are not read-only scopes');
assert.equal(evaluateCorporateReadConsent({...ctx,requestedScopes:[]},record,true,'provider-A',now),'deny');
assert.equal(evaluateCorporateReadConsent({...ctx,requestedScopes:['payments.write']},record,true,'provider-A',now),'deny');
const disabled=new DisabledOpenFinanceConnector();
assert.equal(await disabled.getConnectionStatus(ctx),'not_connected');
await assert.rejects(()=>disabled.listBalances(ctx),/NOT_AUTHORIZED/);
console.log('PASS corporate Finance Hub consent policy, revoked and expired access, scope and tenant isolation');
