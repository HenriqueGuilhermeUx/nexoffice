import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';

/**
 * Database privilege acceptance gate, disposable localhost PG 16 ONLY.
 * Proves that FORCE RLS denies a non-owner role even if accidentally
 * granted broad table DML permissions. Not a substitute for prod role setup.
 */
if(process.env.NEX_PERSONAL_US_PG_CI!=='true')
 throw Error('USA_RLS_ROLE_TEST_NOT_APPROVED');
const root=new URL(String(process.env.DATABASE_URL||''));
if(root.protocol!=='postgresql:'||root.hostname!=='127.0.0.1'||
   root.port!=='5432'||root.pathname!=='/nexoffice')
 throw Error('USA_RLS_REFUSING_NON_DISPOSABLE_DB');
const admin=new pg.Client({connectionString:root.toString()});
await admin.connect();
const dbName='nex_personal_us_rls_ci';
const roleName='npu_rls_ci_untrusted';
let pool;
try{
 await admin.query('CREATE DATABASE '+dbName);
 const dbUrl=new URL(root);dbUrl.pathname='/'+dbName;
 pool=new pg.Pool({connectionString:dbUrl.toString(),max:2});
 const walletSql=await readFile(
  new URL('../docs/sql/nex-personal-us-wallet-identity-review-only.sql',import.meta.url),'utf8');
 const consentSql=await readFile(
  new URL('../docs/sql/nex-personal-us-agentic-consent-review-only.sql',import.meta.url),'utf8');
 await pool.query(walletSql);
 await pool.query(consentSql);
 const profile=randomUUID(),binding=randomUUID(),owner='us_rls_owner_subject';
 await pool.query(
  "INSERT INTO nex_personal_us.profiles(id,auth_subject,status) VALUES($1,$2,'active')",
  [profile,owner]);
 await pool.query(
  `INSERT INTO nex_personal_us.wallet_bindings
   (id,owner_profile_id,source,wallet_address,chain_id,privy_project_id,
    privy_user_id,privy_wallet_id,verified_at)
   VALUES($1,$2,'privy',$3,137,$4,$5,$6,now())`,
  [binding,profile,'0x5555555555555555555555555555555555555555',
   'test-privy-us','did:privy:rls-test-'+randomUUID(),'wallet-'+randomUUID()]
 );
 await pool.query(
  `INSERT INTO nex_personal_us.wallet_agentic_read_consents
   (id,owner_profile_id,wallet_binding_id,approval_evidence_id,issued_at,expires_at)
   VALUES($1,$2,$3,$4,now(),now()+interval '10 minutes')`,
  [randomUUID(),profile,binding,randomUUID()]
 );
 // Create only on the CI's ephemeral cluster; the role is deliberately
 // untrusted but gets broad table grants to test FORCE RLS defense in depth.
 await admin.query('CREATE ROLE '+roleName+' NOLOGIN');
 await pool.query('GRANT USAGE ON SCHEMA nex_personal_us TO '+roleName);
 await pool.query(
  'GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA nex_personal_us TO '+roleName
 );
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  await client.query('SET LOCAL ROLE '+roleName);
  const tables=['profiles','wallet_bindings','wallet_ownership_challenges',
   'wallet_security_events','wallet_agentic_read_consents'];
  for(const table of tables){
   const count=await client.query(
    'SELECT count(*)::int AS total FROM nex_personal_us.'+table
   );
   assert.equal(count.rows[0].total,0,'RLS must hide '+table);
  }
  const update=await client.query(
   "UPDATE nex_personal_us.profiles SET status='blocked' WHERE id=$1 RETURNING id",
   [profile]);
  assert.equal(update.rowCount,0,'Untrusted role must not modify owner via UPDATE');
  const remove=await client.query(
   'DELETE FROM nex_personal_us.wallet_agentic_read_consents RETURNING id'
  );
  assert.equal(remove.rowCount,0,'Untrusted role must not revoke grants via DELETE');
  // A failed insert aborts this transaction; run it under a SAVEPOINT so we
  // can inspect SQLSTATE and prove no policy allows INSERT.
  await client.query('SAVEPOINT attempt_untrusted_insert');
  await assert.rejects(
   client.query(
    "INSERT INTO nex_personal_us.profiles(id,auth_subject,status) VALUES($1,'us_rls_attack','active')",
    [randomUUID()]
   ),
   error=>error.code==='42501'
  );
  await client.query('ROLLBACK TO SAVEPOINT attempt_untrusted_insert');
  await client.query('ROLLBACK');
 }finally{client.release();}
 const counts=await pool.query(
  'SELECT count(*)::int AS n FROM nex_personal_us.wallet_agentic_read_consents'
 );
 assert.equal(counts.rows[0].n,1,'Admin must still see original protected consent');
 const profileCheck=await pool.query(
  'SELECT status FROM nex_personal_us.profiles WHERE id=$1',[profile]
 );
 assert.equal(profileCheck.rows[0].status,'active','Untrusted role must not alter protected owner');
 console.log('PASS: USA profiles/wallets/consents FORCE RLS deny an untrusted role, even under broad DML grants');
}finally{
 // Close every pooled client, then drop CI-only DB and role normally.
 // Never FORCE-kill sessions: late pg-pool errors would mask RLS test results.
 if(pool)await pool.end();
 await admin.query('DROP DATABASE IF EXISTS '+dbName);
 await admin.query('DROP ROLE IF EXISTS '+roleName);
 await admin.end();
}
