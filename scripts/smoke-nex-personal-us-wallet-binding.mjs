import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {issuePersonalUSWalletChallenge} from '../apps/api/dist/personal-us-wallet-ownership.js';
import {bindVerifiedUSExternalWallet,revokeUSWalletBinding} from '../apps/api/dist/personal-us-wallet-binding-store.js';
const owner='us_subject_12345',origin='https://personal-us.example.test',address='0x1111111111111111111111111111111111111111';
const now=new Date('2026-10-25T00:00:00.000Z');
const created=issuePersonalUSWalletChallenge({ownerSubject:owner,address,trustedOrigin:origin,now});
const row={id:created.challenge.id,owner_profile_id:'c1111111-1111-4111-8111-111111111111',
 owner_subject:owner,profile_status:'active',chain_id:137,wallet_address:address,
 trusted_origin:origin,nonce_sha256:created.challenge.nonceHash,
 message_sha256:createHash('sha256').update(created.message).digest('hex'),
 issued_at:created.challenge.issuedAt,expires_at:created.challenge.expiresAt,consumed_at:null};
const clone=x=>JSON.parse(JSON.stringify(x));
class MockClient{
 constructor(store){this.store=store;this.temp=null;this.released=false;this.statements=[];}
 get state(){return this.temp??this.store.state;}
 async query(sql,params=[]){
  const s=sql.trim();this.statements.push(s);
  if(s==='BEGIN'){this.temp=clone(this.store.state);return {rows:[],rowCount:null};}
  if(s==='SELECT current_database() AS database')return {rows:[{database:this.store.database}],rowCount:1};
  if(s==='COMMIT'){this.store.state=this.temp;this.temp=null;return {rows:[],rowCount:null};}
  if(s==='ROLLBACK'){this.temp=null;return {rows:[],rowCount:null};}
  if(s.includes('SELECT c.id')&&s.includes('wallet_ownership_challenges')){
   const match=this.state.row.id===params[0]&&this.state.row.owner_subject===params[1]&&this.state.row.profile_status==='active';
   return {rows:match?[clone(this.state.row)]:[],rowCount:match?1:0};
  }
  if(s.includes('UPDATE nex_personal_us.wallet_ownership_challenges')){
   const ok=!this.state.row.consumed_at&&params[1]===this.state.row.id&&params[2]===this.state.row.owner_profile_id&&
    params[3]===this.state.row.message_sha256&&params[4]===this.state.row.nonce_sha256&&
    Date.parse(params[0])<Date.parse(this.state.row.expires_at);
   if(ok)this.state.row.consumed_at=params[0];
   return {rows:ok?[{id:params[1]}]:[],rowCount:ok?1:0};
  }
  if(s.includes('INSERT INTO nex_personal_us.wallet_bindings')){
   if(this.state.bindings.some(b=>b.address.toLowerCase()===params[2].toLowerCase()&&!b.revoked))throw Error('US_UNIQUE_ACTIVE_WALLET');
   this.state.bindings.push({id:params[0],profile:params[1],address:params[2],revoked:false});
   return {rows:[{id:params[0]}],rowCount:1};
  }
  if(s.includes('UPDATE nex_personal_us.wallet_bindings')){
   const b=this.state.bindings.find(b=>b.id===params[2]&&!b.revoked&&params[1]===this.state.row.owner_subject);
   if(!b)return {rows:[],rowCount:0};
   b.revoked=true;
   return {rows:[{id:b.id,owner_profile_id:b.profile,wallet_address:b.address}],rowCount:1};
  }
  if(s.includes('INSERT INTO nex_personal_us.wallet_security_events')){
   this.state.events.push(params);
   return {rows:[],rowCount:1};
  }
  throw Error('UNEXPECTED_SQL:'+s.slice(0,120));
 }
 release(){this.released=true;}
}
class MockPool{
 constructor(database='nex_personal_us_ci'){this.database=database;this.state={row:clone(row),bindings:[],events:[]};this.clients=[];}
 async connect(){const c=new MockClient(this);this.clients.push(c);return c;}
}
const verifier=async()=>({verified:true,recoveredAddress:address,verificationType:'eoa'});
const wrongDbPool=new MockPool('nexoffice');
await assert.rejects(bindVerifiedUSExternalWallet({
 pool:wrongDbPool,authenticatedUSSubject:owner,challengeId:row.id,
 trustedOrigin:origin,signedMessage:created.message,signature:'0x'+'aa'.repeat(65),
 verifier:async()=>({verified:true,recoveredAddress:address,verificationType:'eoa'}),
 now:new Date(now.getTime()+1000)
}),/US_WALLET_WRONG_DATABASE/);
assert.equal(wrongDbPool.state.row.consumed_at,null);
assert.deepEqual(wrongDbPool.state.bindings,[]);
assert.deepEqual(wrongDbPool.state.events,[]);
assert.ok(wrongDbPool.clients.every(c=>c.released));

