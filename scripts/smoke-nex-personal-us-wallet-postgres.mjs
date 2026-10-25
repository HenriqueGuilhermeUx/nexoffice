import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {issuePersonalUSWalletChallenge} from '../apps/api/dist/personal-us-wallet-ownership.js';
import {bindVerifiedUSExternalWallet,revokeUSWalletBinding} from '../apps/api/dist/personal-us-wallet-binding-store.js';

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

 const [a,b]=[randomUUID(),randomUUID()];
 const [userA,userB]=['us_subject_alpha','us_subject_bravo'];
 const addr='0x1111111111111111111111111111111111111111';
 const origin='https://personal-us-ci.example.test';
 const now=new Date();
 await usPool.query(`INSERT INTO nex_personal_us.profiles(id,auth_subject,status)
 VALUES($1,$2,'active'),($3,$4,'active')`,[a,userA,b,userB]);
 async function challenge(subject,profileId){
  const issued=issuePersonalUSWalletChallenge({ownerSubject:subject,address:addr,trustedOrigin:origin,now:new Date()});
  await usPool.query(`
    INSERT INTO nex_personal_us.wallet_ownership_challenges
      (id,owner_profile_id,chain_id,wallet_address,trusted_origin,
       nonce_sha256,message_sha256,issued_at,expires_at)
    VALUES($1,$2,137,$3,$4,$5,$6,$7,$8)`,[
     issued.challenge.id,profileId,addr,origin,issued.challenge.nonceHash,
     createHash('sha256').update(issued.message).digest('hex'),
     issued.challenge.issuedAt,issued.challenge.expiresAt
   ]);
   return issued;
 }
 const first=await challenge(userA,a);
 const verifier=async()=>({verified:true,recoveredAddress:addr,verificationType:'eoa'});
 const args=(issued,subject)=>({
  pool:usPool,authenticatedUSSubject:subject,challengeId:issued.challenge.id,
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
 const consumed=await usPool.query('SELECT consumed_at FROM nex_personal_us.wallet_ownership_challenges WHERE id=$1',[first.challenge.id]);
 assert.ok(consumed.rows[0].consumed_at);
 const other=await challenge(userB,b);
 await assert.rejects(bindVerifiedUSExternalWallet(args(other,userB)),/duplicate key value violates unique constraint/);
 const rolled=await usPool.query('SELECT consumed_at FROM nex_personal_us.wallet_ownership_challenges WHERE id=$1',[other.challenge.id]);
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
 console.log('USA wallet PG16: SQL guard, RLS, atomic nonce concurrency, uniqueness, rollback and revocation PASS');
}finally{
 if(usPool)await usPool.end();
 await admin.end();
}
