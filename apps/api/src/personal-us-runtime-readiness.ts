import type {USWalletPool} from './personal-us-wallet-binding-store.js';
import {
 assertUSReadOnlyRuntimePreflight,
 type USReadOnlyRuntimePreflightInput
} from './personal-us-runtime-preflight.js';
import {attestUSReadOnlyPostgresSession} from './personal-us-runtime-db-attestation.js';

/**
 * INTERNAL USA ONLY — a future read-only backend's pre-start assessment.
 *
 * Sequence is deliberate: validate offline config BEFORE pool.connect, then
 * attest a real restricted USA PostgreSQL session within one transaction.
 * This performs no writes and ALWAYS rolls back, even after success.
 *
 * A successful result is NOT permission to expose routes or operate accounts.
 * Dedicated US Privy verifier, hosting region, scoped credential ownership,
 * CORS, user identity and regulatory readiness are not proven here.
 */
export type USReadOnlyRuntimeCandidateAssessment={
 configurationValidated:true;
 isolatedDatabaseSessionValidated:true;
 verifiedTables:6;
 frontendOrigin:string;
 databaseName:string;
 regionIndependentlyVerified:false;
 privyIdentityLiveVerified:false;
 externalAccessEnabled:false;
 financialExecutionAllowed:false;
 agentSigningAllowed:false;
 operationalActivationApproved:false;
};
export async function assessUSReadOnlyRuntimeCandidate(input:{
 configuration:USReadOnlyRuntimePreflightInput;
 pool:USWalletPool;
}):Promise<USReadOnlyRuntimeCandidateAssessment>{
 const config=assertUSReadOnlyRuntimePreflight(input?.configuration);
 if(typeof input.pool?.connect!=='function')
  throw Error('US_RUNTIME_RESTRICTED_POOL_REQUIRED');
 const client=await input.pool.connect();
 let inTransaction=false;
 try{
  await client.query('BEGIN');inTransaction=true;
  await client.query("SET LOCAL lock_timeout = '3000ms'");
  await client.query("SET LOCAL statement_timeout = '8000ms'");
  const proof=await attestUSReadOnlyPostgresSession({
   client,expectedDatabaseName:config.databaseName,
   expectedRoleName:'npu_us_wallet_service'
  });
  return {
   configurationValidated:true,
   isolatedDatabaseSessionValidated:true,
   verifiedTables:proof.verifiedTables as 6,
   frontendOrigin:config.allowedFrontendOrigin,
   databaseName:config.databaseName,
   regionIndependentlyVerified:false,
   privyIdentityLiveVerified:false,
   externalAccessEnabled:false,
   financialExecutionAllowed:false,
   agentSigningAllowed:false,
   operationalActivationApproved:false
  };
 }finally{
  if(inTransaction)try{await client.query('ROLLBACK');}catch{}
  client.release();
 }
}
