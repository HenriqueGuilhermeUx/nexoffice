import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {
 verifyBelvoSandboxConsent,BelvoVerificationError
} from '../apps/api/dist/belvo-sandbox-verification.js';
const env={
 NEX_PERSONAL_PREVIEW:'true',BELVO_ENV:'sandbox',
 BELVO_SANDBOX_ENABLED:'true',BELVO_SANDBOX_WIDGET_ENABLED:'true',
 BELVO_SANDBOX_SECRET_ID:'fake-secret-id',BELVO_SANDBOX_SECRET_PASSWORD:'fake-secret-password',
 BELVO_SANDBOX_MOCK_CPF:'76109277673',BELVO_SANDBOX_MOCK_NAME:'Mock Customer',
 BELVO_SANDBOX_TERMS_URL:'https://example.org/terms',
 NEX_PERSONAL_PREVIEW_SELF_ORIGIN:'https://nex-personal-preview-api.onrender.com',
 BELVO_SANDBOX_WEBHOOK_BEARER:'a-long-test-bearer-not-an-actual-production-secret'
};
const id='12000000-0000-4000-8000-000000000001';
const consentId='22000000-0000-4000-8000-000000000001';
const externalId='nexa_pf_sb_'+'c'.repeat(32);
const now=new Date('2026-10-28T20:00:00.000Z');
const input={externalId,linkId:id};
const link={id,institution:'ofmockbank_br_retail',external_id:externalId,status:'valid'};
const consent={id:consentId,link_id:id,belvo_institution_name:'ofmockbank_br_retail',
 document_number:env.BELVO_SANDBOX_MOCK_CPF,status:'AUTHORISED',
 expired_at:'2027-01-01T00:00:00.000Z',permissions:{ACCOUNTS:[{id:'test'}]}};
