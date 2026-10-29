import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {readBelvoSandboxDemo,SandboxReadError} from '../apps/api/dist/belvo-sandbox-read-model.js';

const linkId='12000000-0000-4000-8000-000000000001';
const accountId='22000000-0000-4000-8000-000000000001';
const transactionId='32000000-0000-4000-8000-000000000001';
const consentId='42000000-0000-4000-8000-000000000001';
const externalId='nexa_pf_sb_'+'c'.repeat(32);
const fixture={NEX_PERSONAL_PREVIEW:'true',BELVO_ENV:'sandbox',
 BELVO_SANDBOX_ENABLED:'true',BELVO_SANDBOX_WIDGET_ENABLED:'true',
 BELVO_SANDBOX_SECRET_ID:'fake-id',BELVO_SANDBOX_SECRET_PASSWORD:'fake-password',
 BELVO_SANDBOX_MOCK_CPF:'76109277673',BELVO_SANDBOX_MOCK_NAME:'Mock Customer',
 BELVO_SANDBOX_TERMS_URL:'https://example.org/terms',
 NEX_PERSONAL_PREVIEW_SELF_ORIGIN:'https://nex-personal-preview-api.onrender.com',
 BELVO_SANDBOX_WEBHOOK_BEARER:'a-strong-test-secret-which-never-leaves-here'};
const now=new Date('2026-10-28T20:00:00Z');
const input={externalId,linkId};
const link={id:linkId,institution:'ofmockbank_br_retail',external_id:externalId,status:'valid'};
const consent={id:consentId,link_id:linkId,belvo_institution_name:'ofmockbank_br_retail',
 document_number:fixture.BELVO_SANDBOX_MOCK_CPF,status:'AUTHORISED',
 expired_at:'2027-01-01T00:00:00Z',permissions:{ACCOUNTS:['READ'],TRANSACTIONS:['READ']}};
const account={id:accountId,link:linkId,institution:{name:'ofmockbank_br_retail'},
 category:'CHECKING_ACCOUNT',balance_type:'ASSET',currency:'BRL',
 balance:{current:120.75,available:110.5},collected_at:'2026-10-28T17:00:00Z',
 number:'123456789',public_identification_value:'agency/account',name:'Private Demo Holder'};
const transaction={id:transactionId,account:{
 id:accountId,link:linkId,institution:{name:'ofmockbank_br_retail'}},
 category:'FOOD',currency:'BRL',amount:-15.25,
 transacted_at:'2026-10-28T10:00:00Z',description:'private transaction note'};