const input={pool:new MockPool(),authenticatedUSSubject:owner,challengeId:row.id,
 trustedOrigin:origin,signedMessage:created.message,signature:'0x'+'aa'.repeat(65),
 verifier,now:new Date(now.getTime()+1000)};
await assert.rejects(bindVerifiedUSExternalWallet({...input,authenticatedUSSubject:'us_subject_other'}),/US_CHALLENGE_NOT_FOUND/);
assert.equal(input.pool.state.row.consumed_at,null);
await assert.rejects(bindVerifiedUSExternalWallet({...input,signedMessage:created.message+'\nAdditional evil line'}),/US_SIGNED_MESSAGE_MISMATCH/);
assert.equal(input.pool.state.row.consumed_at,null);
await assert.rejects(bindVerifiedUSExternalWallet({...input,verifier:async()=>({verified:false,recoveredAddress:address,verificationType:'eoa'})}),/WALLET_SIGNATURE_UNVERIFIED/);
assert.equal(input.pool.state.row.consumed_at,null);
await assert.rejects(bindVerifiedUSExternalWallet({...input,trustedOrigin:'https://other.example.test'}),/ORIGIN_MISMATCH/);
assert.equal(input.pool.state.row.consumed_at,null);
const success=await bindVerifiedUSExternalWallet(input);
assert.equal(success.executionAllowed,false);
assert.equal(success.ownerSubject,owner);
assert.equal(input.pool.state.bindings.length,1);
assert.equal(input.pool.state.events.length,2);
assert.ok(input.pool.state.row.consumed_at);
await assert.rejects(bindVerifiedUSExternalWallet(input),/US_CHALLENGE_INVALID/);
assert.equal(input.pool.state.bindings.length,1,'nonce replay must never create another binding');
assert.deepEqual(await revokeUSWalletBinding({pool:input.pool,authenticatedUSSubject:'us_subject_other',
 bindingId:success.walletBindingId,now}),{revoked:false,executionAllowed:false});
assert.equal(input.pool.state.bindings[0].revoked,false);
assert.deepEqual(await revokeUSWalletBinding({pool:input.pool,authenticatedUSSubject:owner,
 bindingId:success.walletBindingId,now}),{revoked:true,executionAllowed:false});
assert.equal(input.pool.state.events.length,3);
assert.deepEqual(await revokeUSWalletBinding({pool:input.pool,authenticatedUSSubject:owner,
 bindingId:success.walletBindingId,now}),{revoked:false,executionAllowed:false});
assert.ok(input.pool.clients.every(c=>c.released),'database clients must always be released');
// Simulated unique-address collision must ROLLBACK nonce consumption.
const duplicate=new MockPool();
duplicate.state.bindings.push({id:'different',profile:'other',address,revoked:false});
await assert.rejects(bindVerifiedUSExternalWallet({...input,pool:duplicate}),/US_UNIQUE_ACTIVE_WALLET/);
assert.equal(duplicate.state.row.consumed_at,null);
assert.equal(duplicate.state.events.length,0);
assert.equal(duplicate.state.bindings.length,1);
console.log('Nex Personal USA wallet DB transaction contracts: PASS (mock database only)');
