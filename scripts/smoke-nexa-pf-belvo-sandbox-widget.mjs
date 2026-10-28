import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {
 BELVO_SANDBOX_HOST,BELVO_MOCKBANK,widgetReady,newSandboxExternalId,
 buildSandboxTokenPayload,buildSandboxWidgetUrl,createSandboxWidgetAccess,
 authorizedSandboxWebhook,parseSandboxWebhook
} from '../apps/api/dist/belvo-sandbox-contract.js';

const sandbox={
 NEX_PERSONAL_PREVIEW:'true',BELVO_ENV:'sandbox',
 BELVO_SANDBOX_ENABLED:'true',BELVO_SANDBOX_WIDGET_ENABLED:'true',
 BELVO_SANDBOX_SECRET_ID:'fake-id-for-test',BELVO_SANDBOX_SECRET_PASSWORD:'fake-password-for-test',
 BELVO_SANDBOX_MOCK_CPF:'76109277673',BELVO_SANDBOX_MOCK_NAME:'Ralph Bragg',
 BELVO_SANDBOX_TERMS_URL:'https://example.org/terms',
 NEX_PERSONAL_PREVIEW_SELF_ORIGIN:'https://nex-personal-preview-api.onrender.com',
 BELVO_SANDBOX_WEBHOOK_BEARER:'a-really-long-unique-mock-secret-for-testing-only'
};
const ext='nexa_pf_sb_'+'d'.repeat(32);
test('sandbox cannot enable widget without mock identification, webhook secret and exact preview origin',()=>{
 assert.equal(widgetReady(sandbox),true);
 for(const patch of [
  {NEX_PERSONAL_PREVIEW:'false'}, {BELVO_ENV:'production'},
  {BELVO_SANDBOX_ENABLED:'false'}, {BELVO_SANDBOX_WIDGET_ENABLED:'false'},
  {BELVO_SANDBOX_SECRET_ID:''},{BELVO_SANDBOX_SECRET_PASSWORD:''},
  {BELVO_SANDBOX_MOCK_CPF:'1111'}, {BELVO_SANDBOX_MOCK_NAME:''},
  {BELVO_SANDBOX_TERMS_URL:'http://localhost/'},
  {NEX_PERSONAL_PREVIEW_SELF_ORIGIN:'https://other.com/path'},
  {BELVO_SANDBOX_WEBHOOK_BEARER:'short'}
 ])assert.equal(widgetReady({...sandbox,...patch}),false);
});
test('OFDA widget payload contains minimal mock data, exact documented scopes and callbacks',()=>{
 const payload=buildSandboxTokenPayload(sandbox,ext);
 assert.equal(payload.id,sandbox.BELVO_SANDBOX_SECRET_ID);
 assert.equal(payload.password,sandbox.BELVO_SANDBOX_SECRET_PASSWORD);
 assert.equal(payload.scopes,'read_institutions,write_links,read_consents,write_consents,write_consent_callback,delete_consents');
 assert.deepEqual(payload.fetch_resources,['ACCOUNTS','TRANSACTIONS','OWNERS']);
 assert.equal(payload.widget.openfinance_feature,'consent_link_creation');
 assert.deepEqual(payload.widget.consent.permissions,['REGISTER','ACCOUNTS','CREDIT_CARDS','CREDIT_OPERATIONS']);
 assert.equal(payload.widget.consent.identification_info[0].type,'CPF');
 assert.equal(payload.widget.callback_urls.success,sandbox.NEX_PERSONAL_PREVIEW_SELF_ORIGIN+'/?belvo_sandbox_result=success');
 assert.ok(!JSON.stringify(payload).includes('trynexa.com.br/pj'));
 assert.match(newSandboxExternalId(),/^nexa_pf_sb_[0-9a-f]{32}$/);
});
test('fetch issues only one sandbox token request and refuses to surface refresh token',async()=>{
 let request;
 const url=await createSandboxWidgetAccess(sandbox,ext,async(uri,options)=>{
  request={uri,options};return {status:200,json:async()=>({access:'a'.repeat(80),refresh:'secret-refresh-never-return'})};
 });
 assert.equal(request.uri,BELVO_SANDBOX_HOST+'/api/token/');
 assert.equal(request.options.method,'POST');
 assert.equal(request.options.redirect,'error');
 assert.equal(JSON.parse(request.options.body).widget.consent.identification_info[0].number,sandbox.BELVO_SANDBOX_MOCK_CPF);
 assert.ok(!url.includes('secret-refresh'));
 const parsed=new URL(url);
 assert.equal(parsed.hostname,'widget.belvo.io');
 assert.equal(parsed.searchParams.get('institutions'),BELVO_MOCKBANK);
 assert.equal(parsed.searchParams.get('access_mode'),'single');
 assert.equal(parsed.searchParams.get('external_id'),ext);
 assert.equal(parsed.searchParams.get('country_codes'),'BR');
});
test('no widget key or provider error message leaked on failures',async()=>{
 await assert.rejects(createSandboxWidgetAccess({...sandbox,BELVO_ENV:'production'},ext,async()=>{throw Error('must not call');}),e=>e.code==='disabled');
 await assert.rejects(createSandboxWidgetAccess(sandbox,ext,async()=>{throw Error('password: foo');}),e=>e.code==='provider_unavailable'&&!e.message.includes('foo'));
 await assert.rejects(createSandboxWidgetAccess(sandbox,ext,async()=>({status:401})),e=>e.code==='provider_rejected');
 assert.throws(()=>buildSandboxWidgetUrl('bad',ext),e=>e.code==='invalid_response');
});
test('aggregation webhooks are bearer authenticated, do not claim HMAC signed',()=>{
 const token='Bearer '+sandbox.BELVO_SANDBOX_WEBHOOK_BEARER;
 assert.equal(authorizedSandboxWebhook(sandbox,token),true);
 assert.equal(authorizedSandboxWebhook(sandbox,'Bearer something-else'),false);
 assert.equal(authorizedSandboxWebhook(sandbox,'Bearer '+sandbox.BELVO_SANDBOX_WEBHOOK_BEARER+'x'),false);
 assert.equal(authorizedSandboxWebhook({...sandbox,BELVO_ENV:'production'},token),false);
 assert.equal(authorizedSandboxWebhook(sandbox,'Basic '+sandbox.BELVO_SANDBOX_WEBHOOK_BEARER),false);
});
test('webhook strips all PII, balances, and unverified resource payloads',()=>{
 const event=parseSandboxWebhook({
  webhook_id:'test-event-123',external_id:ext,link_id:'link-id-123',
  webhook_type:'ACCOUNTS',webhook_code:'historical_update',process_type:'historical_update',
  data:{accountNumber:'123456',balance:'999999',customer:'secret'}});
 assert.deepEqual(event,{webhookId:'test-event-123',externalId:ext,
  linkId:'link-id-123',resource:'ACCOUNTS',event:'historical_update',processType:'historical_update'});
 assert.ok(!JSON.stringify(event).includes('123456'));
 assert.throws(()=>parseSandboxWebhook({...event,webhook_id:'event',external_id:'someone@example.com'}));
});
test('preview migration and routes retain fail-closed safety boundaries',()=>{
 const api=readFileSync('apps/api/src/routes-belvo-sandbox-preview.ts','utf8');
 const migrations=readFileSync('apps/api/src/personal-preview-migrations.ts','utf8');
 const sql=readFileSync('infra/postgres/050_nexa_pf_belvo_sandbox_event_inbox.sql','utf8');
 assert.match(migrations,/050_nexa_pf_belvo_sandbox_event_inbox.sql/);
 assert.match(api,/const actor=await owner\(req\)/);
 assert.match(api,/confirmSandbox/);
 assert.match(api,/authorizedSandboxWebhook/);
 assert.match(api,/ON CONFLICT\(webhook_id\) DO NOTHING/);
 assert.match(sql,/pending_provider_verification/);
 assert.doesNotMatch(api,/status='active'/);
 assert.doesNotMatch(api,/paymentInitiated:true/);
 assert.doesNotMatch(api,/Privy|MetaMask|WalletConnect/);
});
