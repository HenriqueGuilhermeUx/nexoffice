/**
 * Owner-isolation RLS rehearsal in the same disposable GitHub Actions database
 * created by rehearse-nexa-lifeos-prod-ddl-ci.mjs. NOT a prod migration runner.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import pg from 'pg';
import {createHash} from 'node:crypto';

if(process.env.CI!=='true'||process.env.GITHUB_ACTIONS!=='true'
   ||process.env.NEXA_LIFEOS_SCHEMA_REHEARSAL!=='true')
  throw new Error('Nexa PF RLS rehearsal requires explicit disposable GitHub CI context');
const base=new URL(process.env.DATABASE_URL||'postgresql://invalid');
if(!['localhost','127.0.0.1'].includes(base.hostname)||base.port!=='5432'
   ||base.pathname!=='/nexoffice')
 throw new Error('Nexa PF RLS rehearsal refuses remote or non-GitHub PostgreSQL');
if(process.env.NEXA_LIFEOS_ENV==='production'||process.env.NEX_PERSONAL_PREVIEW==='true')
 throw new Error('Nexa PF RLS rehearsal cannot run in production/preview');

const ciUrl=new URL(base);
ciUrl.pathname='/nexa_lifeos_schema_rehearsal_ci';
const db=new pg.Client({connectionString:ciUrl.toString(),connectionTimeoutMillis:5000});
await db.connect();
const file='infra/nexa-lifeos-prod/001_owner_rls.sql';
const contents=readFileSync(file,'utf8');
assert.ok(contents.includes('force row level security'));
const sqlSha256=createHash('sha256').update(contents).digest('hex');
try{
 await db.query('BEGIN');
 try{await db.query(contents);await db.query('COMMIT');}
 catch(e){await db.query('ROLLBACK');throw Error('Nexa PF RLS DDL failed in disposable CI',{cause:e});}
 const tbls=await db.query("select c.relname,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='nex_personal' and c.relkind='r' order by c.relname");
 assert.equal(tbls.rowCount,12,'Only the known 12 PF tables may receive the owner policy');
 for(const table of tbls.rows){
  assert.equal(table.relrowsecurity,true,'RLS disabled: '+table.relname);
  assert.equal(table.relforcerowsecurity,true,'Table owner bypass still possible: '+table.relname);
 }
 const policies=await db.query("select tablename,policyname,cmd from pg_policies where schemaname='nex_personal'");
 assert.equal(policies.rowCount,13,'12 PF tables require owner policy, audit events require read+append');
 // The test database owner is a Postgres CI superuser and would bypass RLS.
 // Simulate the ACTUAL runtime with a non-superuser/non-BYPASSRLS role.
 await db.query('CREATE ROLE nexa_pf_rls_ci NOLOGIN NOSUPERUSER NOBYPASSRLS');
 await db.query('GRANT USAGE ON SCHEMA nex_personal TO nexa_pf_rls_ci');
 await db.query('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA nex_personal TO nexa_pf_rls_ci');
 await db.query('GRANT SELECT ON public.users TO nexa_pf_rls_ci');
 const role=await db.query("select rolsuper,rolbypassrls from pg_roles where rolname='nexa_pf_rls_ci'");
 assert.equal(role.rowCount,1);
 assert.equal(role.rows[0].rolsuper,false);
 assert.equal(role.rows[0].rolbypassrls,false);
 const one='11111111-1111-4111-8111-111111111111';
 const two='22222222-2222-4222-8222-222222222222';
 await db.query('BEGIN');
 try{
  // These fake rows live ONLY in an open transaction that is always rolled back.
  await db.query("insert into public.users(id,name,email,password_hash) values ($1,'CI Actor One','ci-one@example.test','ci-dummy'),($2,'CI Actor Two','ci-two@example.test','ci-dummy')",[one,two]);
  await db.query('SET ROLE nexa_pf_rls_ci');
  const activeRole=await db.query('select current_user');
  assert.equal(activeRole.rows[0].current_user,'nexa_pf_rls_ci','RLS tests must never run as PostgreSQL superuser');
  const actor=async id=>db.query("select set_config('nexa.actor_id',$1,true)",[id]);
  await actor(one);
  await db.query('insert into nex_personal.profiles(user_id) values($1)',[one]);
  await db.query("insert into nex_personal.life_intents(owner_user_id,kind) values($1,'trip')",[one]);
  await db.query("insert into nex_personal.audit_events(owner_user_id,actor_user_id,action,subject_type) values($1,$1,'ci.checked','life_intent')",[one]);
  await actor(two);
  await db.query('insert into nex_personal.profiles(user_id) values($1)',[two]);
  await db.query("insert into nex_personal.life_intents(owner_user_id,kind) values($1,'buy_car')",[two]);
  for(const [id,label] of [[one,'one'],[two,'two']]){
   await actor(id);
   const profile=await db.query('select user_id from nex_personal.profiles');
   const intentions=await db.query('select owner_user_id from nex_personal.life_intents');
   assert.deepEqual(profile.rows.map(r=>r.user_id),[id],'PF actor '+label+' must see only own profile');
   assert.deepEqual(intentions.rows.map(r=>r.owner_user_id),[id],'PF actor '+label+' must see only own life intent');
  }
  await actor('');
  const zero=await db.query('select count(*)::int n from nex_personal.profiles');
  assert.equal(zero.rows[0].n,0,'Missing actor must return zero PF rows');
  await actor(one);
  const blockedUpdate=await db.query("update nex_personal.life_intents set status='done' where owner_user_id=$1",[two]);
  assert.equal(blockedUpdate.rowCount,0,'Cross-tenant writes must see zero rows');
  const blockedDelete=await db.query("delete from nex_personal.audit_events where owner_user_id=$1",[one]);
  assert.equal(blockedDelete.rowCount,0,'Audit history is append-only');
  await db.query('SAVEPOINT pf_cross_tenant_insert');
  let crossTenantDenied=false;
  try{
   await db.query("insert into nex_personal.life_intents(owner_user_id,kind) values($1,'trip')",[two]);
  }catch(e){
   crossTenantDenied=e.code==='42501';
   await db.query('ROLLBACK TO SAVEPOINT pf_cross_tenant_insert');
  }
  assert.equal(crossTenantDenied,true,'Cross-tenant insert must be rejected by PostgreSQL RLS');
  await db.query('SAVEPOINT pf_audit_spoof');
  let auditDenied=false;
  try{
   await db.query("insert into nex_personal.audit_events(owner_user_id,actor_user_id,action,subject_type) values($1,$2,'ci.spoof','profile')",[one,two]);
  }catch(e){
   auditDenied=e.code==='42501';
   await db.query('ROLLBACK TO SAVEPOINT pf_audit_spoof');
  }
  assert.equal(auditDenied,true,'Audit actor spoof must be rejected');
 }finally{
  // Rollback also undoes SET ROLE inside this transaction.
  await db.query('ROLLBACK');
 }
 const after=await db.query('select current_user');
 assert.notEqual(after.rows[0].current_user,'nexa_pf_rls_ci','Application role must not leak outside the rolled-back request');
 const zeroUsers=await db.query('select count(*)::int n from public.users');
 assert.equal(zeroUsers.rows[0].n,0,'Disposable DB must not retain fake profiles or user records');
 console.log(JSON.stringify({
  result:'NEXA_LIFEOS_EPHEMERAL_RLS_REHEARSAL_PASS',
  ciOnly:true,rlsTables:tbls.rowCount,forcedRlsTables:tbls.rowCount,nonBypassRuntimeRole:true,
  policies:policies.rowCount,twoActorIsolation:true,
  noActorDenied:true,foreignInsertDenied:true,auditSpoofDenied:true,
  fakeDataRolledBack:true,policySha256:sqlSha256,
  readiness:'Proof of database policy behavior only. API actor context, deployment role privileges and consent/security still require review.'
 }));
}finally{await db.end();}
