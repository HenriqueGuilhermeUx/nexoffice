import {assertPersonalUSDedicatedDatabase} from './personal-us-database-scope.js';
import type {USWalletPool,USWalletClient} from './personal-us-wallet-binding-store.js';
import {verifyPrivyUSAccessSession,
 type OfficialPrivyUSVerifyAccessToken,type VerifiedPrivyUSSession
} from './personal-us-privy-session.js';

/**
 * INTERNAL USA ONLY, not a route, not an authorization to execute transfers.
 * Authenticated US identity MUST be derived from both a Privy JWT verified by
 * the official SDK AND a server-provisioned dedicated USA database DID link.
 * No request-body subject, Privy DID or profile is accepted.
 *
 * The callback executes under the same PostgreSQL locks so a trusted US
 * identity-provisioning service cannot revoke the link during the operation.
 * Do NOT pass this callback, its client, or role credentials to an LLM/browser.
 */
type LinkRow={
 owner_profile_id:string;auth_subject:string;profile_status:string;
 link_id:string;privy_app_id:string;privy_user_id:string;
 revoked_at:Date|null
};
export type USPrivyVerifiedOwner={
 authenticatedUSSubject:string;profileId:string;privyAppId:string;
 privyUserId:string;sessionId:string;expiresAt:string;
 verifiedByUSAService:true;executionAllowed:false
};
export async function withVerifiedUSPrivyIdentity<T>(input:{
 pool:USWalletPool;bearerToken:string;dedicatedUSPrivyAppId:string;
 verificationKey:string;
 verifyAccessToken:OfficialPrivyUSVerifyAccessToken;
 now:Date;
 onVerifiedOwner:(owner:USPrivyVerifiedOwner,client:USWalletClient)=>Promise<T>
}):Promise<T>{
 if(typeof input.onVerifiedOwner!=='function')
  throw Error('US_PRIVY_SERVER_OWNER_CALLBACK_REQUIRED');
 const client=await input.pool.connect();
 let began=false;
 try{
  await client.query('BEGIN');began=true;
  await assertPersonalUSDedicatedDatabase(client);
  await client.query("SET LOCAL lock_timeout = '3000ms'");
  await client.query("SET LOCAL statement_timeout = '8000ms'");
  const session:VerifiedPrivyUSSession=await verifyPrivyUSAccessSession({
   bearerToken:input.bearerToken,
   usaPrivyAppId:input.dedicatedUSPrivyAppId,
   verificationKey:input.verificationKey,
   expectedIssuer:'privy.io',
   verifyAccessToken:input.verifyAccessToken,
   now:input.now
  });
  const r=await client.query<LinkRow>(`
   SELECT p.id AS owner_profile_id,p.auth_subject,p.status AS profile_status,
          l.id AS link_id,l.privy_app_id,l.privy_user_id,l.revoked_at
     FROM nex_personal_us.privy_identity_links l
     JOIN nex_personal_us.profiles p ON p.id=l.owner_profile_id
    WHERE l.privy_app_id=$1 AND l.privy_user_id=$2 AND l.revoked_at IS NULL
      AND p.status='active'
    FOR SHARE OF l,p`,[session.appId,session.userId]);
  const row=r.rows[0];
  if(r.rows.length!==1||!row||row.revoked_at!==null||
     row.profile_status!=='active'||row.privy_app_id!==session.appId||
     row.privy_user_id!==session.userId||
     !/^[a-zA-Z0-9:_-]{8,150}$/.test(row.auth_subject))
   throw Error('US_PRIVY_DID_NOT_LINKED_TO_ACTIVE_OWNER');
  const owner:USPrivyVerifiedOwner={
   authenticatedUSSubject:row.auth_subject,profileId:row.owner_profile_id,
   privyAppId:session.appId,privyUserId:session.userId,
   sessionId:session.sessionId,expiresAt:session.expiresAt,
   verifiedByUSAService:true,executionAllowed:false
  };
  const result=await input.onVerifiedOwner(owner,client);
  // Token must remain current until the result is approved, and a slow
  // callback cannot use a now-expired JWT as ongoing US identity evidence.
  if(Date.now()>=Date.parse(session.expiresAt))
   throw Error('US_PRIVY_TOKEN_EXPIRED_DURING_OPERATION');
  await client.query('COMMIT');began=false;
  return result;
 }catch(error){
  if(began)try{await client.query('ROLLBACK');}catch{}
  throw error;
 }finally{client.release();}
}
