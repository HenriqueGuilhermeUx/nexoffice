import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {authorizeUSAgenticWalletRead,revokeUSAgenticWalletRead}
 from '../apps/api/dist/personal-us-agentic-consent-store.js';
import {evaluatePersonalUSAgenticRead,USA_AGENTIC_ALLOWED_TOKEN,USA_AGENTIC_READ_CAPABILITY}
 from '../apps/api/dist/personal-us-agentic-trust.js';

if(process.env.NEX_PERSONAL_US_PG_CI!=='true')throw Error('US_AGENTIC_CI_FLAG_MISSING');
const root=new URL(String(process.env.DATABASE_URL||''));
if(root.protocol!=='postgresql:'||root.hostname!=='127.0.0.1'||
 root.port!=='5432'||root.pathname!=='/nexoffice')
 throw Error('US_AGENTIC_REFUSES_NON_DISPOSABLE_DB');
const sql=await readFile(
 new URL('../docs/sql/nex-personal-us-agentic-consent-review-only.sql',import.meta.url),'utf8');
const admin=new pg.Client({connectionString:root.toString()});
await admin.connect();
let pool;
try{
 await assert.rejects(admin.query(sql),/USA Agentics consent schema denied/);
 await admin.query('ROLLBACK');
 assert.equal((await admin.query(
  "SELECT to_regclass('nex_personal_us.wallet_agentic_read_consents') AS table")).rows[0].table,null);
 const url=new URL(root);url.pathname='/nex_personal_us_ci';
 pool=new pg.Pool({connectionString:url.toString(),max:4});
 await pool.query(sql);
 const rls=await pool.query(`SELECT relrowsecurity,relforcerowsecurity
  FROM pg_class WHERE oid='nex_personal_us.wallet_agentic_read_consents'::regclass`);
 assert.equal(rls.rows[0].relrowsecurity,true);
 assert.equal(rls.rows[0].relforcerowsecurity,true);
 assert.equal((await pool.query(`SELECT count(*)::int AS n FROM pg_policies
   WHERE schemaname='nex_personal_us' AND tablename='wallet_agentic_read_consents'`)).rows[0].n,0);

 const owner='us_consent_subject_'+randomUUID().slice(0,8);
 const stranger='us_consent_other_'+randomUUID().slice(0,8);
 const profileId=randomUUID(),otherId=randomUUID(),bindingId=randomUUID();
 const addr='0x4444444444444444444444444444444444444444';
 await pool.query(`INSERT INTO nex_personal_us.profiles(id,auth_subject,status)
  VALUES($1,$2,'active'),($3,$4,'active')`,[profileId,owner,otherId,stranger]);
 await pool.query(`INSERT INTO nex_personal_us.wallet_bindings
  (id,owner_profile_id,source,wallet_address,chain_id,privy_project_id,privy_user_id,
   privy_wallet_id,verified_at)
  VALUES($1,$2,'privy',$3,137,$4,$5,$6,$7)`,[
    bindingId,profileId,addr,'us-agentic-consent-ci',
    'did:privy:consent-test-'+randomUUID(),'wallet-'+randomUUID(),new Date().toISOString()
  ]);
 const gesture=()=>({approvalId:randomUUID(),subject:owner,bindingId,
  approvedAt:new Date().toISOString(),capability:USA_AGENTIC_READ_CAPABILITY,
  source:'server_authenticated_explicit_gesture'});
 const args={pool,authenticatedUSSubject:owner,bindingId,now:new Date(),
  verifyExplicitGesture:async()=>gesture()};
 await assert.rejects(authorizeUSAgenticWalletRead({...args,
  authenticatedUSSubject:stranger}),/US_AGENTIC_EXPLICIT_APPROVAL_UNVERIFIED/);
 await assert.rejects(authorizeUSAgenticWalletRead({...args,
  verifyExplicitGesture:async()=>({...gesture(),source:'browser_claim'})}),
  /US_AGENTIC_EXPLICIT_APPROVAL_UNVERIFIED/);
 await assert.rejects(authorizeUSAgenticWalletRead({...args,
  verifyExplicitGesture:async()=>({...gesture(),approvedAt:new Date(Date.now()-180000).toISOString()})}),
  /US_AGENTIC_EXPLICIT_APPROVAL_UNVERIFIED/);
 const approved=gesture();
 const first=await authorizeUSAgenticWalletRead({...args,verifyExplicitGesture:async()=>approved});
 assert.equal(first.capability,USA_AGENTIC_READ_CAPABILITY);
 assert.equal(first.executionAllowed,false);
 assert.equal(first.signingAllowed,false);
 await assert.rejects(authorizeUSAgenticWalletRead({...args,verifyExplicitGesture:async()=>approved}),
  /duplicate key value violates unique constraint/);
 const issued=(await pool.query(`SELECT issued_at,expires_at,revoked_at
  FROM nex_personal_us.wallet_agentic_read_consents WHERE id=$1`,[first.consentId])).rows[0];
 assert.ok(issued.expires_at.getTime()-issued.issued_at.getTime()<=10*60_000);
 const reviewFacts={
  usSession:{subject:owner,verifiedByUSServer:true,status:'active'},
  walletBinding:{id:bindingId,ownerSubject:owner,address:addr,chainId:137,
   source:'privy',verifiedAt:new Date(Date.now()-60000).toISOString(),revokedAt:null},
  consent:{id:first.consentId,ownerSubject:owner,walletBindingId:bindingId,
   capability:USA_AGENTIC_READ_CAPABILITY,issuedAt:issued.issued_at.toISOString(),
   expiresAt:issued.expires_at.toISOString(),revokedAt:null,verifiedExplicitUserApproval:true},
  chainObservation:{chainId:137,tokenAddress:USA_AGENTIC_ALLOWED_TOKEN,walletAddress:addr,
   rawBalance:'0',decimals:6,source:'trusted_server_polygon_rpc',
   observedAt:new Date().toISOString()},now:new Date()
 };
 assert.equal(evaluatePersonalUSAgenticRead(reviewFacts).decision,'allow_read');
 const wrong=await revokeUSAgenticWalletRead({pool,authenticatedUSSubject:stranger,
  consentId:first.consentId,now:new Date()});
 assert.equal(wrong.revoked,false);
 assert.equal((await revokeUSAgenticWalletRead({pool,authenticatedUSSubject:owner,
  consentId:first.consentId,now:new Date()})).revoked,true);
 assert.equal((await revokeUSAgenticWalletRead({pool,authenticatedUSSubject:owner,
  consentId:first.consentId,now:new Date()})).revoked,false);
 const revoked=(await pool.query(`SELECT revoked_at
   FROM nex_personal_us.wallet_agentic_read_consents WHERE id=$1`,[first.consentId])).rows[0];
 assert.ok(revoked.revoked_at);
 assert.equal(evaluatePersonalUSAgenticRead({...reviewFacts,consent:{
  ...reviewFacts.consent,revokedAt:revoked.revoked_at.toISOString()
 }}).decision,'deny');
 const permits=await Promise.all([authorizeUSAgenticWalletRead({
  ...args,now:new Date(),verifyExplicitGesture:async()=>gesture()
 }),authorizeUSAgenticWalletRead({
  ...args,now:new Date(),verifyExplicitGesture:async()=>gesture()
 }),authorizeUSAgenticWalletRead({
  ...args,now:new Date(),verifyExplicitGesture:async()=>gesture()
 })]);
 assert.equal(permits.length,3);
 await assert.rejects(authorizeUSAgenticWalletRead({
  ...args,now:new Date(),verifyExplicitGesture:async()=>gesture()
 }),/US_AGENTIC_ACTIVE_CONSENT_LIMIT/);
 const events=await pool.query(`SELECT event_type FROM nex_personal_us.wallet_security_events
  WHERE owner_profile_id=$1 AND event_type LIKE 'agentic.%'`,[profileId]);
 assert.equal(events.rows.filter(x=>x.event_type==='agentic.read.authorized').length,4);
 assert.equal(events.rows.filter(x=>x.event_type==='agentic.read.revoked').length,1);
 console.log('PASS: USA Agentics persistent consent, evidence replay denial, owner scope, revocation and read-only Trust policy');
}finally{if(pool)await pool.end();await admin.end();}
