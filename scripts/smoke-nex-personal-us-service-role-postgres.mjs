import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';

/**
 * Disposable Postgres 16 role/RLS acceptance test, no prod migrations.
 * Verify the dedicated US trusted backend can execute *only* wallet/consent
 * operations while an untrusted role cannot see or change anything, even if
 * explicitly granted broad DML in this throwaway database.
 */
if(process.env.NEX_PERSONAL_US_PG_CI!=='true')
 throw Error('US_SERVICE_ROLE_CI_FLAG_REQUIRED');
const root=new URL(String(process.env.DATABASE_URL||''));
if(root.protocol!=='postgresql:'||root.hostname!=='127.0.0.1'||
 root.port!=='5432'||root.pathname!=='/nexoffice')
 throw Error('US_SERVICE_ROLE_NON_DISPOSABLE_DATABASE_DENIED');
const admin=new pg.Client({connectionString:root.toString()});
await admin.connect();
const database='nex_personal_us_service_ci',service='npu_us_wallet_service',
 attacker='npu_us_ci_untrusted_service_probe';
let pool;
const uuid=()=>randomUUID();
const failure42501=error=>error?.code==='42501';
async function underRole(client,role,operation){
 await client.query('BEGIN');
 try{
  await client.query('SET LOCAL ROLE '+role);
  const result=await operation(client);
  await client.query('COMMIT');
  return result;
 }catch(error){
  try{await client.query('ROLLBACK');}catch{}
  throw error;
 }
}
async function denied(client,sql,params=[]){
 await client.query('SAVEPOINT privilege_probe');
 await assert.rejects(client.query(sql,params),failure42501);
 await client.query('ROLLBACK TO SAVEPOINT privilege_probe');
}
try{
 const identitySQL=await readFile(new URL(
  '../docs/sql/nex-personal-us-wallet-identity-review-only.sql',import.meta.url),'utf8');
 const consentSQL=await readFile(new URL(
  '../docs/sql/nex-personal-us-agentic-consent-review-only.sql',import.meta.url),'utf8');
 const roleSQL=await readFile(new URL(
  '../docs/sql/nex-personal-us-service-role-review-only.sql',import.meta.url),'utf8');
 await assert.rejects(admin.query(roleSQL),/USA service role DDL denied/);
 await admin.query('ROLLBACK');
 await admin.query('CREATE DATABASE '+database);
 const url=new URL(root);url.pathname='/'+database;
 pool=new pg.Pool({connectionString:url.toString(),max:3,connectionTimeoutMillis:3000});
 await pool.query(identitySQL);
 await pool.query(consentSQL);
 await pool.query(roleSQL);
 const roleInfo=await admin.query(
  'SELECT rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolinherit FROM pg_roles WHERE rolname=$1',
  [service]);
 assert.equal(roleInfo.rows.length,1);
 assert.ok(Object.values(roleInfo.rows[0]).every(x=>x===false),
  'The trusted service MUST be a NOLOGIN/NOINHERIT non-superuser without RLS bypass');
 assert.equal((await pool.query(
  "SELECT count(*)::int AS n FROM pg_policies WHERE schemaname='nex_personal_us'")).rows[0].n,11);
 const {rows:tableSecurity}=await pool.query(
  `SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity
     FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='nex_personal_us' AND c.relkind='r'`);
 assert.equal(tableSecurity.length,5);
 assert.ok(tableSecurity.every(x=>x.relrowsecurity&&x.relforcerowsecurity));
 const owner=uuid(),external=uuid(),consent=uuid(),challenge=uuid();
 const walletAddress='0x6666666666666666666666666666666666666666';
 const walletOwner='us_role_review_owner_123';
 await pool.query(
  "INSERT INTO nex_personal_us.profiles(id,auth_subject,status) VALUES($1,$2,'active')",
  [owner,walletOwner]);
 // Trusted NOLOGIN service can read existing profiles, but cannot create or
 // alter them: identity onboarding is a separate scope.
 const svc=await pool.connect();
 try{
  await underRole(svc,service,async conn=>{
   const profile=await conn.query(
    'SELECT id FROM nex_personal_us.profiles WHERE auth_subject=$1',[walletOwner]);
   assert.equal(profile.rows[0].id,owner);
   await denied(conn,
    "INSERT INTO nex_personal_us.profiles(id,auth_subject,status) VALUES($1,'us_role_illegal','active')",
    [uuid()]);
   await denied(conn,
    "UPDATE nex_personal_us.profiles SET status='blocked' WHERE id=$1",[owner]);
   await denied(conn,'DELETE FROM nex_personal_us.profiles WHERE id=$1',[owner]);
   await denied(conn,'SELECT id FROM nex_personal_us.wallet_security_events');
   const now=new Date();
   const expires=new Date(now.getTime()+4*60_000);
   await conn.query(
    `INSERT INTO nex_personal_us.wallet_ownership_challenges
     (id,owner_profile_id,chain_id,wallet_address,trusted_origin,nonce_sha256,
      message_sha256,issued_at,expires_at)
     VALUES($1,$2,137,$3,'https://us-nexa-ci.example.test',$4,$5,$6,$7)`,
    [challenge,owner,walletAddress,'a'.repeat(64),'b'.repeat(64),now,expires]);
   const consumed=await conn.query(
    'UPDATE nex_personal_us.wallet_ownership_challenges SET consumed_at=$1 WHERE id=$2 RETURNING id',
    [new Date(now.getTime()+2000),challenge]);
   assert.equal(consumed.rows[0].id,challenge);
   await denied(conn,
    "UPDATE nex_personal_us.wallet_ownership_challenges SET wallet_address='0x7777777777777777777777777777777777777777' WHERE id=$1",
    [challenge]);
   const linked=await conn.query(
    `INSERT INTO nex_personal_us.wallet_bindings
     (id,owner_profile_id,source,wallet_address,chain_id,proof_challenge_id,verified_at)
     VALUES($1,$2,'external',$3,137,$4,$5) RETURNING id`,
    [external,owner,walletAddress,challenge,now]);
   assert.equal(linked.rows[0].id,external);
   await denied(conn,
    "UPDATE nex_personal_us.wallet_bindings SET wallet_address='0x7777777777777777777777777777777777777777' WHERE id=$1",
    [external]);
   await conn.query(
    `INSERT INTO nex_personal_us.wallet_security_events
      (id,owner_profile_id,event_type) VALUES($1,$2,'binding.created')`,
    [uuid(),owner]);
   const readGrant=await conn.query(
    `INSERT INTO nex_personal_us.wallet_agentic_read_consents
     (id,owner_profile_id,wallet_binding_id,approval_evidence_id,issued_at,expires_at)
     VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
    [consent,owner,external,uuid(),now,new Date(now.getTime()+10*60_000)]);
   assert.equal(readGrant.rows[0].id,consent);
   await denied(conn,
    "UPDATE nex_personal_us.wallet_agentic_read_consents SET capability='wallet.execute' WHERE id=$1",
    [consent]);
   await denied(conn,
    'DELETE FROM nex_personal_us.wallet_agentic_read_consents WHERE id=$1',[consent]);
   await conn.query('UPDATE nex_personal_us.wallet_agentic_read_consents SET revoked_at=$1 WHERE id=$2',
    [new Date(now.getTime()+1000),consent]);
   await conn.query('UPDATE nex_personal_us.wallet_bindings SET revoked_at=$1 WHERE id=$2',
    [new Date(now.getTime()+2000),external]);
  });
 }finally{svc.release();}
 const adminResult=await pool.query(
  'SELECT revoked_at FROM nex_personal_us.wallet_agentic_read_consents WHERE id=$1',
  [consent]);
 assert.ok(adminResult.rows[0].revoked_at,'Trusted service can persist narrow revoke');
 assert.equal((await pool.query(
  "SELECT status FROM nex_personal_us.profiles WHERE id=$1",[owner])).rows[0].status,'active');

 // Probe an unrelated role with intentionally overbroad SQL grants. With
 // FORCE RLS + role-specific policies it STILL has zero row visibility.
 await admin.query('CREATE ROLE '+attacker+' NOLOGIN');
 await pool.query('GRANT USAGE ON SCHEMA nex_personal_us TO '+attacker);
 await pool.query(
  'GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA nex_personal_us TO '+attacker);
 const attackerClient=await pool.connect();
 try{
  await underRole(attackerClient,attacker,async conn=>{
   const tables=['profiles','wallet_bindings','wallet_ownership_challenges',
    'wallet_security_events','wallet_agentic_read_consents'];
   for(const table of tables){
    const rows=await conn.query('SELECT count(*)::int AS n FROM nex_personal_us.'+table);
    assert.equal(rows.rows[0].n,0,'Untrusted role cannot see '+table);
   }
   const updated=await conn.query(
    "UPDATE nex_personal_us.profiles SET status='blocked' WHERE id=$1 RETURNING id",[owner]);
   assert.equal(updated.rowCount,0,'Untrusted profile updates blocked by RLS');
   const revoked=await conn.query(
    'DELETE FROM nex_personal_us.wallet_agentic_read_consents WHERE id=$1 RETURNING id',[consent]);
   assert.equal(revoked.rowCount,0,'Untrusted consent deletes blocked by RLS');
   await denied(conn,
    "INSERT INTO nex_personal_us.profiles(id,auth_subject,status) VALUES($1,'us_role_attack','active')",
    [uuid()]);
  });
 }finally{attackerClient.release();}
 console.log('PASS: dedicated USA NOLOGIN service minimal DML + FORCE RLS untrusted row denial');
}finally{
 if(pool)await pool.end();
 try{await admin.query('DROP DATABASE IF EXISTS '+database+' WITH (FORCE)');}catch{}
 try{await admin.query('DROP ROLE IF EXISTS '+attacker);}catch{}
 try{await admin.query('DROP ROLE IF EXISTS '+service);}catch{}
 await admin.end();
}
