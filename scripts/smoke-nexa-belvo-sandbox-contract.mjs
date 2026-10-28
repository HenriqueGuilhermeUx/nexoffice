import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {
 BELVO_PF_SANDBOX_MOCKBANK,buildBelvoPfSandboxWidgetUrl,
 newBelvoPfSandboxExternalId,parseBelvoPfSandboxWebhook,
 requireBelvoPfSandboxGate,verifyBelvoPfSandboxWebhookBearer
} from '../packages/integrations/src/personal-belvo-sandbox-contract.ts';

const sandbox={NEX_PERSONAL_PREVIEW:'true',BELVO_ENV:'sandbox',BELVO_SANDBOX_ENABLED:'true',NEXOFFICE_DATABASE_SCOPE:'nex-personal-preview',NEXOFFICE_EXTERNAL_ACTIONS:'false'};
const externalId=newBelvoPfSandboxExternalId();
const linkId='12345678-1234-1234-1234-123456789abc';
const eventId='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const mapping={externalId,linkId,ownerUserRef:'synthetic-pf-user'};
const payload={webhook_id:eventId,webhook_type:'ACCOUNTS',webhook_code:'historical_update',external_id:externalId,link_id:linkId,data:{account_number:'NEVER_EXPOSE'}};

test('fail-closed sandbox gate',()=>{
 assert.doesNotThrow(()=>requireBelvoPfSandboxGate(sandbox));
 for(const key of Object.keys(sandbox))assert.throws(()=>requireBelvoPfSandboxGate({...sandbox,[key]:'wrong'}));
 assert.throws(()=>requireBelvoPfSandboxGate({}));
});
test('hosted widget can launch only sandbox mockbank with opaque correlation',()=>{
 const url=new URL(buildBelvoPfSandboxWidgetUrl({accessToken:'fake.access.token',externalId},sandbox));
 assert.equal(url.origin,'https://widget.belvo.io');
 assert.equal(url.searchParams.get('institutions'),BELVO_PF_SANDBOX_MOCKBANK);
 assert.equal(url.searchParams.get('access_mode'),'single');
 assert.equal(url.searchParams.get('locale'),'pt');
 assert.equal(url.searchParams.get('external_id'),externalId);
 assert.ok(!url.href.includes('email')&&!url.href.includes('cpf'));
 assert.throws(()=>buildBelvoPfSandboxWidgetUrl({accessToken:'fake.access.token',externalId:'user@example.com'},sandbox));
 assert.throws(()=>buildBelvoPfSandboxWidgetUrl({accessToken:'fake.access.token',externalId},{...sandbox,BELVO_ENV:'production'}));
});
test('Belvo aggregation uses explicit bearer auth, not invented HMAC signature',()=>{
 const secret='s'.repeat(48);
 assert.equal(verifyBelvoPfSandboxWebhookBearer('Bearer '+secret,secret,sandbox),true);
 assert.equal(verifyBelvoPfSandboxWebhookBearer('Bearer '+secret+'x',secret,sandbox),false);
 assert.equal(verifyBelvoPfSandboxWebhookBearer('Signature '+secret,secret,sandbox),false);
 assert.equal(verifyBelvoPfSandboxWebhookBearer('Bearer '+secret,secret,{...sandbox,NEX_PERSONAL_PREVIEW:'false'}),false);
 assert.equal(verifyBelvoPfSandboxWebhookBearer(undefined,secret,sandbox),false);
});
test('webhook requires trusted owner/link correlation and drops financial payload',()=>{
 const result=parseBelvoPfSandboxWebhook(payload,mapping,sandbox);
 assert.deepEqual(result,{eventId,linkId,ownerUserRef:'synthetic-pf-user',resource:'ACCOUNTS',code:'historical_update'});
 assert.equal(JSON.stringify(result).includes('NEVER_EXPOSE'),false);
 assert.throws(()=>parseBelvoPfSandboxWebhook({...payload,external_id:'pf_sbx_1234567890123456'},mapping,sandbox));
 assert.throws(()=>parseBelvoPfSandboxWebhook({...payload,link_id:eventId},mapping,sandbox));
 assert.throws(()=>parseBelvoPfSandboxWebhook(payload,{...mapping,ownerUserRef:''},sandbox));
});
test('module remains disconnected from public PF API and no HTTP side effects',()=>{
 const api=readFileSync('apps/api/src/server-personal.ts','utf8');
 const module=readFileSync('packages/integrations/src/personal-belvo-sandbox-contract.ts','utf8');
 assert.ok(!api.includes('personal-belvo-sandbox-contract'));
 assert.doesNotMatch(module,/\bfetch\(|\bapp\.(?:post|get|put|patch|delete)\(|\bquery\(/);
 assert.doesNotMatch(module,/BELVO_SANDBOX_SECRET_(?:ID|PASSWORD)/);
});
