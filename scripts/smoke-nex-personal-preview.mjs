import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
const host='http://127.0.0.1:'+String(process.env.PORT||4000);
const email=process.env.NEX_PERSONAL_PREVIEW_ALLOWED_EMAILS?.split(',')[0];
const code=process.env.NEX_PERSONAL_PREVIEW_TEST_INVITE;
if(!email||!code||!process.env.DATABASE_URL)throw Error('Disposable preview CI smoke variables required.');
const db=new pg.Client({connectionString:process.env.DATABASE_URL});
await db.connect();
let userId;
async function call(path,method='GET',body,token,origin){
 const response=await fetch(host+path,{method,headers:{
  ...(body!==undefined?{'content-type':'application/json'}:{}),
  ...(token?{authorization:'Bearer '+token}:{}),
  ...(origin?{origin}:{})
 },...(body!==undefined?{body:JSON.stringify(body)}:{})});
 const result=await response.json().catch(()=>({}));
 return {status:response.status,body:result};
}
try{
 const health=await call('/health');assert.equal(health.status,200);
 assert.equal(health.body.service,'nex-personal-preview');

 // Same-origin public preview must render the app and allow browser preflight.
 const selfOrigin='https://nex-personal-preview-api.onrender.com';
 const ui=await fetch(host+'/',{headers:{origin:selfOrigin}});
 assert.equal(ui.status,200,'Personal preview root should serve its own web UI.');
 assert.match(ui.headers.get('content-type')||'',/text\/html/);
 const html=await ui.text();
 assert.match(html,/id="root"/,'Vite entry should render React on the same API domain.');
 assert.equal(ui.headers.get('access-control-allow-origin'),selfOrigin);
 const assetPath=html.match(/(?:src|href)="(\/assets\/[^"]+)"/)?.[1];
 assert.ok(assetPath,'Vite HTML must include an assets bundle.');
 const asset=await fetch(host+assetPath);
 assert.equal(asset.status,200,'Bundled Vite asset must load without another hostname.');
 const logo=await fetch(host+'/nexa-logo.svg');
 assert.equal(logo.status,200,'Official Nexa logo must load at the preview root.');
 assert.match(logo.headers.get('content-type')||'',/image\/svg\+xml/);
 const logoBody=await logo.text();
 assert.match(logoBody,/aria-label="Nexa"/);
 assert.match(logoBody,/#06111F/);
 assert.ok(!logoBody.includes('NexOffice'),'Preview must not serve PJ brand as Nexa');
 const originalPjFavicon=await fetch(host+'/favicon.svg');
 assert.equal(originalPjFavicon.status,404,'NexOffices PJ favicon must not be served on isolated preview');
 const preflight=await fetch(host+'/v1/personal/auth/register',{
   method:'OPTIONS',
   headers:{origin:selfOrigin,'access-control-request-method':'POST','access-control-request-headers':'content-type'}
 });
 assert.equal(preflight.status,204,'Same-origin browser preflight must succeed.');
 assert.equal(preflight.headers.get('access-control-allow-origin'),selfOrigin);
 const otherPreflight=await fetch(host+'/v1/personal/auth/register',{
   method:'OPTIONS',headers:{origin:'https://nex-personal-ci.example.test','access-control-request-method':'POST'}
 });
 assert.equal(otherPreflight.status,204,'Existing authorized cross-origin frontend must remain supported.');

 const pj=await call('/v1/workspaces');assert.equal(pj.status,404,'No PJ endpoints on isolated preview');
 const pjRegister=await call('/v1/auth/register','POST',{name:'Company'});
 assert.equal(pjRegister.status,404,'Business registration must not exist');
 const unknown=await call('/v1/personal/auth/register','POST',{name:'Unknown',email:'unknown@example.test',password:'SecurePass-123!',previewInviteCode:code});
 assert.equal(unknown.status,403,'Email allowlist is mandatory');
 const badInvite=await call('/v1/personal/auth/register','POST',{name:'Test Personal',email,password:'SecurePass-123!',previewInviteCode:'incorrect-invite'});
 assert.equal(badInvite.status,403,'Invite code required');
 const originDenied=await call('/v1/personal/auth/register','POST',{name:'Test Personal',email,password:'SecurePass-123!',previewInviteCode:code},undefined,'https://malicious.example.test');
 assert.equal(originDenied.status,403,'Unknown origin not permitted');
 const register=await call('/v1/personal/auth/register','POST',{
  name:'Personal Preview Tester',email,password:'SecurePass-123!',previewInviteCode:code
 });
 assert.equal(register.status,200,JSON.stringify(register.body));
 userId=register.body.user.id;
 const token=register.body.token;
 const anon=await call('/v1/personal/studio');assert.equal(anon.status,401);
 const me=await call('/v1/personal/me','GET',undefined,token);assert.equal(me.status,200);
 const account=await call('/v1/personal/manual-accounts','POST',{name:'Teste de saldo',balanceMinor:'10000'},token);
 assert.equal(account.status,200,JSON.stringify(account.body));
 const studio=await call('/v1/personal/studio','GET',undefined,token);
 assert.equal(studio.body.totals.manualAvailableMinor,'10000');
 assert.equal(studio.body.provenance.verifiedBanking,false);

 // F-Insight research is optional and must never connect to a market provider
 // without the separate PF-only backend configuration.
 const anonymousFInsight=await call('/v1/personal/finsight/status');
 assert.equal(anonymousFInsight.status,401);
 const finsightStatus=await call('/v1/personal/finsight/status','GET',undefined,token);
 assert.equal(finsightStatus.status,200,JSON.stringify(finsightStatus.body));
 assert.equal(finsightStatus.body.configured,false);
 assert.equal(finsightStatus.body.readOnly,true);
 assert.equal(finsightStatus.body.dataSharing,false);
 assert.equal(finsightStatus.body.accountLinking,false);
 assert.equal(finsightStatus.body.portfolioImported,false);
 const unavailableMarket=await call('/v1/personal/finsight/asset/AAPL','GET',undefined,token);
 assert.equal(unavailableMarket.status,409,'Research provider must be disabled by default');
 const rejectedSymbol=await call('/v1/personal/finsight/asset/BAD%3F','GET',undefined,token);
 assert.equal(rejectedSymbol.status,400,'Research symbol must be validated before any external request');

 // Brokerage distribution is a planned capability only: no offers, partners,
 // referrals, paid rankings, account opening or trading in PF preview.
 const anonBrokerage=await call('/v1/personal/finsight/brokerage');
 assert.equal(anonBrokerage.status,401,'Brokerage requires an authenticated PF session');
 const brokerage=await call('/v1/personal/finsight/brokerage','GET',undefined,token);
 assert.equal(brokerage.status,200,JSON.stringify(brokerage.body));
 assert.equal(brokerage.body.status,'preparation');
 assert.equal(brokerage.body.distributionEnabled,false);
 assert.equal(brokerage.body.recommendationEnabled,false);
 assert.equal(brokerage.body.suitabilityVerified,false);
 assert.deepEqual(brokerage.body.partners,[]);
 assert.deepEqual(brokerage.body.products,[]);
 assert.equal(brokerage.body.leadSubmissionEnabled,false);
 assert.equal(brokerage.body.accountOpeningEnabled,false);
 assert.equal(brokerage.body.orderExecutionEnabled,false);
 assert.equal(brokerage.body.customerDataShared,false);
 assert.equal(brokerage.body.commissionDisclosureRequired,true);
 assert.equal(brokerage.body.categories.length,6);
 const forbiddenBrokerOrder=await call('/v1/personal/finsight/brokerage','POST',{action:'order',productId:'example'},token);
 assert.equal(forbiddenBrokerOrder.status,404,'No brokerage mutation endpoint allowed');

 const agents=await call('/v1/personal/agents','GET',undefined,token);
 assert.equal(agents.status,200,JSON.stringify(agents.body));
 assert.equal(agents.body.agents.length,11,'Eleven specialist agents must be discoverable');
 const expected=['expenses','financial','planning','investments','shopping','simulations','payments','contracts','public_services','debt_review','legal_support'];
 assert.deepEqual(agents.body.agents.map(a=>a.id),expected);
 const anonAgent=await call('/v1/personal/agents/expenses/analyze','POST',{});
 assert.equal(anonAgent.status,401,'Specialist data must require authentication');
 for(const id of expected){
   const request=id==='shopping'?{amountMinor:'25000',installments:2}
    :id==='simulations'?{monthlyMinor:'35000',months:6,installments:1}
    :id==='contracts'?{contractText:'Contrato com prazo e valor, mas sem cláusula de multa ou rescisão.'}
    :{};
   const result=await call('/v1/personal/agents/'+id+'/analyze','POST',request,token);
   assert.equal(result.status,200,id+': '+JSON.stringify(result.body));
   assert.ok(result.body.answer,id+': must return a grounded answer');
   assert.equal(result.body.modelCalled,false);
   assert.equal(result.body.externalEffect,false);
   assert.equal(result.body.verifiedBanking,false);
   assert.equal(result.body.canInitiatePayment,false);
   if(id==='shopping')assert.match(result.body.answer,/R\$ 250,00/);
   if(id==='simulations')assert.match(result.body.answer,/R\$ 2.100,00/);
   if(id==='contracts')assert.ok(!JSON.stringify(result.body).includes('Contrato com prazo'),'Contract text must not be echoed');
 }
 const invalidAgent=await call('/v1/personal/agents/trade/analyze','POST',{},token);
 assert.equal(invalidAgent.status,400,'Trading is not a supported action');
 const malformed=await call('/v1/personal/agents/simulations/analyze','POST',{months:99999},token);
 assert.equal(malformed.status,400,'Simulation inputs must be bounded');
 const forged=await call('/v1/personal/agents/financial/analyze','POST',{ownerId:randomUUID()},token);
 assert.equal(forged.status,400,'Client cannot change analysis owner');


 // Life OS: opt-in only, owner-scoped metadata, and no cross-product data sharing.
 const anonLife=await call('/v1/personal/life');assert.equal(anonLife.status,401);
 const initialLife=await call('/v1/personal/life','GET',undefined,token);
 assert.equal(initialLife.status,200,JSON.stringify(initialLife.body));
 assert.equal(initialLife.body.preferences.proactive_mode,'off');
 assert.deepEqual(initialLife.body.preferences.focus_areas,[]);
 assert.equal(initialLife.body.partnerDataShared,false);
 assert.equal(initialLife.body.marketingPersonalization,false);
 assert.deepEqual(initialLife.body.connectedProducts,[]);
 assert.equal(initialLife.body.proactiveDeliveryActive,false);
 const selected=await call('/v1/personal/life/preferences','PUT',{
  focusAreas:['money','health','public_services'],proactiveMode:'on_open'
 },token);
 assert.equal(selected.status,200,JSON.stringify(selected.body));
 assert.equal(selected.body.proactiveDeliveryActive,false,'No background notification scheduler');
 const invalidPreferences=await call('/v1/personal/life/preferences','PUT',{
  focusAreas:['health','health'],proactiveMode:'on_open'
 },token);
 assert.equal(invalidPreferences.status,400,'Duplicate areas cannot be saved');
 const fakeSharing=await call('/v1/personal/life/preferences','PUT',{
  focusAreas:['money'],proactiveMode:'on_open',shareHealthData:true
 },token);
 assert.equal(fakeSharing.status,400,'No hidden health-data sharing capability');
 const newLife=await call('/v1/personal/life/intents','POST',{kind:'buy_car'},token);
 assert.equal(newLife.status,200,JSON.stringify(newLife.body));
 assert.equal(newLife.body.externalEffect,false);
 const freshLife=await call('/v1/personal/life','GET',undefined,token);
 assert.equal(freshLife.body.intents.length,1);
 assert.equal(freshLife.body.preferences.proactive_mode,'on_open');
 const otherIntent=await call('/v1/personal/life/intents/'+randomUUID()+'/complete','POST',{},token);
 assert.equal(otherIntent.status,404,'Foreign/missing owner tasks must not be modified');
 const completeLife=await call('/v1/personal/life/intents/'+newLife.body.intent.id+'/complete','POST',{},token);
 assert.equal(completeLife.status,200);
 assert.equal(completeLife.body.externalEffect,false);
 const doneLife=await call('/v1/personal/life','GET',undefined,token);
 assert.equal(doneLife.body.intents[0].status,'done');

 const logout=await call('/v1/auth/logout','POST',{},token);assert.equal(logout.status,200);
 const after=await call('/v1/personal/studio','GET',undefined,token);assert.equal(after.status,401);
 const loginRejected=await call('/v1/auth/login','POST',{email:'not-allowed@example.test',password:'SecurePass-123!'});
 assert.equal(loginRejected.status,403);
 console.log('Nex Personal isolated preview: no PJ routes, invite/email gate, CORS, balance privacy, auth and logout OK');
}finally{
 if(userId)await db.query('delete from public.users where id=$1',[userId]);
 await db.end();
}
