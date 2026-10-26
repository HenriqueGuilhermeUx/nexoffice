import type {USWalletPool} from './personal-us-wallet-binding-store.js';
import type {OfficialPrivyUSVerifyAccessToken} from './personal-us-privy-session.js';
import {withVerifiedUSPrivyIdentity} from './personal-us-privy-owner-store.js';
import {revokeUSAgenticWalletRead} from './personal-us-agentic-consent-store.js';
import {
 assessServerUSAgenticRead,type USServerReadResult
} from './personal-us-agentic-server-read.js';
import {
 createUSPolygonNativeUSDCReader,type USPolygonPublicReadClient
} from './personal-us-polygon-usdc-reader.js';

/**
 * USA ONLY — internal authenticated Maya read composition; NO PUBLIC ROUTE.
 *
 * An untrusted caller may supply a bearer token and a consent UUID but NEVER
 * an owner subject, DID, evidence object, wallet address, RPC URL, or chain.
 * The official Privy verifier and dedicated USA database DID link determine
 * ownership. This reuses the same fenced PostgreSQL transaction and row locks
 * for the consent read, avoiding a nested DB connection or auth/revoke gap.
 *
 * Read-only native Polygon USDC. No keys, signing, swaps or delegated authority.
 */
export async function assessVerifiedPrivyUSNativeUSDCRead(input:{
 pool:USWalletPool;
 bearerToken:string;
 dedicatedUSPrivyAppId:string;
 verificationKey:string;
 verifyAccessToken:OfficialPrivyUSVerifyAccessToken;
 consentId:string;
 polygonClient:USPolygonPublicReadClient;
 now:Date;
}):Promise<USServerReadResult>{
 return withVerifiedUSPrivyIdentity({
  pool:input.pool,
  bearerToken:input.bearerToken,
  dedicatedUSPrivyAppId:input.dedicatedUSPrivyAppId,
  verificationKey:input.verificationKey,
  verifyAccessToken:input.verifyAccessToken,
  now:input.now,
  onVerifiedOwner:async(owner,client)=>{
   const readUSDC=createUSPolygonNativeUSDCReader({
    client:input.polygonClient
   });
   return assessServerUSAgenticRead({
    pool:input.pool,
    authenticatedUSSubject:owner.authenticatedUSSubject,
    consentId:input.consentId,
    now:input.now,
    fetchUSDCFromTrustedServer:readUSDC,
    verifiedPrivyTransactionClient:client
   });
  }
 });
}

/**
 * INTERNAL USA ONLY — revoke the owner's specific Maya read consent under
 * the same verified Privy DID link and dedicated USA transaction/row locks.
 * DID and owner are resolved from the official SDK and server database;
 * no browser-provided owner or LLM decision is trusted.
 * This function does not register an HTTP endpoint.
 */
export async function revokeVerifiedPrivyUSAgenticWalletRead(input:{
 pool:USWalletPool;
 bearerToken:string;
 dedicatedUSPrivyAppId:string;
 verificationKey:string;
 verifyAccessToken:OfficialPrivyUSVerifyAccessToken;
 consentId:string;
 now:Date;
}):Promise<{revoked:boolean;executionAllowed:false}>{
 return withVerifiedUSPrivyIdentity({
  pool:input.pool,
  bearerToken:input.bearerToken,
  dedicatedUSPrivyAppId:input.dedicatedUSPrivyAppId,
  verificationKey:input.verificationKey,
  verifyAccessToken:input.verifyAccessToken,
  now:input.now,
  onVerifiedOwner:(owner,client)=>revokeUSAgenticWalletRead({
   pool:input.pool,
   authenticatedUSSubject:owner.authenticatedUSSubject,
   consentId:input.consentId,
   now:input.now,
   verifiedPrivyTransactionClient:client
  })
 });
}
