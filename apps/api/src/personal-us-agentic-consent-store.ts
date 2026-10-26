import {createHash,randomUUID} from 'node:crypto';
import {assertPersonalUSDedicatedDatabase} from './personal-us-database-scope.js';
import type {USWalletPool,USWalletClient} from './personal-us-wallet-binding-store.js';

/**
 * USA only — REVIEW-ONLY runtime, not registered as an HTTP route.
 * Consent evidence MUST originate in a trusted, server-verified user gesture,
 * never in JSON furnished by browser/AI or a wallet extension.
 */
export const US_AGENTIC_WALLET_READ='wallet.read.polygon_usdc' as const;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUBJECT=/^[a-zA-Z0-9:_-]{8,150}$/;
export type VerifiedUSReadApproval={
 approvalId:string;subject:string;bindingId:string;approvedAt:string;
 capability:typeof US_AGENTIC_WALLET_READ;source:'server_authenticated_explicit_gesture'
};
export type USReadConsentResult={
 consentId:string;bindingId:string;subject:string;expiresAt:string;
 capability:typeof US_AGENTIC_WALLET_READ;executionAllowed:false;signingAllowed:false
};
async function withUSConsentTransaction<T>(
 pool:USWalletPool,fn:(client:USWalletClient)=>Promise<T>,
 verifiedPrivyTransactionClient?:USWalletClient
):Promise<T>{
 // A verified Privy DID operation owns the outer transaction and must retain
 // its owner/identity row locks until the authorized mutation is committed.
 // Never check out a second connection or end the caller's transaction.
 const ownsTransaction=!verifiedPrivyTransactionClient;
 const client=verifiedPrivyTransactionClient??await pool.connect();
 let begun=false;
 try{
  if(ownsTransaction){await client.query('BEGIN');begun=true;}
  await assertPersonalUSDedicatedDatabase(client);
  const value=await fn(client);
  if(ownsTransaction){await client.query('COMMIT');begun=false;}
  return value;
 }catch(e){
  if(begun)try{await client.query('ROLLBACK');}catch{/* retain original failure */}
  throw e;
 }finally{if(ownsTransaction)client.release();}
}
export async function authorizeUSAgenticWalletRead(input:{
 pool:USWalletPool;authenticatedUSSubject:string;bindingId:string;now:Date;
 verifyExplicitGesture:()=>Promise<VerifiedUSReadApproval>
}):Promise<USReadConsentResult>{
 if(!SUBJECT.test(input.authenticatedUSSubject)||!UUID.test(input.bindingId)||
    !Number.isFinite(input.now?.getTime())||typeof input.verifyExplicitGesture!=='function')
  throw Error('US_AGENTIC_CONSENT_INPUT_INVALID');
 const approval=await input.verifyExplicitGesture();
 const approvedAt=Date.parse(approval?.approvedAt);
 if(!approval||approval.source!=='server_authenticated_explicit_gesture'||
    approval.subject!==input.authenticatedUSSubject||approval.bindingId!==input.bindingId||
    approval.capability!==US_AGENTIC_WALLET_READ||!UUID.test(approval.approvalId)||
    !Number.isFinite(approvedAt)||approvedAt>input.now.getTime()||
    input.now.getTime()-approvedAt>2*60_000)
  throw Error('US_AGENTIC_EXPLICIT_APPROVAL_UNVERIFIED');
 return withUSConsentTransaction(input.pool,async client=>{
  // Lock profile and wallet to serialize with their deactivation/revocation.
  const owners=await client.query<{id:string;status:string}>(`
   SELECT id,status FROM nex_personal_us.profiles
    WHERE auth_subject=$1 FOR UPDATE`,[input.authenticatedUSSubject]);
  if(owners.rows.length!==1||owners.rows[0].status!=='active')
   throw Error('US_AGENTIC_OWNER_INACTIVE');
  const bindings=await client.query<{id:string;owner_profile_id:string;chain_id:number;revoked_at:Date|null}>(`
   SELECT id,owner_profile_id,chain_id,revoked_at
    FROM nex_personal_us.wallet_bindings
    WHERE id=$1 AND owner_profile_id=$2 FOR UPDATE`,[input.bindingId,owners.rows[0].id]);
  if(bindings.rows.length!==1||bindings.rows[0].chain_id!==137||
     bindings.rows[0].revoked_at!==null)
   throw Error('US_AGENTIC_WALLET_NOT_ACTIVE');
  const active=await client.query<{amount:number}>(`
   SELECT count(*)::int AS amount
    FROM nex_personal_us.wallet_agentic_read_consents
    WHERE owner_profile_id=$1 AND wallet_binding_id=$2
      AND revoked_at IS NULL AND expires_at>$3`,
   [owners.rows[0].id,input.bindingId,input.now.toISOString()]);
  if(Number(active.rows[0]?.amount??0)>=3)
   throw Error('US_AGENTIC_ACTIVE_CONSENT_LIMIT');
  const id=randomUUID();
  const expiration=new Date(input.now.getTime()+10*60_000).toISOString();
  const inserted=await client.query<{id:string}>(`
   INSERT INTO nex_personal_us.wallet_agentic_read_consents
    (id,owner_profile_id,wallet_binding_id,approval_evidence_id,capability,issued_at,expires_at)
   VALUES($1,$2,$3,$4,'wallet.read.polygon_usdc',$5,$6)
   RETURNING id`,
   [id,owners.rows[0].id,input.bindingId,approval.approvalId,
    input.now.toISOString(),expiration]);
  if(inserted.rowCount!==1||inserted.rows[0]?.id!==id)
   throw Error('US_AGENTIC_CONSENT_NOT_SAVED');
  await client.query(`
   INSERT INTO nex_personal_us.wallet_security_events
    (id,owner_profile_id,event_type,evidence_digest_sha256)
   VALUES($1,$2,'agentic.read.authorized',$3)`,
   [randomUUID(),owners.rows[0].id,
    createHash('sha256').update(approval.approvalId).digest('hex')]);
  return {consentId:id,bindingId:input.bindingId,subject:input.authenticatedUSSubject,
   expiresAt:expiration,capability:US_AGENTIC_WALLET_READ,
   executionAllowed:false,signingAllowed:false};
 });
}
export async function revokeUSAgenticWalletRead(input:{
 pool:USWalletPool;authenticatedUSSubject:string;consentId:string;now:Date;
 /** Internal only; supplied by a previously verified Privy DID owner callback. */
 verifiedPrivyTransactionClient?:USWalletClient;
}):Promise<{revoked:boolean;executionAllowed:false}>{
 if(!SUBJECT.test(input.authenticatedUSSubject)||!UUID.test(input.consentId)||
    !Number.isFinite(input.now?.getTime()))
  throw Error('US_AGENTIC_REVOKE_INPUT_INVALID');
 return withUSConsentTransaction(input.pool,async client=>{
  const changed=await client.query<{owner_profile_id:string}>(`
   UPDATE nex_personal_us.wallet_agentic_read_consents c
     SET revoked_at=$1
    FROM nex_personal_us.profiles p
    WHERE c.owner_profile_id=p.id AND p.auth_subject=$2
      AND c.id=$3 AND c.revoked_at IS NULL
      AND c.issued_at<=$1
    RETURNING c.owner_profile_id`,
   [input.now.toISOString(),input.authenticatedUSSubject,input.consentId]);
  if(changed.rowCount!==1)return {revoked:false,executionAllowed:false};
  await client.query(`
   INSERT INTO nex_personal_us.wallet_security_events
    (id,owner_profile_id,event_type)
   VALUES($1,$2,'agentic.read.revoked')`,
   [randomUUID(),changed.rows[0].owner_profile_id]);
  return {revoked:true,executionAllowed:false};
 },input.verifiedPrivyTransactionClient);
}
