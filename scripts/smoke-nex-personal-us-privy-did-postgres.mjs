import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {withVerifiedUSPrivyIdentity}
 from '../apps/api/dist/personal-us-privy-owner-store.js';
import {bindUSPrivyWalletFromServerDID}
 from '../apps/api/dist/personal-us-privy-did-wallet-binding.js';
import {assessVerifiedPrivyUSNativeUSDCRead,revokeVerifiedPrivyUSAgenticWalletRead}
 from '../apps/api/dist/personal-us-privy-agentic-read.js';

/**
 * No production tokens. SDK verifier is injected and synthetic in this
 * Postgres privilege test; separate CI exercises @privy-io/node with real
 * ephemeral ES256 JWTs. Never confuse these two assurance levels.
 */
if(process.env.NEX_PERSONAL_US_PG_CI!=='true')
 throw Error('US_PRIVY_DID_POSTGRES_CI_DISABLED');
const root=new URL(String(process.env.DATABASE_URL||''));
if(root.protocol!=='postgresql:'||root.hostname!=='127.0.0.1'||
 root.port!=='5432'||root.pathname!=='/nexoffice')
 throw Error('US_PRIVY_DID_REFUSES_NON_DISPOSABLE_DB');
const admin=new pg.Client({connectionString:root.toString()});
await admin.connect();
const db='nex_personal_us_did_ci',role='npu_us_wallet_service';
let pool;
const load=async path=>readFile(new URL('../docs/sql/'+path,import.meta.url),'utf8');
// GitHub Actions destroys this entire disposable PostgreSQL service after CI.
// Do not FORCE-drop a database while asynchronous pooled PG listeners remain:
// that produces an unhandled 57P01 error *after* all security assertions pass.
const clean=async()=>{if(pool)await pool.end();await admin.end();};
try{
 const identitySql=await load('nex-personal-us-wallet-identity-review-only.sql');
 const consentSql=await load('nex-personal-us-agentic-consent-review-only.sql');
 const serviceSql=await load('nex-personal-us-service-role-review-only.sql');
 const didSql=await load('nex-personal-us-privy-identity-review-only.sql');
 await assert.rejects(admin.query(didSql),/USA Privy identity DDL denied/);
 await admin.query('ROLLBACK');
 await admin.query('CREATE DATABASE '+db);
 const url=new URL(root);url.pathname='/'+db;
 pool=new pg.Pool({connectionString:url.toString(),max:4,connectionTimeoutMillis:3000});
 for(const sql of [identitySql,consentSql,serviceSql,didSql])await pool.query(sql);
 const schema=(await pool.query(`SELECT relrowsecurity,relforcerowsecurity
 FROM pg_class WHERE oid='nex_personal_us.privy_identity_links'::regclass`)).rows[0];
 assert.equal(schema.relrowsecurity,true);
 assert.equal(schema.relforcerowsecurity,true);
 const ownerId=randomUUID(),strangerId=randomUUID();
 const owner='us_did_owned_profile_123';
 const other='us_did_other_profile_123';
 const app='us-private-privy-app-test';
 const did='did:privy:us-test-owner';
 const foreignDid='did:privy:us-different-owner';
 await pool.query(`INSERT INTO nex_personal_us.profiles(id,auth_subject,status)
 VALUES($1,$2,'active'),($3,$4,'active')`,[ownerId,owner,strangerId,other]);
 const linkId=randomUUID();
 await pool.query(`INSERT INTO nex_personal_us.privy_identity_links
 (id,owner_profile_id,privy_app_id,privy_user_id)
 VALUES($1,$2,$3,$4)`,[linkId,ownerId,app,did]);
 await assert.rejects(pool.query(`INSERT INTO nex_personal_us.privy_identity_links
 (id,owner_profile_id,privy_app_id,privy_user_id) VALUES($1,$2,$3,$4)`,
 [randomUUID(),strangerId,app,did]),/duplicate key/);
 await assert.rejects(pool.query(`INSERT INTO nex_personal_us.privy_identity_links
 (id,owner_profile_id,privy_app_id,privy_user_id) VALUES($1,$2,$3,$4)`,
 [randomUUID(),ownerId,app,foreignDid]),/duplicate key/);
 const scopedPool={connect:async()=>{
  const client=await pool.connect();
  return {
   query:async(sql,params=[])=>{
    const r=await client.query(sql,params);
    if(sql==='BEGIN')await client.query('SET LOCAL ROLE '+role);
    return r;
   },release:()=>client.release()
  };
 }};
 const t=Math.floor(Date.now()/1000);
 const jwt='eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJkaWQ6cHJpdnk6dXMiLCJhdWQiOiJ1cyJ9.c2ln';
 let sdkCalls=0,approvedCalls=0;
 const verifiedClaims={app_id:app,user_id:did,session_id:'privy-us-session-001',
  issuer:'privy.io',issued_at:t-30,expiration:t+600};
 const verifier=async()=>{sdkCalls++;return verifiedClaims};
 const args={pool:scopedPool,bearerToken:jwt,dedicatedUSPrivyAppId:app,
  verificationKey:'USA-CI-ONLY-FAKE-PUBLIC-KEY',verifyAccessToken:verifier,
  now:new Date(),onVerifiedOwner:async(ownerData,client)=>{
   approvedCalls++;
   assert.deepEqual({
    subject:ownerData.authenticatedUSSubject,profile:ownerData.profileId,
    did:ownerData.privyUserId,app:ownerData.privyAppId,execution:ownerData.executionAllowed
   },{subject:owner,profile:ownerId,did,app,execution:false});
   assert.equal(ownerData.verifiedByUSAService,true);
   assert.ok(client);
   return ownerData.authenticatedUSSubject;
  }};
 const identity=await withVerifiedUSPrivyIdentity(args);
 assert.equal(identity,owner);
 assert.equal(approvedCalls,1);
 const rejectedCases=[
  {...verifiedClaims,user_id:foreignDid},
  {...verifiedClaims,app_id:'br-privy-app-forbidden'},
  {...verifiedClaims,issuer:'forged.issuer'},
  {...verifiedClaims,expiration:t-1},
  {...verifiedClaims,user_id:'did:privy:unsupported'}
 ];
 for(const claim of rejectedCases){
  await assert.rejects(withVerifiedUSPrivyIdentity({
   ...args,verifyAccessToken:async()=>claim
  }),/US_PRIVY_.*(UNVERIFIED|INVALID|EXPIRED|NOT_LINKED|CONFIGURATION)|US_PRIVY_DID_NOT_LINKED_TO_ACTIVE_OWNER/);
 }
 assert.equal(approvedCalls,1,'Unlinked, wrong-project and invalid tokens must never run the owner callback');
 // The integrated action must derive subject only from locked US database
 // identity and atomically persist the provider-verified embedded wallet.
 const address='0x8888888888888888888888888888888888888888';
 const evidence={projectId:app,userId:did,walletId:'wallet-did-ci-user-1',
  address,linkedToAuthenticatedSubject:owner,chainType:'ethereum',
  walletType:'embedded',control:'user',recoveryConfigured:true,
  additionalSigners:[],verifiedAt:new Date(Date.now()-1000).toISOString()};
 let providerCalls=0;
 const bindArgs={pool:scopedPool,bearerToken:jwt,dedicatedUSPrivyAppId:app,
  verificationKey:args.verificationKey,verifyAccessToken:verifier,
  now:new Date(),fetchVerifiedUSWalletEvidence:async verified=>{
   providerCalls++;
   assert.equal(verified.authenticatedUSSubject,owner);
   assert.equal(verified.privyUserId,did);
   return evidence;
  }};
 await assert.rejects(bindUSPrivyWalletFromServerDID({
  ...bindArgs,verifyAccessToken:async()=>({...verifiedClaims,user_id:foreignDid})
 }),/US_PRIVY_DID_NOT_LINKED_TO_ACTIVE_OWNER/);
 assert.equal(providerCalls,0,'Unlinked DID must never trigger a provider wallet request');
 await assert.rejects(bindUSPrivyWalletFromServerDID({
  ...bindArgs,fetchVerifiedUSWalletEvidence:async()=>({...evidence,userId:foreignDid})
 }),/US_PRIVY_VERIFIED_WALLET_OWNER_MISMATCH/);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM nex_personal_us.wallet_bindings')).rows[0].n,0,
  'Rejected Privy evidence must not bind a wallet');
 const linked=await bindUSPrivyWalletFromServerDID(bindArgs);
 assert.equal(linked.executionAllowed,false);
 assert.equal(linked.delegatedAgentSigningAllowed,false);
 assert.equal(linked.ownerSubject,owner);
 assert.equal(linked.privyUserId,did);
 const wallet=(await pool.query(`SELECT owner_profile_id,privy_project_id,privy_user_id
 FROM nex_personal_us.wallet_bindings WHERE id=$1`,[linked.walletBindingId])).rows[0];
 assert.deepEqual(wallet,{owner_profile_id:ownerId,privy_project_id:app,privy_user_id:did});
 assert.equal((await pool.query(`SELECT count(*)::int AS n FROM nex_personal_us.wallet_security_events
 WHERE owner_profile_id=$1 AND event_type='binding.created'`,[ownerId])).rows[0].n,1);
 // End-to-end Privy USA DID -> SQL role/row locks -> persisted Maya consent
 // -> native Polygon USDC observer. All providers and tokens are synthetic;
 // the PostgreSQL transactions, RLS rules and constraints are real/disposable.
 const readConsentId=randomUUID(),approvalId=randomUUID();
 const consentIssued=new Date(Date.now()-2000),consentExpires=new Date(Date.now()+8*60_000);
 await pool.query(`INSERT INTO nex_personal_us.wallet_agentic_read_consents
 (id,owner_profile_id,wallet_binding_id,approval_evidence_id,capability,issued_at,expires_at)
 VALUES($1,$2,$3,$4,'wallet.read.polygon_usdc',$5,$6)`,
 [readConsentId,ownerId,linked.walletBindingId,approvalId,
  consentIssued.toISOString(),consentExpires.toISOString()]);
 let trustedReads=0;
 const nativePolygonClient={
  getChainId:async()=>137,
  getBlockNumber:async()=>12345n,
  readContract:async call=>{
   trustedReads++;
   assert.equal(call.address,'0x3c499c542cef5e3811e1192ce70d8cc03d5c3359');
   assert.equal(call.functionName,'balanceOf');
   assert.deepEqual(call.args,[address]);
   assert.equal(call.blockNumber,12345n);
   return 8500000n;
  }
 };
 const mayaReadArgs={pool:scopedPool,bearerToken:jwt,dedicatedUSPrivyAppId:app,
  verificationKey:args.verificationKey,verifyAccessToken:verifier,
  consentId:readConsentId,polygonClient:nativePolygonClient,now:new Date()};
 const authorizedMayaRead=await assessVerifiedPrivyUSNativeUSDCRead({
  ...mayaReadArgs,authenticatedUSSubject:other
 });
 assert.equal(authorizedMayaRead.decision.decision,'allow_read');
 assert.equal(authorizedMayaRead.rawUsdcBalance,'8500000');
 assert.equal(authorizedMayaRead.ownerWalletAddress,address);
 assert.equal(authorizedMayaRead.executionAllowed,false);
 for(const flag of ['canSign','canTransfer','canSwap','canExecute'])
  assert.equal(authorizedMayaRead.decision[flag],false);
 assert.equal(trustedReads,1);
 const wrongDIDRead={...mayaReadArgs,
  verifyAccessToken:async()=>({...verifiedClaims,user_id:foreignDid})};
 await assert.rejects(assessVerifiedPrivyUSNativeUSDCRead(wrongDIDRead),
  /US_PRIVY_DID_NOT_LINKED_TO_ACTIVE_OWNER/);
 assert.equal(trustedReads,1,'Foreign DID must not trigger Polygon RPC');
 const unknownConsent=await assessVerifiedPrivyUSNativeUSDCRead({
  ...mayaReadArgs,consentId:randomUUID()
 });
 assert.equal(unknownConsent.decision.decision,'deny');
 assert.equal(unknownConsent.rawUsdcBalance,null);
 assert.equal(trustedReads,1,'Absent consent must not trigger Polygon RPC');
 // Revocation must also be authorized by the USA Privy DID identity,
 // execute in its existing PostgreSQL transaction and be audit logged.
 await assert.rejects(revokeVerifiedPrivyUSAgenticWalletRead({
  ...wrongDIDRead,now:new Date()
 }),/US_PRIVY_DID_NOT_LINKED_TO_ACTIVE_OWNER/);
 const unknownRevocation=await revokeVerifiedPrivyUSAgenticWalletRead({
  ...mayaReadArgs,consentId:randomUUID(),now:new Date()
 });
 assert.equal(unknownRevocation.revoked,false);
 assert.equal((await pool.query(`SELECT revoked_at FROM
  nex_personal_us.wallet_agentic_read_consents WHERE id=$1`,[readConsentId])).rows[0].revoked_at,null);
 const successRevocation=await revokeVerifiedPrivyUSAgenticWalletRead({
  ...mayaReadArgs,authenticatedUSSubject:other,now:new Date()
 });
 assert.deepEqual(successRevocation,{revoked:true,executionAllowed:false});
 const secondRevocation=await revokeVerifiedPrivyUSAgenticWalletRead({
  ...mayaReadArgs,now:new Date()
 });
 assert.equal(secondRevocation.revoked,false,'Repeated revoke must not duplicate audit');
 assert.equal((await pool.query(`SELECT count(*)::int AS n FROM nex_personal_us.wallet_security_events
 WHERE owner_profile_id=$1 AND event_type='agentic.read.revoked'`,[ownerId])).rows[0].n,1);
 const revokedMayaRead=await assessVerifiedPrivyUSNativeUSDCRead({
  ...mayaReadArgs,now:new Date()
 });
 assert.equal(revokedMayaRead.decision.decision,'deny');
 assert.equal(revokedMayaRead.rawUsdcBalance,null);
 assert.equal(revokedMayaRead.ownerWalletAddress,null);
 assert.equal(trustedReads,1,'Revoked consent must not trigger Polygon RPC');
 await assert.rejects(bindUSPrivyWalletFromServerDID(bindArgs),/duplicate key/);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM nex_personal_us.wallet_bindings')).rows[0].n,1,
  'Wallet duplication must roll back with no phantom binding');
 // Race-proof actual embedded-wallet insertion: a concurrent DID revocation
 // must wait until the provider evidence, wallet insert and audit COMMIT.
 let bindStarted;const bindEvidenceStarted=new Promise(r=>bindStarted=r);
 let allowEvidence;const evidenceGate=new Promise(r=>allowEvidence=r);
 const racingEvidence={...evidence,walletId:'wallet-did-ci-race',
  address:'0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  verifiedAt:new Date(Date.now()-1000).toISOString()};
 const racingBind=bindUSPrivyWalletFromServerDID({
  ...bindArgs,fetchVerifiedUSWalletEvidence:async()=>{
   bindStarted();await evidenceGate;return racingEvidence;
  }
 });
 await bindEvidenceStarted;
 let racingRevokeCompleted=false;
 const racingRevoke=pool.query(`UPDATE nex_personal_us.privy_identity_links
 SET revoked_at=now() WHERE id=$1 RETURNING id`,[linkId]).then(result=>{
  racingRevokeCompleted=true;return result;
 });
 try{
  await new Promise(r=>setTimeout(r,70));
  assert.equal(racingRevokeCompleted,false,
   'DID revoke must wait for wallet evidence, binding and audit commit');
 }finally{allowEvidence();}
 // Existing unique embedded-wallet-per-owner constraint rejects a second
 // active wallet. The failed insert rolls back without authorizing anything.
 await assert.rejects(racingBind,/duplicate key/);
 const racingRevokeResult=await racingRevoke;
 assert.equal(racingRevokeResult.rowCount,1);
 assert.equal((await pool.query(`SELECT count(*)::int AS n FROM nex_personal_us.wallet_bindings
 WHERE source='privy' AND owner_profile_id=$1`,[ownerId])).rows[0].n,1);
 assert.equal((await pool.query(`SELECT count(*)::int AS n FROM nex_personal_us.wallet_security_events
 WHERE owner_profile_id=$1 AND event_type='binding.created'`,[ownerId])).rows[0].n,1);
 // Reinstate only the CI identity link so the separate successful identity
 // revocation concurrency scenario below can exercise its own lock.
 await pool.query(`UPDATE nex_personal_us.privy_identity_links
 SET revoked_at=NULL WHERE id=$1`,[linkId]);
 const noServer=await pool.connect();
 try{
  await noServer.query('BEGIN');
  await noServer.query('SET LOCAL ROLE '+role);
  await assert.rejects(noServer.query(`UPDATE nex_personal_us.privy_identity_links
  SET revoked_at=now() WHERE id=$1`,[linkId]),e=>e.code==='42501');
  await noServer.query('ROLLBACK');
 }finally{noServer.release();}
 let callbackStarted;const started=new Promise(r=>callbackStarted=r);
 let allowCallback;const gate=new Promise(r=>allowCallback=r);
 const active=withVerifiedUSPrivyIdentity({
  ...args,onVerifiedOwner:async current=>{callbackStarted();await gate;return current.authenticatedUSSubject;}
 });
 await started;
 let revoked=false;
 const revoke=pool.query(`UPDATE nex_personal_us.privy_identity_links
 SET revoked_at=now() WHERE id=$1 RETURNING id`,[linkId]).then(r=>{
  revoked=true;return r;
 });
 try{
  await new Promise(r=>setTimeout(r,70));
  assert.equal(revoked,false,'Revocation must wait for active owner operation lock');
 }finally{allowCallback();}
 assert.equal(await active,owner);
 const changed=await revoke;
 assert.equal(changed.rowCount,1);
 await assert.rejects(withVerifiedUSPrivyIdentity(args),
  /US_PRIVY_DID_NOT_LINKED_TO_ACTIVE_OWNER/);
 const providersBeforeRevocation=providerCalls;
 await assert.rejects(bindUSPrivyWalletFromServerDID(bindArgs),
  /US_PRIVY_DID_NOT_LINKED_TO_ACTIVE_OWNER/);
 assert.equal(providerCalls,providersBeforeRevocation,
  'Revoked DID must not trigger a fresh Privy wallet lookup');
 assert.equal(approvedCalls,1,'Revoked identity cannot trigger another trusted action');
 // A physically wrong DB must be rejected *before* the official SDK seam.
 let wrongDbVerification=0;
 const wrongPool=new pg.Pool({connectionString:root.toString(),max:1});
 try{
  await assert.rejects(withVerifiedUSPrivyIdentity({
   ...args,pool:wrongPool,
   verifyAccessToken:async()=>{wrongDbVerification++;return verifiedClaims}
  }),/US_WALLET_WRONG_DATABASE/);
 }finally{await wrongPool.end();}
 assert.equal(wrongDbVerification,0);
 assert.ok(sdkCalls>=3);
 console.log('PASS: USA Privy project+DID identity resolution, service RLS, revoked links, concurrent revoke and DB fail-closed');
}finally{await clean();}
