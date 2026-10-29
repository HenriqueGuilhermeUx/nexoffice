import {createHash,randomUUID} from 'node:crypto';
import {preparePrivyUSWalletBinding,
 type VerifiedUSPrivyWalletEvidence} from './personal-us-privy-onboarding.js';
import {withVerifiedUSPrivyIdentity,
 type USPrivyVerifiedOwner} from './personal-us-privy-owner-store.js';
import type {USWalletPool} from './personal-us-wallet-binding-store.js';
import type {OfficialPrivyUSVerifyAccessToken} from './personal-us-privy-session.js';

/**
 * Nex Personal USA embedded-wallet binding: REVIEW ONLY / NOT ROUTED.
 * Trusted official Privy SDK auth -> dedicated USA PostgreSQL DID mapping ->
 * server-side wallet attestation -> atomic wallet binding and audit.
 * No wallet creation, delegated signer, transaction or Agentics authority.
 */
export async function bindUSPrivyWalletFromServerDID(input:{
 pool:USWalletPool;bearerToken:string;dedicatedUSPrivyAppId:string;
 verificationKey:string;verifyAccessToken:OfficialPrivyUSVerifyAccessToken;
 now:Date;fetchVerifiedUSWalletEvidence:
  (owner:USPrivyVerifiedOwner,signal:AbortSignal)=>Promise<VerifiedUSPrivyWalletEvidence>;
}):Promise<{
 walletBindingId:string;ownerSubject:string;walletAddress:string;
 privyAppId:string;privyUserId:string;source:'privy';
 executionAllowed:false;delegatedAgentSigningAllowed:false
}>{
 if(typeof input.fetchVerifiedUSWalletEvidence!=='function')
  throw Error('US_PRIVY_WALLET_PROVIDER_UNAVAILABLE');
 return withVerifiedUSPrivyIdentity({
  pool:input.pool,bearerToken:input.bearerToken,
  dedicatedUSPrivyAppId:input.dedicatedUSPrivyAppId,
  verificationKey:input.verificationKey,
  verifyAccessToken:input.verifyAccessToken,now:input.now,
  onVerifiedOwner:async(owner,client)=>{
   const abort=new AbortController();
   let handle:ReturnType<typeof setTimeout>|undefined;
   let evidence:VerifiedUSPrivyWalletEvidence;
   try{
    const requested=Promise.resolve().then(()=>
      input.fetchVerifiedUSWalletEvidence(owner,abort.signal));
    const timeout=new Promise<never>((_,reject)=>{
      handle=setTimeout(()=>{
       reject(Error('US_PRIVY_WALLET_PROVIDER_TIMEOUT'));
       abort.abort();
      },3000);
    });
    evidence=await Promise.race([requested,timeout]);
   }finally{
    if(handle!==undefined)clearTimeout(handle);
    abort.abort();
   }
   // The provider MUST attest the very same DID/project/profile already
   // verified and row-locked in this transaction, not browser-supplied claims.
   if(evidence?.projectId!==owner.privyAppId||
      evidence?.userId!==owner.privyUserId||
      evidence?.linkedToAuthenticatedSubject!==owner.authenticatedUSSubject)
    throw Error('US_PRIVY_VERIFIED_WALLET_OWNER_MISMATCH');
   const candidate=preparePrivyUSWalletBinding({
    authenticatedUSSubject:owner.authenticatedUSSubject,
    dedicatedUSPrivyProjectId:owner.privyAppId,
    verified:evidence,now:new Date()
   });
   const id=randomUUID();
   const saved=await client.query<{id:string}>(`
    INSERT INTO nex_personal_us.wallet_bindings
      (id,owner_profile_id,source,wallet_address,chain_id,privy_project_id,
       privy_user_id,privy_wallet_id,verified_at)
    VALUES($1,$2,'privy',$3,137,$4,$5,$6,$7) RETURNING id`,
    [id,owner.profileId,candidate.address,owner.privyAppId,owner.privyUserId,
     candidate.privyWalletId,candidate.verifiedAt]);
   if(saved.rowCount!==1||saved.rows[0]?.id!==id)
    throw Error('US_PRIVY_DID_WALLET_BIND_FAILED');
   await client.query(`
    INSERT INTO nex_personal_us.wallet_security_events
      (id,owner_profile_id,event_type,subject_wallet_address,evidence_digest_sha256)
    VALUES($1,$2,'binding.created',$3,$4)`,
    [randomUUID(),owner.profileId,candidate.address,
     createHash('sha256').update(owner.privyAppId+':'+candidate.privyWalletId).digest('hex')]);
   return {walletBindingId:id,ownerSubject:owner.authenticatedUSSubject,
    walletAddress:candidate.address,privyAppId:owner.privyAppId,
    privyUserId:owner.privyUserId,source:'privy',
    executionAllowed:false,delegatedAgentSigningAllowed:false};
  }
 });
}
