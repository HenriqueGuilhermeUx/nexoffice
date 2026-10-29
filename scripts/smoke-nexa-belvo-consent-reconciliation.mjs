import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {requiresSandboxConsentRecheck,getSandboxConsentReadStatus}
 from '../apps/api/dist/belvo-sandbox-consent-state.js';

test('revocations, expiry and scope changes only suspend, never approve a sandbox consent',()=>{
 for(const code of [
  'consent_rejected','openfinance_consent_expired',
  'openfinance_consent_about_to_expire',
  'openfinance_consent_with_unrecoverable_resources',
  'openfinance_consent_with_temporarily_unavailable_resources',
  'openfinance_consent_expiration_changed'
 ]){
  assert.equal(requiresSandboxConsentRecheck('CONSENT',code),true,code);
 }
 assert.equal(requiresSandboxConsentRecheck('LINKS','invalid_credentials'),true);
 for(const code of ['historical_update','new_transactions_available','consent_authorised','']){
  assert.equal(requiresSandboxConsentRecheck('ACCOUNTS',code),false);
  assert.equal(requiresSandboxConsentRecheck('CONSENT',code),false);
 }
 assert.equal(requiresSandboxConsentRecheck('PAYMENTS','consent_rejected'),false);
});
test('verified proof is fresh only for 15 minutes and only with explicit verified state',()=>{
 const now=new Date('2026-10-28T20:00:00Z');
 assert.equal(getSandboxConsentReadStatus(null,now),'not_verified');
 assert.equal(getSandboxConsentReadStatus({
  verification_status:'verified_authorized',verified_at:'2026-10-28T19:46:00Z'
 },now),'verified_recent');
 assert.equal(getSandboxConsentReadStatus({
  verification_status:'verified_authorized',verified_at:'2026-10-28T19:44:59Z'
 },now),'verification_stale');
 assert.equal(getSandboxConsentReadStatus({
  verification_status:'needs_reverification',verified_at:'2026-10-28T19:59:00Z'
 },now),'review_required');
 assert.equal(getSandboxConsentReadStatus({
  verification_status:'verified_authorized',verified_at:'2030-01-01T00:00:00Z'
 },now),'verification_stale');
 assert.equal(getSandboxConsentReadStatus({
  verification_status:'verified_authorized',verified_at:'corrupt'
 },now),'verification_stale');
});
test('authenticated PF status, expired events and null external_id require a known verified link',()=>{
 const route=readFileSync('apps/api/src/routes-belvo-sandbox-preview.ts','utf8');
 const sql=readFileSync('infra/postgres/052_nexa_pf_belvo_consent_reconciliation.sql','utf8');
 const migrator=readFileSync('apps/api/src/personal-preview-migrations.ts','utf8');
 assert.match(migrator,/052_nexa_pf_belvo_consent_reconciliation.sql/);
 assert.match(sql,/needs_reverification/);
 assert.match(route,/consentReview:\{status:state/);
 assert.match(route,/const actor=await owner\(req\)/);
 assert.match(route,/getSandboxConsentReadStatus/);
 assert.match(route,/JOIN nex_personal.belvo_sandbox_verified_consents v ON v.attempt_id=a.id/);
 assert.match(route,/v.provider_link_ref::text=\$1/);
 assert.match(route,/requiresSandboxConsentRecheck\(item.resource,item.event\)/);
 assert.match(route,/ON CONFLICT\(webhook_id\) DO NOTHING RETURNING webhook_id/);
 assert.match(route,/if\(received.length&&requiresSandboxConsentRecheck/);
 assert.match(route,/verification_status='needs_reverification'/);
 assert.match(route,/WHERE a.owner_user_id=\$1 AND a.status='widget_ready'/);
 assert.match(route,/verifyBelvoSandboxConsent/);
 for(const str of ['nex_personal.accounts','nex_personal.transactions','paymentInitiationProvider','Privy']){
  assert.equal(route.includes(str),false,'forbidden account/payment/wallet operation: '+str);
 }
});
