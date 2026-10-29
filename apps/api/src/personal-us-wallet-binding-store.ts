import {createHash,randomUUID} from 'node:crypto';
import {assertPersonalUSDedicatedDatabase} from './personal-us-database-scope.js';
import {preparePrivyUSWalletBinding,type VerifiedUSPrivyWalletEvidence} from './personal-us-privy-onboarding.js';
import {verifyPrivyUSAccessSession,type OfficialPrivyUSVerifyAccessToken,type VerifiedPrivyUSSession} from './personal-us-privy-session.js';
import {
  assessPersonalUSWalletProof,issuePersonalUSWalletChallenge,
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
  await assertPersonalUSDedicatedDatabase(client);
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
  // Lock both challenge AND profile. Suspension/revocation of owner identity
  // must not race a verified signature into an active wallet binding.
  const result=await client.query<ChallengeRow>(`
   SELECT c.id, c.owner_profile_id, p.auth_subject AS owner_subject, p.status AS profile_status,
          c.chain_id,c.wallet_address,c.trusted_origin,c.nonce_sha256,c.message_sha256,
          c.issued_at,c.expires_at,c.consumed_at
   FROM nex_personal_us.wallet_ownership_challenges c
   JOIN nex_personal_us.profiles p ON p.id=c.owner_profile_id
   WHERE c.id=$1 AND p.auth_subject=$2 AND p.status='active'
   FOR UPDATE OF c,p`,[input.challengeId,input.authenticatedUSSubject]);
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

/** Issue and persist server-authoritative US wallet challenge under owner lock.
 * There is deliberately no HTTP route and no connection to Brazil's database.
 * The signed message is returned only to the already-authenticated US subject.
 */
export async function issuePersistedUSWalletChallenge(input:{
  pool:USWalletPool;authenticatedUSSubject:string;walletAddress:string;
  trustedOrigin:string;now:Date
}):Promise<{challengeId:string;message:string;expiresAt:string;executionAllowed:false}>{
 if(!/^[a-zA-Z0-9:_-]{8,150}$/.test(input.authenticatedUSSubject)||
    !ACCOUNT.test(input.walletAddress)||!Number.isFinite(input.now.getTime()))
   throw Error('INVALID_US_CHALLENGE_INPUT');
 return transaction(input.pool,async client=>{
  const owner=await client.query<{id:string;status:string}>(`
   SELECT id,status FROM nex_personal_us.profiles
    WHERE auth_subject=$1 FOR UPDATE`,[input.authenticatedUSSubject]);
  if(owner.rows.length!==1||owner.rows[0].status!=='active')throw Error('US_IDENTITY_NOT_ACTIVE');
  const active=await client.query<{amount:number}>(`
   SELECT count(*)::int AS amount FROM nex_personal_us.wallet_ownership_challenges
    WHERE owner_profile_id=$1 AND consumed_at IS NULL AND expires_at>$2`,
   [owner.rows[0].id,input.now.toISOString()]);
  if(Number(active.rows[0]?.amount??0)>=3)throw Error('US_CHALLENGE_RATE_LIMITED');
  const issued=issuePersonalUSWalletChallenge({
   ownerSubject:input.authenticatedUSSubject,address:input.walletAddress,
   trustedOrigin:input.trustedOrigin,now:input.now
  });
  await client.query(`
   INSERT INTO nex_personal_us.wallet_ownership_challenges
    (id,owner_profile_id,chain_id,wallet_address,trusted_origin,
      nonce_sha256,message_sha256,issued_at,expires_at)
   VALUES($1,$2,137,$3,$4,$5,$6,$7,$8)`,
   [issued.challenge.id,owner.rows[0].id,input.walletAddress,issued.challenge.origin,
    issued.challenge.nonceHash,sha256(issued.message),
    issued.challenge.issuedAt,issued.challenge.expiresAt]);
  await client.query(`
   INSERT INTO nex_personal_us.wallet_security_events
    (id,owner_profile_id,event_type,subject_wallet_address,evidence_digest_sha256)
   VALUES($1,$2,'challenge.issued',$3,$4)`,
   [randomUUID(),owner.rows[0].id,input.walletAddress,sha256(issued.message)]);
  return {challengeId:issued.challenge.id,message:issued.message,
    expiresAt:issued.challenge.expiresAt,executionAllowed:false};
 });
}

/** Persist a user-controlled embedded wallet ONLY after a trusted SERVER Privy
 * adapter has authenticated its project/user/wallet evidence. No HTTP routes,
 * SDK, secrets or client-supplied evidence are wired to this candidate contract.
 */
export async function bindVerifiedUSPrivyWallet(input:{
 pool:USWalletPool;authenticatedUSSubject:string;dedicatedUSPrivyProjectId:string;
 loadVerifiedEvidence:()=>Promise<VerifiedUSPrivyWalletEvidence>;
 now:Date
}):Promise<{
  bindingId:string;ownerSubject:string;walletAddress:string;source:'privy';
  executionAllowed:false;delegatedAgentSigningAllowed:false
}>{
 if(!/^[a-zA-Z0-9:_-]{8,150}$/.test(input.authenticatedUSSubject)||
    !Number.isFinite(input.now.getTime())||typeof input.loadVerifiedEvidence!=='function')
   throw Error('INVALID_US_PRIVY_BIND_INPUT');
 // The transaction performs its physical USA DB guard before requesting any
 // Privy wallet evidence. Wrongly wired Brazil/NexOffice pools fail closed
 // before provider-side wallet lookup and without any database changes.
 return transaction(input.pool,async client=>{
  // Only server-verified provider evidence may be accepted; never browser JSON.
  const evidence=await input.loadVerifiedEvidence();
  const candidate=preparePrivyUSWalletBinding({
   authenticatedUSSubject:input.authenticatedUSSubject,
   dedicatedUSPrivyProjectId:input.dedicatedUSPrivyProjectId,
   verified:evidence,now:input.now
  });
  const owner=await client.query<{id:string;status:string}>(`
   SELECT id,status FROM nex_personal_us.profiles
    WHERE auth_subject=$1 FOR UPDATE`,[candidate.subject]);
  if(owner.rows.length!==1||owner.rows[0].status!=='active')
    throw Error('US_IDENTITY_NOT_ACTIVE');
  const id=randomUUID();
  const inserted=await client.query<{id:string}>(`
   INSERT INTO nex_personal_us.wallet_bindings
    (id,owner_profile_id,source,wallet_address,chain_id,privy_project_id,
      privy_user_id,privy_wallet_id,verified_at)
   VALUES($1,$2,'privy',$3,137,$4,$5,$6,$7) RETURNING id`,
   [id,owner.rows[0].id,candidate.address,candidate.projectId,
    candidate.privyUserId,candidate.privyWalletId,candidate.verifiedAt]);
  if(inserted.rowCount!==1||inserted.rows[0]?.id!==id)
    throw Error('US_PRIVY_BINDING_NOT_SAVED');
  await client.query(`
   INSERT INTO nex_personal_us.wallet_security_events
    (id,owner_profile_id,event_type,subject_wallet_address,evidence_digest_sha256)
   VALUES($1,$2,'binding.created',$3,$4)`,
   [randomUUID(),owner.rows[0].id,candidate.address,
    sha256(candidate.projectId+':'+candidate.privyWalletId)]);
  return {bindingId:id,ownerSubject:candidate.subject,walletAddress:candidate.address,
   source:'privy',executionAllowed:false,delegatedAgentSigningAllowed:false};
 });
}

/** USA Privy auth + wallet attestation orchestrator — STILL NOT ROUTED.
 * Signature verification uses the official Privy server SDK, injected by the
 * future isolated USA service; a separate trusted identity store must map
 * the authenticated US consumer to the Privy DID. No frontend JSON may be
 * used to supply provider wallets or user ownership evidence.
 */
export async function bindPrivyUSAfterServerSession(input:{
 pool:USWalletPool;
 authenticatedUSSubject:string;
 bearerToken:string;
 dedicatedUSPrivyProjectId:string;verificationKey:string;expectedIssuer:string;
 verifyAccessToken:OfficialPrivyUSVerifyAccessToken;
 resolveUSPrivyUserId:(authenticatedSubject:string)=>Promise<string>;
 fetchVerifiedUSWalletEvidence:(session:VerifiedPrivyUSSession)=>Promise<VerifiedUSPrivyWalletEvidence>;
 now:Date
}):Promise<{
  bindingId:string;ownerSubject:string;walletAddress:string;source:'privy';
  executionAllowed:false;delegatedAgentSigningAllowed:false
}>{
 if(typeof input.resolveUSPrivyUserId!=='function'||
    typeof input.fetchVerifiedUSWalletEvidence!=='function')
   throw Error('US_PRIVY_SERVER_ADAPTERS_MISSING');
 const session=await verifyPrivyUSAccessSession({
  bearerToken:input.bearerToken,usaPrivyAppId:input.dedicatedUSPrivyProjectId,
  verificationKey:input.verificationKey,expectedIssuer:input.expectedIssuer,
  verifyAccessToken:input.verifyAccessToken,now:input.now
 });
 // This lookup MUST derive from an authenticated US session and an existing
 // dedicated US identity table, not from an untrusted request body.
 const expectedPrivyUserId=await input.resolveUSPrivyUserId(input.authenticatedUSSubject);
 if(!expectedPrivyUserId||session.userId!==expectedPrivyUserId)
   throw Error('US_PRIVY_SESSION_NOT_LINKED_TO_OWNER');
 return bindVerifiedUSPrivyWallet({
  pool:input.pool,authenticatedUSSubject:input.authenticatedUSSubject,
  dedicatedUSPrivyProjectId:input.dedicatedUSPrivyProjectId,now:input.now,
  loadVerifiedEvidence:async()=>{
   const evidence=await input.fetchVerifiedUSWalletEvidence(session);
   if(evidence.userId!==session.userId)
     throw Error('US_PRIVY_PROVIDER_USER_MISMATCH');
   return evidence;
  }
 });
}
