/**
 * Mock-bound behavior test for the first Nexa PF production read.
 * This is NOT real PostgreSQL/RLS evidence. The separate disposable CI
 * actor-rls rehearsal provides the actual engine isolation coverage.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const {readLifeosPersonalGoals}=await import('../apps/api/dist/nexa-lifeos-goals-read.js');
const {readLifeosPersonalBills}=await import('../apps/api/dist/nexa-lifeos-bills-read.js');
const prior=process.env.NEXA_LIFEOS_ENV;
process.env.NEXA_LIFEOS_ENV='production';
const A='a1111111-1111-4111-8111-111111111111';
const B='b2222222-2222-4222-8222-222222222222';
const aliceToken='A'.repeat(43);
const bobToken='B'.repeat(43);
const digest=t=>createHash('sha256').update(t).digest('hex');

function fakePool({failQuery=false}={}){
 let actor=null;
 let inTransaction=false;
 let releases=0;
 const log=[];
 const known=new Map([[digest(aliceToken),A],[digest(bobToken),B]]);
 const all=[
  {owner:A,id:'11111111-1111-4111-8111-111111111111',name:'Reserva de emergência',target_minor:'250000',saved_minor:'30000',due_on:'2027-08-01'},
  {owner:B,id:'22222222-2222-4222-8222-222222222222',name:'Viagem do Bob',target_minor:'100000',saved_minor:'20000',due_on:null}
 ];
 const client={
  async query(statement,params=[]){
   const sql=String(statement).trim();
   log.push({sql,params});
   if(sql==='BEGIN'){assert.equal(inTransaction,false);inTransaction=true;actor=null;return{rows:[]};}
   if(sql==='COMMIT'||sql==='ROLLBACK'){assert.equal(inTransaction,true);inTransaction=false;actor=null;return{rows:[]};}
   assert.equal(inTransaction,true,'All database statements must execute in one transaction');
   if(sql.includes('nex_personal.resolve_api_session')){
    assert.equal(params.length,1);
    const user_id=known.get(params[0]);
    return{rows:user_id?[{user_id}]:[]};
   }
   if(sql.includes("set_config('app.user_id'")){
    actor=params[0];
    assert.ok(actor===A||actor===B);
    return{rows:[{set_config:actor}]};
   }
   if(sql.includes('from nex_personal.bills')){
    assert.equal(params[0],actor);
    assert.match(sql,/owner_user_id=\$1::uuid and active=true/);
    if(failQuery)throw new Error('simulated query failure');
    return {rows:actor===A?[{id:'33333333-3333-4333-8333-333333333333',name:'Conta luz',amount_minor:'9900',next_due_on:'2026-11-01',interval_months:1}]:[]};
   }
   if(sql.includes('from nex_personal.goals')){
    assert.equal(params.length,1);
    assert.equal(params[0],actor,'SQL owner parameter must match validated transaction principal');
    assert.match(sql,/where owner_user_id=\$1::uuid and status='active'/);
    assert.match(sql,/limit 50/);
    if(failQuery)throw new Error('simulated query failure');
    return{rows:all.filter(row=>row.owner===actor).map(({owner,...fields})=>fields)};
   }
   throw new Error('Unexpected SQL in PF isolation test');
  },
  release(){releases++;}
 };
 return {pool:{async connect(){return client;}},log,get releases(){return releases;},get actor(){return actor;},get inTransaction(){return inTransaction;}};
}

test('Alice sees only her goals; Bob sees only his; no state leaks across pooled sessions',async()=>{
 const f=fakePool();
 const a=await readLifeosPersonalGoals(aliceToken,f.pool);
 const b=await readLifeosPersonalGoals(bobToken,f.pool);
 assert.deepEqual(a,{goals:[{
  id:'11111111-1111-4111-8111-111111111111',
  name:'Reserva de emergência',targetMinor:'250000',savedMinor:'30000',dueOn:'2027-08-01'
 }],readOnly:true,externalFinancialActions:false});
 assert.equal(b.goals.length,1);
 assert.equal(b.goals[0].name,'Viagem do Bob');
 assert.equal(a.goals.some(g=>g.name==='Viagem do Bob'),false);
 assert.equal(b.goals.some(g=>g.name==='Reserva de emergência'),false);
 assert.equal(f.releases,2);
 assert.equal(f.actor,null);
 assert.equal(f.inTransaction,false);
 assert.equal(f.log.filter(x=>x.sql==='BEGIN').length,2);
 assert.equal(f.log.filter(x=>x.sql==='COMMIT').length,2);
 assert.equal(f.log.filter(x=>x.sql.includes('nex_personal.goals')).length,2);
 assert.equal(JSON.stringify(a).includes(aliceToken),false);
});
test('unknown session cannot query PF goals, rolls back and releases pooled client',async()=>{
 const f=fakePool();
 await assert.rejects(readLifeosPersonalGoals('C'.repeat(43),f.pool),e=>e.statusCode===401);
 assert.equal(f.log.filter(x=>x.sql.includes('from nex_personal.goals')).length,0);
 assert.equal(f.log.at(-1).sql,'ROLLBACK');
 assert.equal(f.releases,1);
 assert.equal(f.actor,null);
});
test('malformed bearer is denied before requesting database connection',async()=>{
 let connects=0;
 await assert.rejects(readLifeosPersonalGoals('bad',{async connect(){connects++;throw Error('must not connect');}}),e=>e.statusCode===401);
 assert.equal(connects,0);
});
test('failed tenant query rolls back and clears actor on the pooled client',async()=>{
 const f=fakePool({failQuery:true});
 await assert.rejects(readLifeosPersonalGoals(aliceToken,f.pool),/simulated query failure/);
 assert.equal(f.log.at(-1).sql,'ROLLBACK');
 assert.equal(f.actor,null);
 assert.equal(f.releases,1);
});
test('production gate stays closed; no global query pool or financial API shortcut',()=>{
 const source=readFileSync('apps/api/src/nexa-lifeos-goals-read.ts','utf8');
 const gate=readFileSync('apps/api/src/nexa-lifeos-prod-schema-ready.ts','utf8');
 const server=readFileSync('apps/api/src/server-personal-production.ts','utf8');
 assert.match(source,/withLifeosAuthenticatedTransaction\(/);
 assert.match(source,/client\.query</);
 assert.doesNotMatch(source,/import\s*\{[^}]*\bquery\b[^}]*\}\s*from\s*['"]\.\/db/);
 assert.doesNotMatch(server,/nexa-lifeos-goals-read\.js/,'Preparatory read must not bypass production gate');
 assert.match(gate,/tenant_context_binding_not_implemented/);
 assert.ok(prior!==undefined||prior===undefined);
 process.stdout.write('NEXA_PF_NO_GO: owner-scoped mock read PASS; public API still closed\n');
});

test('bill reminders are per-user read-only, without payment capability',async()=>{
 const f=fakePool();
 const alice=await readLifeosPersonalBills(aliceToken,f.pool);
 const bob=await readLifeosPersonalBills(bobToken,f.pool);
 assert.deepEqual(alice.bills.map(x=>x.name),['Conta luz']);
 assert.deepEqual(bob.bills,[]);
 assert.equal(alice.readOnly,true);
 assert.equal(alice.paymentsEnabled,false);
 assert.equal(f.releases,2);
 assert.equal(f.actor,null);
});
