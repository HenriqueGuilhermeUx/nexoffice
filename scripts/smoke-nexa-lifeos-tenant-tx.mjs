import assert from 'node:assert/strict';
import test from 'node:test';
import {withLifeosAuthenticatedTransaction} from '../apps/api/dist/nexa-lifeos-tenant-tx.js';
import {hashOpaqueToken} from '../apps/api/dist/auth.js';

const token='N'.repeat(56);
const userA='a1111111-1111-4111-8111-111111111111';
const userB='b2222222-2222-4222-8222-222222222222';

function fakePool(userId,shouldThrow=false){
 const calls=[];
 let released=0;
 const client={
  async query(text,params=[]){
   calls.push({text,params});
   if(text.includes('resolve_api_session'))return {rows:userId?[{user_id:userId}]:[]};
   if(shouldThrow && text.includes('select set_config'))throw new Error('simulated postgres failure');
   return {rows:[]};
  },
  release(){released++;}
 };
 return {pool:{connect:async()=>client},calls,get released(){return released}};
}
async function scoped(fn){
 const previous=process.env.NEXA_LIFEOS_ENV;
 process.env.NEXA_LIFEOS_ENV='production';
 try{return await fn();}finally{
  if(previous===undefined)delete process.env.NEXA_LIFEOS_ENV;
  else process.env.NEXA_LIFEOS_ENV=previous;
 }
}

test('uses same connection, validated opaque token hash, SET LOCAL and commit',async()=>{
 await scoped(async()=>{
  const f=fakePool(userA);
  const result=await withLifeosAuthenticatedTransaction(token,async({client,userId})=>{
   assert.equal(userId,userA);
   await client.query('select * from nex_personal.accounts where owner_user_id=$1',[userId]);
   return 'only-user-a';
  },f.pool);
  assert.equal(result,'only-user-a');
  assert.equal(f.calls[0].text,'BEGIN');
  assert.equal(f.calls[1].text,'select user_id from nex_personal.resolve_api_session($1::text)');
  assert.equal(f.calls[1].params[0],hashOpaqueToken(token));
  assert.ok(!f.calls[1].params[0].includes(token),'Raw bearer never reaches SQL');
  assert.equal(f.calls[2].text,"select set_config('app.user_id',$1,true)");
  assert.deepEqual(f.calls[2].params,[userA]);
  assert.equal(f.calls[3].params[0],userA);
  assert.equal(f.calls[4].text,'COMMIT');
  assert.equal(f.released,1);
 });
});
test('unauthenticated or expired session never executes protected queries',async()=>{
 await scoped(async()=>{
  const f=fakePool(null);let accessed=false;
  await assert.rejects(withLifeosAuthenticatedTransaction(token,async()=>{accessed=true},f.pool),x=>x.code==='invalid_session');
  assert.equal(accessed,false);
  assert.deepEqual(f.calls.map(x=>x.text),['BEGIN','select user_id from nex_personal.resolve_api_session($1::text)','ROLLBACK']);
  assert.equal(f.released,1);
 });
});
test('failure rolls back and releases connection without reusing tenant binding',async()=>{
 await scoped(async()=>{
  const f=fakePool(userA,true);
  await assert.rejects(withLifeosAuthenticatedTransaction(token,async()=>{},f.pool),/simulated postgres failure/);
  assert.equal(f.calls.at(-1).text,'ROLLBACK');
  assert.equal(f.released,1);
 });
});
test('separate users get separate transaction-local bindings and connections',async()=>{
 await scoped(async()=>{
  const a=fakePool(userA),b=fakePool(userB);
  const values=await Promise.all([
   withLifeosAuthenticatedTransaction(token,async({userId})=>userId,a.pool),
   withLifeosAuthenticatedTransaction(token,async({userId})=>userId,b.pool)
  ]);
  assert.deepEqual(values,[userA,userB]);
  assert.deepEqual(a.calls.find(c=>c.text.includes('set_config')).params,[userA]);
  assert.deepEqual(b.calls.find(c=>c.text.includes('set_config')).params,[userB]);
  assert.equal(a.released,1);assert.equal(b.released,1);
 });
});
test('preview and malformed tokens blocked before opening a DB connection',async()=>{
 const f=fakePool(userA);
 const previous=process.env.NEXA_LIFEOS_ENV;
 process.env.NEXA_LIFEOS_ENV='preview';
 try{await assert.rejects(withLifeosAuthenticatedTransaction(token,async()=>{},f.pool),x=>x.code==='tenant_context_unavailable');}
 finally{if(previous===undefined)delete process.env.NEXA_LIFEOS_ENV;else process.env.NEXA_LIFEOS_ENV=previous;}
 await scoped(async()=>assert.rejects(withLifeosAuthenticatedTransaction('short',async()=>{},f.pool),x=>x.code==='invalid_session'));
 assert.equal(f.calls.length,0);
});