function provider({linkData=link,consents=[consent],count=consents.length,
 next=null,status=200}={}){
 const calls=[];
 const fetcher=async(url,opts)=>{
  calls.push({url,opts});
  return {ok:status===200,status,
   json:async()=>url.includes('/api/links/')
    ?linkData:{count,next,results:consents}};
 };
 return {calls,fetcher};
}
function rejectsCode(errorCode){
 return error=>error instanceof BelvoVerificationError&&error.code===errorCode;
}
test('exact mockbank link and valid account consent are verified only server to server',async()=>{
 const p=provider();
 const result=await verifyBelvoSandboxConsent(env,input,p.fetcher,now);
 assert.deepEqual(result,{
  verified:true,simulation:true,linkRef:id,consentRef:consentId,
  institution:'ofmockbank_br_retail',verifiedAt:now.toISOString(),
  accountsPermission:true,portfolioImported:false,paymentsEnabled:false
 });
 assert.equal(p.calls.length,2);
 assert.deepEqual(p.calls.map(c=>new URL(c.url).pathname),[
  '/api/links/'+id+'/','/api/consents/']);
 for(const call of p.calls){
  assert.equal(new URL(call.url).origin,'https://sandbox.belvo.com');
  assert.equal(call.opts.method,'GET');
  assert.equal(call.opts.redirect,'error');
  assert.equal(call.opts.cache,'no-store');
  assert.ok(call.opts.headers.authorization.startsWith('Basic '));
 }
 assert.equal(new URL(p.calls[1].url).searchParams.get('user_document'),env.BELVO_SANDBOX_MOCK_CPF);
 assert.ok(!JSON.stringify(result).includes(env.BELVO_SANDBOX_MOCK_CPF));
 assert.ok(!JSON.stringify(result).includes(env.BELVO_SANDBOX_SECRET_PASSWORD));
});
test('provider lookup cannot be made with production flag or attacker supplied references',async()=>{
 for(const e of [{...env,BELVO_ENV:'production'},{...env,BELVO_SANDBOX_WIDGET_ENABLED:'false'}]){
  const p=provider();
  await assert.rejects(verifyBelvoSandboxConsent(e,input,p.fetcher,now),rejectsCode('disabled'));
  assert.equal(p.calls.length,0);
 }
 for(const x of [{externalId:'somebody@example.com',linkId:id},
  {externalId,linkId:'../../pj'}, {externalId,linkId:'not-a-uuid'}]){
  const p=provider();
  await assert.rejects(verifyBelvoSandboxConsent(env,x,p.fetcher,now),rejectsCode('invalid_reference'));
  assert.equal(p.calls.length,0);
 }
});
test('wrong institution, owner opaque ref, missing link or inactive link deny BEFORE consent request',async()=>{
 for(const linkData of [
  {...link,institution:'real_bank_br_retail'},
  {...link,external_id:'nexa_pf_sb_'+'a'.repeat(32)},
  {...link,status:'invalid'},
  {...link,id:'23000000-0000-4000-8000-000000000001'}
 ]){
  const p=provider({linkData});
  assert.equal(await verifyBelvoSandboxConsent(env,input,p.fetcher,now),null);
  assert.equal(p.calls.length,1);
 }
});
test('expired, pending, wrong owner fixture and missing scope refuse authorization',async()=>{
 for(const invalid of [
  {...consent,status:'AWAITING_AUTHORISATION'},
  {...consent,status:'REJECTED'},
  {...consent,status:'EXPIRED'},
  {...consent,expired_at:'2026-01-01T00:00:00Z'},
  {...consent,document_number:'00000000000'},
  {...consent,link_id:'23000000-0000-4000-8000-000000000001'},
  {...consent,permissions:{ACCOUNTS:[]}},
  {...consent,permissions:{TRANSACTIONS:['one']}},
  {...consent,belvo_institution_name:'realbank'},
  {...consent,expired_at:null,undefined_consent_expiration:false}
 ]){
  const p=provider({consents:[invalid]});
  assert.equal(await verifyBelvoSandboxConsent(env,input,p.fetcher,now),null);
 }
});
test('indefinite consent may be recognized only when provider explicitly marks it',async()=>{
 const p=provider({consents:[{...consent,expired_at:null,undefined_consent_expiration:true}]});
 assert.equal((await verifyBelvoSandboxConsent(env,input,p.fetcher,now))?.verified,true);
});
test('partial pagination and malformed responses fail closed',async()=>{
 for(const setting of [
  {count:2,consents:[consent]},{count:1,consents:[consent],next:'https://sandbox.belvo.com/api/consents/?page=2'},
  {count:1,consents:[]}
 ]){
  const p=provider(setting);
  if(setting.count===1&&setting.consents.length===0){
   await assert.rejects(verifyBelvoSandboxConsent(env,input,p.fetcher,now),rejectsCode('invalid_response'));
  }else{
   await assert.rejects(verifyBelvoSandboxConsent(env,input,p.fetcher,now),rejectsCode('invalid_response'));
  }
 }
 const bad=provider({status:403});
 await assert.rejects(verifyBelvoSandboxConsent(env,input,bad.fetcher,now),rejectsCode('provider_rejected'));
 await assert.rejects(verifyBelvoSandboxConsent(env,input,async()=>{throw Error('secret password')},now),rejectsCode('provider_unavailable'));
});
test('provider confirmation route uses authenticated owner, webhook association and inserts NO accounts',()=>{
 const source=readFileSync('apps/api/src/routes-belvo-sandbox-preview.ts','utf8');
 const migration=readFileSync('infra/postgres/051_nexa_pf_belvo_verified_consents.sql','utf8');
 const route=source.slice(source.indexOf("app.post('/v1/personal/belvo-sandbox/verify'"));
 assert.ok(route.includes('const actor=await owner(req)'));
 assert.ok(route.includes('a.owner_user_id=$1'));
 assert.ok(route.includes('a.status=\'widget_ready\''));
 assert.ok(route.includes('e.link_id'));
 assert.ok(route.includes('verifyBelvoSandboxConsent'));
 assert.ok(route.includes('ON CONFLICT(attempt_id) DO UPDATE'));
 assert.ok(!route.includes('nex_personal.accounts'));
 assert.ok(!route.includes('nex_personal.transactions'));
 assert.match(migration,/verified_authorized/);
 assert.match(migration,/ON DELETE CASCADE/);
});
