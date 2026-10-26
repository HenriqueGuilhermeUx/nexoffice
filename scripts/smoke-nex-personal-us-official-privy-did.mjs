import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID,sign} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {verifyAccessToken} from '@privy-io/node';
import {withVerifiedUSPrivyIdentity}
 from '../apps/api/dist/personal-us-privy-owner-store.js';
import {bindUSPrivyWalletFromServerDID}
 from '../apps/api/dist/personal-us-privy-did-wallet-binding.js';

if(process.env.NPU_OFFICIAL_PRIVY_CRYPTO_CI!=='true')
 throw Error('US_OFFICIAL_PRIVY_DID_CRYPTO_CI_DENIED');
const root=new URL(String(process.env.DATABASE_URL||''));
if(root.protocol!=='postgresql:'||root.hostname!=='127.0.0.1'||
 root.port!=='5432'||root.pathname!=='/nexoffice')
 throw Error('US_OFFICIAL_PRIVY_DID_NON_DISPOSABLE_DB_DENIED');
const admin=new pg.Client({connectionString:root.toString()});
await admin.connect();
const database='nex_personal_us_sdk_did_ci',service='npu_us_wallet_service';
let pool;
try{
 await admin.query('CREATE DATABASE '+database);
 const dburl=new URL(root);dburl.pathname='/'+database;
 pool=new pg.Pool({connectionString:dburl.toString(),max:3,connectionTimeoutMillis:3000});
 for(const name of [
  'nex-personal-us-wallet-identity-review-only.sql',
  'nex-personal-us-agentic-consent-review-only.sql',
  'nex-personal-us-service-role-review-only.sql',
  'nex-personal-us-privy-identity-review-only.sql'
 ]){
  await pool.query(await readFile(new URL('../docs/sql/'+name,import.meta.url),'utf8'));
 }
 const appId='us-official-sdk-'+randomUUID();
 const did='did:privy:official-sdk-user-ci';
 const subject='us_official_did_authenticated';
 const ownerId=randomUUID();
 await pool.query(`INSERT INTO nex_personal_us.profiles(id,auth_subject,status)
 VALUES($1,$2,'active')`,[ownerId,subject]);
 await pool.query(`INSERT INTO nex_personal_us.privy_identity_links
 (id,owner_profile_id,privy_app_id,privy_user_id)
 VALUES($1,$2,$3,$4)`,[randomUUID(),ownerId,appId,did]);
 const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
 const verificationKey=publicKey.export({format:'pem',type:'spki'});
 const timestamp=Math.floor(Date.now()/1000);
 const claims={iss:'privy.io',sub:did,aud:appId,sid:'us-official-sdk-session-1',
  iat:timestamp-20,exp:timestamp+600};
 function jwt(payload){
  const header=Buffer.from(JSON.stringify({typ:'JWT',alg:'ES256'})).toString('base64url');
  const body=Buffer.from(JSON.stringify(payload)).toString('base64url');
  const data=header+'.'+body;
  const signature=sign('sha256',Buffer.from(data),{
   key:privateKey,dsaEncoding:'ieee-p1363'
  }).toString('base64url');
  return data+'.'+signature;
 }
 const token=jwt(claims);
 // No service login credentials exist. The disposable PG superuser sets
 // transaction-local NOLOGIN service role, mirroring the already-tested role.
 const scopedPool={connect:async()=>{
  const client=await pool.connect();
  return {query:async (sql,params=[])=>{
    const result=await client.query(sql,params);
    if(sql==='BEGIN')await client.query('SET LOCAL ROLE '+service);
    return result;
   },release:()=>client.release()
  };
 }};
 const base={pool:scopedPool,bearerToken:token,dedicatedUSPrivyAppId:appId,
  verificationKey,verifyAccessToken,now:new Date(),
  onVerifiedOwner:async owner=>{
   assert.equal(owner.verifiedByUSAService,true);
   assert.equal(owner.executionAllowed,false);
   assert.equal(owner.privyAppId,appId);
   assert.equal(owner.privyUserId,did);
   assert.equal(owner.profileId,ownerId);
   return owner.authenticatedUSSubject;
  }};
 assert.equal(await withVerifiedUSPrivyIdentity(base),subject);
 // Real signature + official SDK + server-owned profile + transactional
 // provider evidence and embedded-wallet binding, all on an ephemeral US DB.
 const address='0x9999999999999999999999999999999999999999';
 const linked=await bindUSPrivyWalletFromServerDID({
  pool:scopedPool,bearerToken:token,dedicatedUSPrivyAppId:appId,
  verificationKey,verifyAccessToken,now:new Date(),
  fetchVerifiedUSWalletEvidence:async owner=>{
   assert.equal(owner.authenticatedUSSubject,subject);
   assert.equal(owner.privyUserId,did);
   return {projectId:appId,userId:did,walletId:'us-test-embedded-001',
    address,linkedToAuthenticatedSubject:subject,chainType:'ethereum',
    walletType:'embedded',control:'user',recoveryConfigured:true,
    additionalSigners:[],verifiedAt:new Date(Date.now()-1000).toISOString()};
  }
 });
 assert.equal(linked.ownerSubject,subject);
 assert.equal(linked.walletAddress.toLowerCase(),address.toLowerCase());
 assert.equal(linked.executionAllowed,false);
 assert.equal(linked.delegatedAgentSigningAllowed,false);
 const linkedRows=await pool.query(`SELECT owner_profile_id,privy_project_id,privy_user_id
 FROM nex_personal_us.wallet_bindings WHERE id=$1`,[linked.walletBindingId]);
 assert.deepEqual(linkedRows.rows[0],
  {owner_profile_id:ownerId,privy_project_id:appId,privy_user_id:did});
 const wrong=(tokenOverride,other={})=>withVerifiedUSPrivyIdentity({
  ...base,bearerToken:tokenOverride,...other,
  onVerifiedOwner:async()=>{throw Error('INVALID_IDENTITY_CALLBACK_REACHED')}
 });
 await assert.rejects(wrong(jwt({...claims,sub:'did:privy:unknown-us-profile'})),
  /US_PRIVY_DID_NOT_LINKED_TO_ACTIVE_OWNER/);
 await assert.rejects(wrong(jwt({...claims,aud:'us-foreign-privy-app'})),
  /US_PRIVY_ACCESS_TOKEN_UNVERIFIED/);
 await assert.rejects(wrong(jwt({...claims,iss:'forged.issuer'})),
  /US_PRIVY_ACCESS_TOKEN_UNVERIFIED|US_PRIVY_TOKEN_CLAIMS_INVALID/);
 await assert.rejects(wrong(jwt({...claims,exp:timestamp-2})),
  /US_PRIVY_ACCESS_TOKEN_UNVERIFIED|US_PRIVY_ACCESS_TOKEN_EXPIRED/);
 const parts=token.split('.');
 const bad=[parts[0],parts[1],
   (parts[2].startsWith('a')?'b':'a')+parts[2].slice(1)].join('.');
 await assert.rejects(wrong(bad),/US_PRIVY_ACCESS_TOKEN_UNVERIFIED/);
 const wrongKey=generateKeyPairSync('ec',{namedCurve:'prime256v1'})
   .publicKey.export({format:'pem',type:'spki'});
 await assert.rejects(wrong(token,{verificationKey:wrongKey}),
  /US_PRIVY_ACCESS_TOKEN_UNVERIFIED/);
 await pool.query(`UPDATE nex_personal_us.privy_identity_links
 SET revoked_at=now() WHERE privy_app_id=$1 AND privy_user_id=$2`,[appId,did]);
 await assert.rejects(wrong(token),/US_PRIVY_DID_NOT_LINKED_TO_ACTIVE_OWNER/);
 console.log('PASS: official Privy SDK ES256 signatures resolve only active US DB DID, reject forged app, other user, bad key and revoked link');
}finally{
 // The dedicated CI-only PostgreSQL container is discarded in full by
 // GitHub Actions. Never FORCE-disconnect an idle connection mid-event.
 if(pool)await pool.end();
 await admin.end();
}
