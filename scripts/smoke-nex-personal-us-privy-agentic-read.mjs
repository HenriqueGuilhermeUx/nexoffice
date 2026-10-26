import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {assessVerifiedPrivyUSNativeUSDCRead}
 from '../apps/api/dist/personal-us-privy-agentic-read.js';

/**
 * Non-operational contract smoke only. Privy verification is synthetic here;
 * official SDK cryptography and USA PostgreSQL/RLS have independent CI jobs.
 * No production token, wallet, RPC, keys or funds are used.
 */
const jwt='eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJkaWQ6cHJpdnk6dXMifQ.c2ln';
const app='privy-us-ci-only';
const did='did:privy:usa-ci-owner';
const subject='usa_private_profile_owner_1234';
const profileId=randomUUID(),bindingId=randomUUID(),consentId=randomUUID();
const wallet='0x8888888888888888888888888888888888888888';
const now=new Date(),t=Math.floor(now.getTime()/1000);
const validClaims={app_id:app,user_id:did,session_id:'us-privy-session-ci-001',
 issuer:'privy.io',issued_at:t-30,expiration:t+600};
function fixture({db='nex_personal_us_ci',claims=validClaims,link=true,
 consentOwner=profileId,revoked=false}={}){
 const statements=[];let connections=0,releases=0,verifications=0,rpcReads=0;
 const client={
  query:async(sql)=>{
   statements.push(sql.trim());
   if(sql==='SELECT current_database() AS database')
    return {rows:[{database:db}],rowCount:1};
   if(sql.includes('FROM nex_personal_us.privy_identity_links l')){
    const rows=link?[{owner_profile_id:profileId,auth_subject:subject,
     profile_status:'active',link_id:randomUUID(),privy_app_id:app,
     privy_user_id:did,revoked_at:null}]:[];
    return {rows,rowCount:rows.length};
   }
   if(sql.includes('FROM nex_personal_us.wallet_agentic_read_consents c')){
    const rows=[{subject,status:'active',profile_id:profileId,
     binding_id:bindingId,binding_owner_id:profileId,chain_id:137,
     wallet_address:wallet,source:'privy',
     verified_at:new Date(now.getTime()-60_000),binding_revoked_at:null,
     consent_id:consentId,consent_owner_id:consentOwner,
     consent_binding_id:bindingId,capability:'wallet.read.polygon_usdc',
     approval_evidence_id:randomUUID(),
     issued_at:new Date(now.getTime()-30_000),
     expires_at:new Date(now.getTime()+540_000),
     consent_revoked_at:revoked?new Date(now.getTime()-1000):null}];
    return {rows,rowCount:1};
   }
   if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK'||sql.startsWith('SET LOCAL'))
    return {rows:[],rowCount:null};
   throw Error('Unexpected SQL in US Privy Maya read smoke');
  },
  release:()=>{releases++}
 };
 const pool={connect:async()=>{connections++;return client}};
 const polygonClient={
  getChainId:async()=>137,
  getBlockNumber:async()=>123456n,
  readContract:async req=>{
   rpcReads++;
   assert.equal(req.address,'0x3c499c542cef5e3811e1192ce70d8cc03d5c3359');
   assert.equal(req.functionName,'balanceOf');
   assert.equal(req.args[0],wallet);
   assert.equal(req.blockNumber,123456n);
   return 123456789n;
  }
 };
 const input={pool,bearerToken:jwt,dedicatedUSPrivyAppId:app,
  verificationKey:'SYNTHETIC-US-PRIVY-PUBLIC-KEY-FOR-SMOKE',
  verifyAccessToken:async()=>{verifications++;return claims},
  consentId,polygonClient,now};
 return {input,statements,stats:()=>({connections,releases,verifications,rpcReads})};
}

const valid=fixture();
const result=await assessVerifiedPrivyUSNativeUSDCRead({
 ...valid.input,authenticatedUSSubject:'attacker_client_supplied_subject',
 walletAddress:'0x1111111111111111111111111111111111111111'
});
assert.equal(result.decision.decision,'allow_read');
assert.equal(result.rawUsdcBalance,'123456789');
assert.equal(result.ownerWalletAddress,wallet);
assert.equal(result.executionAllowed,false);
for(const field of ['canSign','canExecute','canTransfer','canSwap'])
 assert.equal(result.decision[field],false);
assert.equal(valid.stats().connections,1,'no second PostgreSQL connection is allowed');
assert.equal(valid.stats().releases,1);
assert.equal(valid.stats().rpcReads,1);
assert.equal(valid.statements.filter(s=>s==='BEGIN').length,1);
assert.equal(valid.statements.filter(s=>s==='COMMIT').length,1);
assert.equal(valid.statements.filter(s=>s==='SELECT current_database() AS database').length,2);
const didReadIndex=valid.statements.findIndex(s=>s.includes('FROM nex_personal_us.privy_identity_links l'));
const consentReadIndex=valid.statements.findIndex(s=>s.includes('FROM nex_personal_us.wallet_agentic_read_consents c'));
assert.ok(didReadIndex>=0&&consentReadIndex>didReadIndex);
assert.ok(valid.statements[consentReadIndex].includes('FOR SHARE OF p,b,c'));

const foreign=fixture({claims:{...validClaims,user_id:'did:privy:unknown-us-client'},link:false});
await assert.rejects(assessVerifiedPrivyUSNativeUSDCRead(foreign.input),
 /US_PRIVY_DID_NOT_LINKED_TO_ACTIVE_OWNER/);
assert.equal(foreign.stats().rpcReads,0);
assert.equal(foreign.statements.filter(s=>s==='ROLLBACK').length,1);

const brokenDb=fixture({db:'nexoffice'});
await assert.rejects(assessVerifiedPrivyUSNativeUSDCRead(brokenDb.input),
 /US_WALLET_WRONG_DATABASE/);
assert.equal(brokenDb.stats().verifications,0,'do not verify or read US data using a Brazil pool');
assert.equal(brokenDb.stats().rpcReads,0);

for(const options of [{revoked:true},{consentOwner:randomUUID()}]){
 const denied=fixture(options);
 const r=await assessVerifiedPrivyUSNativeUSDCRead(denied.input);
 assert.equal(r.decision.decision,'deny');
 assert.equal(r.rawUsdcBalance,null);
 assert.equal(r.ownerWalletAddress,null);
 assert.equal(denied.stats().rpcReads,0,'no RPC for unowned/revoked consent');
 assert.equal(denied.stats().connections,1);
}
console.log('PASS: verified USA Privy DID -> single PostgreSQL txn -> Maya native USDC read only; fail closed');
