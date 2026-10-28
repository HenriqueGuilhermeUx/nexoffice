import assert from 'node:assert/strict';
import test from 'node:test';
import {checkBelvoSandbox,BELVO_SANDBOX_ORIGIN,BelvoSandboxCheckError}
 from './check-nexa-belvo-sandbox.mjs';

const safeEnv=()=>({
 NEX_PERSONAL_PREVIEW:'true',BELVO_SANDBOX_ENABLED:'true',BELVO_ENV:'sandbox',
 BELVO_SANDBOX_SECRET_ID:'test-only-secret-id',
 BELVO_SANDBOX_SECRET_PASSWORD:'test-only-secret-password'
});
function assertCode(code){return error=>error instanceof BelvoSandboxCheckError&&error.code===code;}
test('sandbox gate rejects any production setting before fetching or exposing API credentials',async()=>{
 for(const change of [
  {BELVO_ENV:'production'},{NEX_PERSONAL_PREVIEW:'false'},{BELVO_SANDBOX_ENABLED:'false'},
  {BELVO_SANDBOX_SECRET_ID:''},{BELVO_SANDBOX_SECRET_PASSWORD:''}
 ]){
  let calls=0;
  const env={...safeEnv(),...change};
  const code=(change.BELVO_SANDBOX_SECRET_ID===''||change.BELVO_SANDBOX_SECRET_PASSWORD==='')?'KEYS_MISSING':'SANDBOX_GUARD';
  await assert.rejects(checkBelvoSandbox({
   env,fetcher:()=>{calls++;throw Error('should not be called');}
  }),assertCode(code));
  assert.equal(calls,0);
 }
});
test('only GET institutions to fixed sandbox domain with basic auth; no links or payments',async()=>{
 let request;
 const env=safeEnv();
 const result=await checkBelvoSandbox({env,fetcher:async(url,options)=>{
  request={url,options};
  return {status:200,json:async()=>({count:1,results:[{id:1,name:'ofmockbank_br_retail'}]})};
 }});
 assert.equal(request.url,BELVO_SANDBOX_ORIGIN+'/api/institutions/?page_size=10');
 assert.equal(request.options.method,'GET');
 assert.equal(request.options.redirect,'error');
 assert.equal(Buffer.from(request.options.headers.authorization.slice(6),'base64').toString(),
  'test-only-secret-id:test-only-secret-password');
 assert.deepEqual(result,{
  environment:'sandbox',baseUrl:'https://sandbox.belvo.com',
  authenticated:true,readOnly:true,linkCreated:false,consentCreated:false,
  financialDataDownloaded:false,paymentInitiated:false,institutionsOnPage:1
 });
 assert.ok(!JSON.stringify(result).includes(env.BELVO_SANDBOX_SECRET_PASSWORD));
 assert.ok(!JSON.stringify(result).includes(env.BELVO_SANDBOX_SECRET_ID));
});
test('non-200, timeout, invalid JSON are sanitized without leaking provider secrets',async()=>{
 const env=safeEnv();
 for(const [response,code] of [
  [{status:401},'UNAUTHORIZED'],
  [{status:403},'UNAUTHORIZED'],
  [{status:429},'UNEXPECTED_STATUS'],
  [{status:200,json:async()=>{throw new Error('test-only-secret-password')}},'INVALID_RESPONSE'],
  [{status:200,json:async()=>({results:null})},'INVALID_RESPONSE']
 ]){
  await assert.rejects(checkBelvoSandbox({env,fetcher:async()=>response}),e=>{
   assert.equal(e.code,code);
   assert.ok(!e.message.includes(env.BELVO_SANDBOX_SECRET_PASSWORD));
   assert.ok(!e.message.includes(env.BELVO_SANDBOX_SECRET_ID));
   return true;
  });
 }
 await assert.rejects(checkBelvoSandbox({env,fetcher:async()=>{throw Error('test-only-secret-password');}}),assertCode('NETWORK_ERROR'));
});
test('the actual PF provider remains explicitly unconfigured; check is not mounted in API',async()=>{
 const {readFileSync}=await import('node:fs');
 const source=readFileSync('packages/integrations/src/nex-finance-core.ts','utf8');
 const api=readFileSync('apps/api/src/server-personal.ts','utf8');
 assert.match(source,/class BelvoProvider implements OpenFinanceProvider/);
 assert.match(source,/throw new ProviderNotConfiguredError\(this.name\)/);
 assert.doesNotMatch(api,/check-nexa-belvo-sandbox/);
 assert.doesNotMatch(api,/BELVO_SANDBOX_SECRET/);
});
