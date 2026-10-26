import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {withVerifiedUSPrivyIdentity}
 from '../apps/api/dist/personal-us-privy-owner-store.js';

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
const clean=async()=>{if(pool)await pool.end();try{await admin.query('DROP DATABASE IF EXISTS '+db+' WITH (FORCE)')}catch{}try{await admin.query('DROP ROLE IF EXISTS '+role)}catch{}await admin.end()};
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