function provider(options={}){
 const calls=[];
 const fetcher=async(url,args)=>{
  calls.push({url,args});
  let data;
  const path=new URL(url).pathname;
  if(path.startsWith('/api/links/'))data=options.link||link;
  else if(path==='/api/consents/')data={count:1,next:null,results:[options.consent||consent]};
  else if(path==='/api/accounts/')data=options.accounts||{count:1,next:null,results:[account]};
  else if(path==='/api/transactions/')data=options.transactions||{count:1,next:null,results:[transaction]};
  else throw Error('Unexpected provider endpoint: '+url);
  return {ok:true,status:200,json:async()=>data};
 };
 return {fetcher,calls};
}
test('requires fresh provider-verified owner-bound consent for both accounts and transactions',async()=>{
 const p=provider();
 const result=await readBelvoSandboxDemo(fixture,input,p.fetcher,now);
 assert.equal(p.calls.length,4);
 assert.deepEqual(p.calls.map(x=>new URL(x.url).pathname),[
  '/api/links/'+linkId+'/','/api/consents/','/api/accounts/','/api/transactions/']);
 for(const call of p.calls){
  const u=new URL(call.url);
  assert.equal(u.origin,'https://sandbox.belvo.com');
  assert.equal(call.args.method,'GET');
  assert.equal(call.args.redirect,'error');
  assert.equal(call.args.cache,'no-store');
  assert.ok(call.args.headers.authorization.startsWith('Basic '));
  if(['/api/accounts/','/api/transactions/'].includes(u.pathname))
   assert.equal(u.searchParams.get('link'),linkId);
 }
 assert.equal(result?.source,'belvo_sandbox_demo');
 assert.equal(result?.neverCombineWithRealPortfolio,true);
 assert.equal(result?.balancesVerifiedForProduction,false);
 assert.equal(result?.noCurrencyTotal,true);
 assert.equal(result?.accounts[0].currentMinor,'12075');
 assert.equal(result?.transactions[0].amountMinor,'-1525');
 assert.equal(result?.accounts[0].kind,'CHECKING_ACCOUNT');
 assert.equal(result?.transactions[0].kind,'FOOD');
 assert.ok(!JSON.stringify(result).includes('123456789'));
 assert.ok(!JSON.stringify(result).includes('Private Demo Holder'));
 assert.ok(!JSON.stringify(result).includes('private transaction note'));
 assert.ok(!JSON.stringify(result).includes(fixture.BELVO_SANDBOX_SECRET_PASSWORD));
});
test('refuses account or transaction reads without exact transaction permission',async()=>{
 const p=provider({consent:{...consent,permissions:{ACCOUNTS:['READ']}}});
 assert.equal(await readBelvoSandboxDemo(fixture,input,p.fetcher,now),null);
 assert.equal(p.calls.length,2);
});
test('won\'t call Belvo without sandbox flags, even when input has a valid link',async()=>{
 const p=provider();
 await assert.rejects(readBelvoSandboxDemo({...fixture,BELVO_ENV:'production'},input,p.fetcher,now),
  e=>e instanceof SandboxReadError&&e.code==='disabled');
 assert.equal(p.calls.length,0);
});
test('refuses foreign or mixed-account link data instead of leaking partial results',async()=>{
 for(const overrides of [
  {accounts:{count:1,next:null,results:[{...account,link:'92000000-0000-4000-8000-000000000001'}]}},
  {transactions:{count:1,next:null,results:[{...transaction,account:{...transaction.account,link:'92000000-0000-4000-8000-000000000001'}}]}},
  {transactions:{count:1,next:null,results:[{...transaction,account:{...transaction.account,id:'92000000-0000-4000-8000-000000000001'}}]}},
  {accounts:{count:3,next:'https://sandbox.belvo.com/api/accounts/?page=2',results:[account]}},
  {transactions:{count:200,next:'https://sandbox.belvo.com/api/transactions/?page=2',results:[transaction]}}
 ]){
  const p=provider(overrides);
  await assert.rejects(readBelvoSandboxDemo(fixture,input,p.fetcher,now),
   e=>e instanceof SandboxReadError);
 }
});
test('unknown currency or precision refuses amount rather than converting or rounding',async()=>{
 const p=provider({
  accounts:{count:1,next:null,results:[{
   ...account,currency:'USD',balance:{current:51.3342,available:40}}]},
  transactions:{count:1,next:null,results:[{...transaction,currency:'USD',amount:9.999}]}
 });
 const result=await readBelvoSandboxDemo(fixture,input,p.fetcher,now);
 assert.equal(result.accounts[0].currency,null);
 assert.equal(result.accounts[0].currentMinor,null);
 assert.equal(result.transactions[0].currency,null);
 assert.equal(result.transactions[0].amountMinor,null);
 const p2=provider({accounts:{count:1,next:null,results:[{
  ...account,balance:{current:51.3342,available:40}}]}});
 const result2=await readBelvoSandboxDemo(fixture,input,p2.fetcher,now);
 assert.equal(result2.accounts[0].currentMinor,null);
});
test('route and premium screen do not touch verified real account ledgers',()=>{
 const server=readFileSync('apps/api/src/routes-belvo-sandbox-preview.ts','utf8');
 const frontend=readFileSync('apps/web/src/NexaBelvoSandboxPanel.tsx','utf8');
 const read=server.slice(server.indexOf("app.get('/v1/personal/belvo-sandbox/demo-data'"),
  server.indexOf(' // Aggregation webhook, never payments webhook.'));
 assert.ok(read.includes('const actor=await owner(req)'));
 assert.ok(read.includes("v.owner_user_id=$1 AND a.owner_user_id=$1"));
 assert.ok(read.includes("v.verification_status='verified_authorized'"));
 assert.ok(read.includes("v.verified_at>now()-interval '15 minutes'"));
 assert.ok(read.includes('readBelvoSandboxDemo'));
 assert.ok(!read.includes('INSERT INTO nex_personal.accounts'));
 assert.ok(!read.includes('nex_personal.transactions'));
 assert.ok(!read.includes('paymentInitiated:true'));
 assert.ok(frontend.includes('DEMONSTRAÇÃO · dados fictícios'));
 assert.ok(frontend.includes('demo.noCurrencyTotal')===false || frontend.includes('noCurrencyTotal:true'));
 assert.ok(frontend.includes('fora do seu patrimônio'));
});

test('refuses BRL values when declared account and balance currencies conflict',async()=>{
 const p=provider({accounts:{count:1,next:null,results:[{...account,currency:'USD',balance:{currency:'BRL',current:100,available:90}}]}});
 const result=await readBelvoSandboxDemo(fixture,input,p.fetcher,now);
 assert.equal(result.accounts[0].currency,null);
 assert.equal(result.accounts[0].currentMinor,null);
 assert.equal(result.accounts[0].availableMinor,null);
});

test('rejects duplicate account IDs rather than showing ambiguous demo balances',async()=>{
 const p=provider({accounts:{count:2,next:null,results:[account,{...account}]}});
 await assert.rejects(readBelvoSandboxDemo(fixture,input,p.fetcher,now),
  e=>e instanceof SandboxReadError&&e.code==='malformed_data');
});
test('rejects duplicate transaction IDs rather than duplicating demo activity',async()=>{
 const p=provider({transactions:{count:2,next:null,results:[transaction,{...transaction}]}});
 await assert.rejects(readBelvoSandboxDemo(fixture,input,p.fetcher,now),
  e=>e instanceof SandboxReadError&&e.code==='malformed_data');
});

test('status diagnostics report only missing sandbox setup key names, never secret values',()=>{
 const contract=readFileSync('apps/api/src/belvo-sandbox-contract.ts','utf8');
 const server=readFileSync('apps/api/src/routes-belvo-sandbox-preview.ts','utf8');
 assert.ok(contract.includes('export function sandboxWidgetMissingPrerequisites'));
 assert.ok(server.includes('missingSetup:sandboxWidgetMissingPrerequisites(env)'));
 assert.ok(contract.includes("checks.filter(([,ok])=>!ok).map(([name])=>name)"));
});
