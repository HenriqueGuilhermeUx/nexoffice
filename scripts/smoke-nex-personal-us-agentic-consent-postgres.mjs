import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {authorizeUSAgenticWalletRead,revokeUSAgenticWalletRead}
 from '../apps/api/dist/personal-us-agentic-consent-store.js';
import {evaluatePersonalUSAgenticRead,USA_AGENTIC_ALLOWED_TOKEN,USA_AGENTIC_READ_CAPABILITY}
 from '../apps/api/dist/personal-us-agentic-trust.js';
import {assessServerUSAgenticRead}
 from '../apps/api/dist/personal-us-agentic-server-read.js';
import {assessPersonalUSNativeUSDCRead}
 from '../apps/api/dist/personal-us-agentic-polygon-read.js';
import {revokeUSWalletBinding}
 from '../apps/api/dist/personal-us-wallet-binding-store.js';

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
  "SELECT to_regclass('nex_personal_us.wallet_agentic_read_consents') AS relation")).rows[0].relation,null);
 // Server-side runtime must reject the wrong pool, independently of DDL guards.
 const wrongDbPool=new pg.Pool({connectionString:root.toString(),max:1});
 try{
  await assert.rejects(assessServerUSAgenticRead({
   pool:wrongDbPool,authenticatedUSSubject:'us_subject_wrong_db',
   consentId:randomUUID(),now:new Date(),
   fetchUSDCFromTrustedServer:async()=>{throw Error('RPC_MUST_NEVER_BE_REACHED');}
  }),/US_AGENTIC_WRONG_DATABASE/);
 }finally{await wrongDbPool.end();}
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
  approvedAt:new Date(Date.now()-1000).toISOString(),capability:USA_AGENTIC_READ_CAPABILITY,
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
 // Crucially, production-style authorization consults owner+binding+grant
 // *inside PostgreSQL*, not from any browser-supplied trust booleans.
 let rpcCalls=0;
 const trustedRPC=async requestedAddress=>{
   rpcCalls++;
   assert.equal(requestedAddress.toLowerCase(),addr.toLowerCase());
   return {chainId:137,tokenAddress:USA_AGENTIC_ALLOWED_TOKEN,
    walletAddress:addr,rawBalance:'42000000',decimals:6,
    source:'trusted_server_polygon_rpc',observedAt:new Date().toISOString()};
 };
 const readInput={pool,authenticatedUSSubject:owner,
  consentId:first.consentId,now:new Date(),fetchUSDCFromTrustedServer:trustedRPC};
 const read=await assessServerUSAgenticRead(readInput);
 assert.equal(read.decision.decision,'allow_read');
 assert.equal(read.rawUsdcBalance,'42000000');
 assert.equal(read.executionAllowed,false);
 assert.equal(rpcCalls,1);
 // End-to-end composition: this service never takes a caller-provided token or
 // contract address; the observation always targets native Circle USDC.
 let usdcContractReads=0;
 const client={
  getChainId:async()=>137,
  getBlockNumber:async()=>12345n,
  readContract:async call=>{
   usdcContractReads++;
   assert.equal(call.address.toLowerCase(),USA_AGENTIC_ALLOWED_TOKEN);
   assert.equal(call.functionName,'balanceOf');
   assert.deepEqual(call.args,[addr]);
   assert.equal(call.blockNumber,12345n);
   return 5000000n;
  }
 };
 const pinnedRead=await assessPersonalUSNativeUSDCRead({
  pool,authenticatedUSSubject:owner,consentId:first.consentId,
  polygonClient:client,now:new Date()
 });
 assert.equal(pinnedRead.decision.decision,'allow_read');
 assert.equal(pinnedRead.rawUsdcBalance,'5000000');
 assert.equal(usdcContractReads,1);
 const pinnedWrongOwner=await assessPersonalUSNativeUSDCRead({
  pool,authenticatedUSSubject:stranger,consentId:first.consentId,
  polygonClient:client,now:new Date()
 });
 assert.equal(pinnedWrongOwner.decision.decision,'deny');
 assert.equal(usdcContractReads,1,'No RPC when owner is not authorized');
 const nonOwner=await assessServerUSAgenticRead({
  ...readInput,authenticatedUSSubject:stranger
 });
 assert.equal(nonOwner.decision.decision,'deny');
 assert.equal(nonOwner.rawUsdcBalance,null);
 assert.equal(rpcCalls,1,'Non-owner must never reach the trusted RPC');
 const falseChain=await assessServerUSAgenticRead({
  ...readInput,fetchUSDCFromTrustedServer:async()=>({
   chainId:1,tokenAddress:USA_AGENTIC_ALLOWED_TOKEN,walletAddress:addr,
   rawBalance:'42000000',decimals:6,source:'trusted_server_polygon_rpc',
   observedAt:new Date().toISOString()
  })
 });
 assert.equal(falseChain.decision.decision,'deny');
 assert.equal(falseChain.rawUsdcBalance,null);
 // Permission may expire while a permitted server RPC is in progress:
 // the response MUST fail closed and suppress the balance.
 await pool.query(`UPDATE nex_personal_us.wallet_agentic_read_consents
  SET expires_at=now()+interval '100 milliseconds' WHERE id=$1`,[first.consentId]);
 const slow=await assessServerUSAgenticRead({
  ...readInput,fetchUSDCFromTrustedServer:async address=>{
   await new Promise(resolve=>setTimeout(resolve,250));
   return trustedRPC(address);
  }
 });
 assert.equal(slow.decision.decision,'deny');
 assert.equal(slow.rawUsdcBalance,null,'Expired consent must not expose a late RPC result');
 await pool.query(`UPDATE nex_personal_us.wallet_agentic_read_consents
  SET expires_at=$1 WHERE id=$2`,[issued.expires_at,first.consentId]);
 const wrong=await revokeUSAgenticWalletRead({pool,authenticatedUSSubject:stranger,
  consentId:first.consentId,now:new Date()});
 assert.equal(wrong.revoked,false);
 // Hold the server's shared DB read lock while a revocation starts.
 // Revocation must not overtake an in-flight authorized observation.
 let openReadGate;
 let markObservationStarted;
 const observationStarted=new Promise(resolve=>{markObservationStarted=resolve;});
 const readGate=new Promise(resolve=>{openReadGate=resolve;});
 const inFlightRead=assessServerUSAgenticRead({
  ...readInput,fetchUSDCFromTrustedServer:async address=>{
   markObservationStarted();
   await readGate;
   return trustedRPC(address);
  }
 });
 await observationStarted;
 let revokeFinished=false;
 const inFlightRevoke=revokeUSAgenticWalletRead({
  pool,authenticatedUSSubject:owner,consentId:first.consentId,now:new Date()
 }).then(result=>{revokeFinished=true;return result;});
 try {
  await new Promise(resolve=>setTimeout(resolve,80));
  assert.equal(revokeFinished,false,
    'Revocation must wait for the in-flight owner-bound read');
 }finally{openReadGate();}
 const [heldRead,heldRevoke]=await Promise.all([inFlightRead,inFlightRevoke]);
 assert.equal(heldRead.decision.decision,'allow_read');
 assert.equal(heldRevoke.revoked,true);
 assert.equal((await revokeUSAgenticWalletRead({pool,authenticatedUSSubject:owner,
  consentId:first.consentId,now:new Date()})).revoked,false);
 const revoked=(await pool.query(`SELECT revoked_at
   FROM nex_personal_us.wallet_agentic_read_consents WHERE id=$1`,[first.consentId])).rows[0];
 assert.ok(revoked.revoked_at);
 const callsBeforeRevokedRead=rpcCalls;
 const revokedRead=await assessServerUSAgenticRead(readInput);
 assert.equal(revokedRead.decision.decision,'deny');
 assert.equal(revokedRead.rawUsdcBalance,null);
 assert.equal(rpcCalls,callsBeforeRevokedRead,'Revoked consent must not issue another chain RPC');
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
 const lastConsent=permits[0];
 const activeRead=await assessServerUSAgenticRead({
  ...readInput,consentId:lastConsent.consentId,now:new Date()
 });
 assert.equal(activeRead.decision.decision,'allow_read');
 assert.equal((await revokeUSWalletBinding({
  pool,authenticatedUSSubject:owner,bindingId,now:new Date()
 })).revoked,true);
 const callsBeforeRevokedWalletRead=rpcCalls;
 const revokedWalletRead=await assessServerUSAgenticRead({
  ...readInput,consentId:lastConsent.consentId,now:new Date()
 });
 assert.equal(revokedWalletRead.decision.decision,'deny');
 assert.equal(revokedWalletRead.rawUsdcBalance,null);
 assert.equal(rpcCalls,callsBeforeRevokedWalletRead,'Revoked wallet must not cause an on-chain RPC');
 const events=await pool.query(`SELECT event_type FROM nex_personal_us.wallet_security_events
  WHERE owner_profile_id=$1 AND event_type LIKE 'agentic.%'`,[profileId]);
 assert.equal(events.rows.filter(x=>x.event_type==='agentic.read.authorized').length,4);
 assert.equal(events.rows.filter(x=>x.event_type==='agentic.read.revoked').length,1);
 console.log('PASS: USA Agentics persistent consent, evidence replay denial, owner scope, revocation and read-only Trust policy');
}finally{if(pool)await pool.end();await admin.end();}
