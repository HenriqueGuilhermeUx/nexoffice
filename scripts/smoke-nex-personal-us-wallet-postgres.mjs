import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {issuePersistedUSWalletChallenge,bindVerifiedUSExternalWallet,bindVerifiedUSPrivyWallet,bindPrivyUSAfterServerSession,revokeUSWalletBinding} from '../apps/api/dist/personal-us-wallet-binding-store.js';

/** Runs exclusively in GitHub Actions' disposable localhost PostgreSQL 16.
 * Verifier below is a synthetic test double, NOT actual EOA/EIP-1271 verification.
 */
if(process.env.NEX_PERSONAL_US_PG_CI!=='true')throw Error('US_POSTGRES_CI_DISABLED');
const root=String(process.env.DATABASE_URL||'');
const parsed=new URL(root);
if(parsed.protocol!=='postgresql:'||parsed.hostname!=='127.0.0.1'||
   parsed.port!=='5432'||parsed.pathname!=='/nexoffice')
  throw Error('US_CI_MUST_USE_DISPOSABLE_LOCAL_POSTGRES');
const sql=await readFile(new URL('../docs/sql/nex-personal-us-wallet-identity-review-only.sql',import.meta.url),'utf8');
assert.equal((sql.match(/CREATE TABLE IF NOT EXISTS/g)||[]).length,4,'Exactly four US tables');
assert.equal((sql.match(/COMMIT;/g)||[]).length,1,'No duplicated SQL');
assert.match(sql,/current_database\(\)/,'Fail-closed database-name guard');

