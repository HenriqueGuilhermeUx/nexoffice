import {createHash,randomUUID} from 'node:crypto';
import {
  assessPersonalUSWalletProof,
  type USWalletChallenge,type USWalletSignatureVerifier
} from './personal-us-wallet-ownership.js';

/**
 * Wallet binding storage for a DEDICATED, permission-scoped Nex Personal USA
 * PostgreSQL pool. Never import the shared NexOffice database or expose routes
 * from this module. The SQL schema is review-only until US tenancy is approved.
 */
export type USWalletQueryResult<T>={rows:T[];rowCount:number|null};
export type USWalletClient={
  query:<T=Record<string,unknown>>(sql:string,params?:unknown[])=>Promise<USWalletQueryResult<T>>;
  release:()=>void;
};
export type USWalletPool={connect:()=>Promise<USWalletClient>};
type ChallengeRow={
 id:string;owner_subject:string;owner_profile_id:string;profile_status:string;
 chain_id:number;wallet_address:string;trusted_origin:string;nonce_sha256:string;
 message_sha256:string;issued_at:string|Date;expires_at:string|Date;consumed_at:string|Date|null;
};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA=/^[0-9a-f]{64}$/;
const ACCOUNT=/^0x[0-9a-fA-F]{40}$/;
function sha256(value:string){return createHash('sha256').update(value).digest('hex');}
function iso(value:string|Date){const d=value instanceof Date?value:new Date(value);if(!Number.isFinite(d.getTime()))throw Error('BAD_DATABASE_TIMESTAMP');return d.toISOString();}
async function transaction<T>(pool:USWalletPool,fn:(client:USWalletClient)=>Promise<T>):Promise<T>{
 const client=await pool.connect();
 let started=false;
 try{
  await client.query('BEGIN');started=true;
  const value=await fn(client);
  await client.query('COMMIT');started=false;
  return value;
 }catch(error){
  if(started)try{await client.query('ROLLBACK');}catch{/* Preserve root cause; connection must be discarded by pool implementation. */}
  throw error;
 }finally{client.release();}
}
export type ExternalWalletBindResult={
 ownerSubject:string;walletAddress:string;chainId:137;
 walletBindingId:string;source:'external';executionAllowed:false
};
export async function bindVerifiedUSExternalWallet(input:{
  pool:USWalletPool;authenticatedUSSubject:string;challengeId:string;
  trustedOrigin:string;signedMessage:string;signature:string;verifier:USWalletSignatureVerifier;
  now:Date
}):Promise<ExternalWalletBindResult>{
 if(!UUID.test(input.challengeId)||!input.authenticatedUSSubject||!input.verifier)
   throw Error('INVALID_BIND_INPUT');
 if(!Number.isFinite(input.now.getTime()))throw Error('INVALID_BIND_TIME');
 return transaction(input.pool,async client=>{
  // FOR UPDATE ensures only one request can consume this nonce for this account.
  const result=await client.query<ChallengeRow>(`
   SELECT c.id, c.owner_profile_id, p.auth_subject AS owner_subject, p.status AS profile_status,
          c.chain_id,c.wallet_address,c.trusted_origin,c.nonce_sha256,c.message_sha256,
          c.issued_at,c.expires_at,c.consumed_at
   FROM nex_personal_us.wallet_ownership_challenges c
   JOIN nex_personal_us.profiles p ON p.id=c.owner_profile_id
   WHERE c.id=$1 AND p.auth_subject=$2 AND p.status='active'
   FOR UPDATE OF c`,[input.challengeId,input.authenticatedUSSubject]);
  if(result.rows.length!==1)throw Error('US_CHALLENGE_NOT_FOUND');
  const row=result.rows[0];
  if(row.consumed_at||row.profile_status!=='active'||row.chain_id!==137||
     !ACCOUNT.test(row.wallet_address)||!SHA.test(row.nonce_sha256)||!SHA.test(row.message_sha256))
    throw Error('US_CHALLENGE_INVALID');
  if(sha256(input.signedMessage)!==row.message_sha256)throw Error('US_SIGNED_MESSAGE_MISMATCH');
  const challenge:USWalletChallenge={
   id:row.id,ownerSubject:row.owner_subject,chainId:137,address:row.wallet_address,
   origin:row.trusted_origin,nonceHash:row.nonce_sha256,expectedMessage:input.signedMessage,
   issuedAt:iso(row.issued_at),expiresAt:iso(row.expires_at),status:'pending'
  };
  const proof=await assessPersonalUSWalletProof({
   challenge,authenticatedSubject:input.authenticatedUSSubject,
   trustedOrigin:input.trustedOrigin,signedMessage:input.signedMessage,
   signature:input.signature,now:input.now,verifier:input.verifier
  });
  if(proof.challengeId!==row.id||proof.ownerSubject!==row.owner_subject)
    throw Error('US_CHALLENGE_SUBJECT_MISMATCH');
  const consumed=await client.query<{id:string}>(`
   UPDATE nex_personal_us.wallet_ownership_challenges
      SET consumed_at=$1
    WHERE id=$2 AND owner_profile_id=$3 AND consumed_at IS NULL
      AND expires_at>$1 AND message_sha256=$4 AND nonce_sha256=$5
    RETURNING id`,[input.now.toISOString(),row.id,row.owner_profile_id,
       row.message_sha256,row.nonce_sha256]);
  if(consumed.rowCount!==1)throw Error('US_CHALLENGE_ALREADY_CONSUMED');
  // Exclusive active address and proof-use indexes in review-only DDL prevent
  // cross-owner reuse; any duplicate causes ROLLBACK, including consumed_at.
  const bindingId=randomUUID();
  const binding=await client.query<{id:string}>(`
   INSERT INTO nex_personal_us.wallet_bindings
    (id,owner_profile_id,source,wallet_address,chain_id,proof_challenge_id,verified_at)
   VALUES($1,$2,'external',$3,137,$4,$5)
   RETURNING id`,[bindingId,row.owner_profile_id,row.wallet_address,row.id,input.now.toISOString()]);
  if(binding.rowCount!==1||binding.rows[0]?.id!==bindingId)
    throw Error('US_WALLET_BIND_FAILED');
  await client.query(`
   INSERT INTO nex_personal_us.wallet_security_events
    (id,owner_profile_id,event_type,subject_wallet_address,evidence_digest_sha256)
   VALUES($1,$2,'challenge.consumed',$3,$4)`,
    [randomUUID(),row.owner_profile_id,row.wallet_address,row.message_sha256]);
  await client.query(`
   INSERT INTO nex_personal_us.wallet_security_events
    (id,owner_profile_id,event_type,subject_wallet_address,evidence_digest_sha256)
   VALUES($1,$2,'binding.created',$3,$4)`,
    [randomUUID(),row.owner_profile_id,row.wallet_address,row.message_sha256]);
  return {ownerSubject:row.owner_subject,walletAddress:row.wallet_address,
   chainId:137,walletBindingId:bindingId,source:'external',executionAllowed:false};
 });
}
export async function revokeUSWalletBinding(input:{
  pool:USWalletPool;authenticatedUSSubject:string;bindingId:string;now:Date
}):Promise<{revoked:boolean;executionAllowed:false}>{
 if(!UUID.test(input.bindingId)||!input.authenticatedUSSubject||!Number.isFinite(input.now.getTime()))
   throw Error('INVALID_REVOKE_INPUT');
 return transaction(input.pool,async client=>{
  const updated=await client.query<{id:string;owner_profile_id:string;wallet_address:string}>(`
   UPDATE nex_personal_us.wallet_bindings b
      SET revoked_at=$1
    FROM nex_personal_us.profiles p
    WHERE b.owner_profile_id=p.id AND p.auth_subject=$2 AND p.status='active'
      AND b.id=$3 AND b.revoked_at IS NULL
    RETURNING b.id,b.owner_profile_id,b.wallet_address`,
    [input.now.toISOString(),input.authenticatedUSSubject,input.bindingId]);
  if(updated.rowCount!==1)return {revoked:false,executionAllowed:false};
  const binding=updated.rows[0];
  await client.query(`
   INSERT INTO nex_personal_us.wallet_security_events
    (id,owner_profile_id,event_type,subject_wallet_address)
   VALUES($1,$2,'binding.revoked',$3)`,
   [randomUUID(),binding.owner_profile_id,binding.wallet_address]);
  return {revoked:true,executionAllowed:false};
 });
}
