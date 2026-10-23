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
 const logout=await call('/v1/auth/logout','POST',{},token);assert.equal(logout.status,200);
 const after=await call('/v1/personal/studio','GET',undefined,token);assert.equal(after.status,401);
 const loginRejected=await call('/v1/auth/login','POST',{email:'not-allowed@example.test',password:'SecurePass-123!'});
 assert.equal(loginRejected.status,403);
 console.log('Nex Personal isolated preview: no PJ routes, invite/email gate, CORS, balance privacy, auth and logout OK');
}finally{
 if(userId)await db.query('delete from public.users where id=$1',[userId]);
 await db.end();
}