const admin=new pg.Client({connectionString:root});
await admin.connect();
let usPool;
try{
 await assert.rejects(admin.query(sql),/US wallet migration denied/);
 await admin.query('ROLLBACK'); // Restore session after explicit BEGIN rejected by guard.
 // Runtime guard independently blocks wallet commands against a business DB,
 // including legitimate-looking subjects and IDs, before any profile lookup.
 const nonUsPool=new pg.Pool({connectionString:root,max:2});
 try{
  await assert.rejects(issuePersistedUSWalletChallenge({
   pool:nonUsPool,authenticatedUSSubject:'us_subject_wrong_db',
   walletAddress:'0x1111111111111111111111111111111111111111',
   trustedOrigin:'https://personal-us-ci.example.test',now:new Date()
  }),/US_WALLET_WRONG_DATABASE/);
  await assert.rejects(revokeUSWalletBinding({
   pool:nonUsPool,authenticatedUSSubject:'us_subject_wrong_db',
   bindingId:randomUUID(),now:new Date()
  }),/US_WALLET_WRONG_DATABASE/);
  await assert.rejects(bindVerifiedUSExternalWallet({
   pool:nonUsPool,authenticatedUSSubject:'us_subject_wrong_db',
   challengeId:randomUUID(),trustedOrigin:'https://personal-us-ci.example.test',
   signedMessage:'placeholder',signature:'0x'+'ab'.repeat(65),
   verifier:async()=>({verified:true,recoveredAddress:'0x1111111111111111111111111111111111111111',
    verificationType:'eoa'}),now:new Date()
  }),/US_WALLET_WRONG_DATABASE/);
 }finally{await nonUsPool.end();}
 const leaked=await admin.query("SELECT to_regnamespace('nex_personal_us') AS schema");
 assert.equal(leaked.rows[0].schema,null,'US schema must not appear in business test DB');
 await admin.query('CREATE DATABASE nex_personal_us_ci');
 const usUrl=new URL(root);usUrl.pathname='/nex_personal_us_ci';
 usPool=new pg.Pool({connectionString:usUrl.toString(),max:5,connectionTimeoutMillis:3000});
 await usPool.query(sql);
 const tables=await usPool.query(`
  SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='nex_personal_us' AND c.relkind='r' ORDER BY c.relname`);
 assert.equal(tables.rows.length,4);
 assert.ok(tables.rows.every(r=>r.relrowsecurity===true&&r.relforcerowsecurity===true));
 const policies=await usPool.query("SELECT count(*)::int AS n FROM pg_policies WHERE schemaname='nex_personal_us'");
 assert.equal(policies.rows[0].n,0,'No broad policies permitted');

 const [a,b,c]=[randomUUID(),randomUUID(),randomUUID()];
 const [userA,userB,userC]=['us_subject_alpha','us_subject_bravo','us_subject_charlie'];
 const addr='0x1111111111111111111111111111111111111111';
 const origin='https://personal-us-ci.example.test';
 await usPool.query(`INSERT INTO nex_personal_us.profiles(id,auth_subject,status)
 VALUES($1,$2,'active'),($3,$4,'active'),($5,$6,'active')`,[a,userA,b,userB,c,userC]);
 // Role-level proof: even with explicit SELECT/INSERT grants, FORCE RLS and
 // no policies keep US customer profiles invisible/unwritable to ordinary roles.
 await usPool.query('CREATE ROLE npu_wallet_ci_restricted NOLOGIN');
 await usPool.query('GRANT USAGE ON SCHEMA nex_personal_us TO npu_wallet_ci_restricted');
 await usPool.query('GRANT SELECT,INSERT ON nex_personal_us.profiles TO npu_wallet_ci_restricted');
 const restricted=await usPool.connect();
 try {
  await restricted.query('BEGIN');
  await restricted.query('SET LOCAL ROLE npu_wallet_ci_restricted');
  const hidden=await restricted.query('SELECT count(*)::int AS n FROM nex_personal_us.profiles');
  assert.equal(hidden.rows[0].n,0,'RLS must hide records despite table SELECT grant');
  await assert.rejects(
   restricted.query("INSERT INTO nex_personal_us.profiles(id,auth_subject,status) VALUES($1,'us_subject_rogue','active')",[randomUUID()]),
   /row-level security policy/);
 } finally {
  await restricted.query('ROLLBACK');
  restricted.release();
 }

 async function challenge(subject){
  return issuePersistedUSWalletChallenge({
   pool:usPool,authenticatedUSSubject:subject,walletAddress:addr,
   trustedOrigin:origin,now:new Date()
  });
 }
 await assert.rejects(challenge('us_subject_unknown'),/US_IDENTITY_NOT_ACTIVE/);
 const first=await challenge(userA);
 assert.equal(first.executionAllowed,false);
 const issuedEvents=await usPool.query(
   "SELECT count(*)::int AS n FROM nex_personal_us.wallet_security_events WHERE event_type='challenge.issued'");
 assert.equal(issuedEvents.rows[0].n,1,'Challenge persisted with audit event');
 const verifier=async()=>({verified:true,recoveredAddress:addr,verificationType:'eoa'});
 const args=(issued,subject)=>({
  pool:usPool,authenticatedUSSubject:subject,challengeId:issued.challengeId,
  trustedOrigin:origin,signedMessage:issued.message,signature:'0x'+'ab'.repeat(65),
  verifier,now:new Date()
 });
 await assert.rejects(bindVerifiedUSExternalWallet(args(first,userB)),/US_CHALLENGE_NOT_FOUND/);
 const result=await Promise.allSettled([
  bindVerifiedUSExternalWallet(args(first,userA)),
  bindVerifiedUSExternalWallet(args(first,userA))
 ]);
 assert.equal(result.filter(r=>r.status==='fulfilled').length,1,'Parallel nonce replay allowed');
 assert.equal(result.filter(r=>r.status==='rejected').length,1);
 const binding=result.find(r=>r.status==='fulfilled').value;
 assert.equal(binding.executionAllowed,false);
 const consumed=await usPool.query('SELECT consumed_at FROM nex_personal_us.wallet_ownership_challenges WHERE id=$1',[first.challengeId]);
 assert.ok(consumed.rows[0].consumed_at);
 const other=await challenge(userB);
 await assert.rejects(bindVerifiedUSExternalWallet(args(other,userB)),/duplicate key value violates unique constraint/);
 const rolled=await usPool.query('SELECT consumed_at FROM nex_personal_us.wallet_ownership_challenges WHERE id=$1',[other.challengeId]);
 assert.equal(rolled.rows[0].consumed_at,null,'Failed cross-owner insert must rollback nonce');
 const wrong=await revokeUSWalletBinding({pool:usPool,authenticatedUSSubject:userB,bindingId:binding.walletBindingId,now:new Date()});
 assert.equal(wrong.revoked,false);
 const own=await revokeUSWalletBinding({pool:usPool,authenticatedUSSubject:userA,bindingId:binding.walletBindingId,now:new Date()});
 assert.equal(own.revoked,true);
 const after=await bindVerifiedUSExternalWallet(args(other,userB));
 assert.equal(after.ownerSubject,userB,'Revoked address can only be rebound with a fresh valid proof');
 const events=await usPool.query('SELECT event_type FROM nex_personal_us.wallet_security_events');
 assert.equal(events.rows.filter(e=>e.event_type==='binding.created').length,2);
 assert.equal(events.rows.filter(e=>e.event_type==='binding.revoked').length,1);
 const all=await Promise.all([challenge(userC),challenge(userC),challenge(userC)]);
 assert.equal(new Set(all.map(x=>x.challengeId)).size,3);
 await assert.rejects(challenge(userC),/US_CHALLENGE_RATE_LIMITED/);
 const privyAddress='0x3333333333333333333333333333333333333333';
 const evidence={projectId:'us-privy-ci-project',userId:'did:privy:us-alpha',
  walletId:'wallet-ci-alpha',address:privyAddress,
  linkedToAuthenticatedSubject:userA,chainType:'ethereum',walletType:'embedded',
  control:'user',recoveryConfigured:true,additionalSigners:[],
  verifiedAt:new Date(Date.now()-1000).toISOString()};
 const privyArgs={
   pool:usPool,authenticatedUSSubject:userA,dedicatedUSPrivyProjectId:evidence.projectId,
   loadVerifiedEvidence:async()=>evidence,now:new Date()
 };
 await assert.rejects(bindVerifiedUSPrivyWallet({
  ...privyArgs,dedicatedUSPrivyProjectId:'br-privy-project'
 }),/PRIVY_PROJECT_MISMATCH/);
 await assert.rejects(bindVerifiedUSPrivyWallet({
  ...privyArgs,loadVerifiedEvidence:async()=>({...evidence,additionalSigners:['delegated']})
 }),/PRIVY_DELEGATED_SIGNERS_PRESENT/);
 await assert.rejects(bindVerifiedUSPrivyWallet({
  ...privyArgs,authenticatedUSSubject:userB
 }),/PRIVY_IDENTITY_NOT_LINKED/);
 const jwt='eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJkaWQ6cHJpdnk6dXMtYWxwaGEifQ.c2ln';
 const unix=Math.floor(Date.now()/1000);
 const serverArgs={
  pool:usPool,authenticatedUSSubject:userA,bearerToken:jwt,
  dedicatedUSPrivyProjectId:evidence.projectId,
  verificationKey:'CI-SYNTHETIC-KEY-NOT-VALID-FOR-USERS',
  expectedIssuer:'privy.io',
  verifyAccessToken:async()=>({
   app_id:evidence.projectId,issuer:'privy.io',issued_at:unix-30,
   expiration:unix+600,session_id:'privy-session-ci',user_id:evidence.userId
  }),
  resolveUSPrivyUserId:async subject=>subject===userA?evidence.userId:'different-privy-account',
  fetchVerifiedUSWalletEvidence:async()=>evidence,now:new Date()
 };
 await assert.rejects(bindPrivyUSAfterServerSession({
  ...serverArgs,resolveUSPrivyUserId:async()=> 'did:privy:br-account'
 }),/US_PRIVY_SESSION_NOT_LINKED_TO_OWNER/);
 await assert.rejects(bindPrivyUSAfterServerSession({
  ...serverArgs,fetchVerifiedUSWalletEvidence:async()=>({...evidence,userId:'did:privy:another-user'})
 }),/US_PRIVY_PROVIDER_USER_MISMATCH/);
 await assert.rejects(bindPrivyUSAfterServerSession({
  ...serverArgs,dedicatedUSPrivyProjectId:'privy-br-not-usa'
 }),/US_PRIVY_TOKEN_CLAIMS_INVALID/);
 const embedded=await bindPrivyUSAfterServerSession(serverArgs);
 assert.equal(embedded.executionAllowed,false);
 assert.equal(embedded.delegatedAgentSigningAllowed,false);
 const stored=await usPool.query("SELECT privy_project_id,privy_wallet_id,source FROM nex_personal_us.wallet_bindings WHERE id=$1",[embedded.bindingId]);
 assert.equal(stored.rows[0].privy_project_id,evidence.projectId);
 assert.equal(stored.rows[0].source,'privy');
 await assert.rejects(bindVerifiedUSPrivyWallet({
  ...privyArgs,loadVerifiedEvidence:async()=>({...evidence,walletId:'wallet-ci-duplicate-address'})
 }),/duplicate key value violates unique constraint/);
 const revokePrivy=await revokeUSWalletBinding({pool:usPool,authenticatedUSSubject:userA,
  bindingId:embedded.bindingId,now:new Date()});
 assert.equal(revokePrivy.revoked,true);
 console.log('USA wallet PG16: SQL guard, RLS, challenge limit, nonce races, address uniqueness, audit/revoke and Privy project isolation PASS');
}finally{
 if(usPool)await usPool.end();
 await admin.end();
}
