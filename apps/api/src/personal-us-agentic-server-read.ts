import type {USWalletPool,USWalletClient} from './personal-us-wallet-binding-store.js';
import {assertPersonalUSDedicatedDatabase} from './personal-us-database-scope.js';
import {
 evaluatePersonalUSAgenticRead,
 type USAgenticTrustDecision, type USAgenticReadTrustFacts
} from './personal-us-agentic-trust.js';

/**
 * Nex Personal USA Agentics read guard, REVIEW ONLY / NO PUBLIC ROUTE.
 * Each fact is loaded from a dedicated US database or from a trusted US
 * server-side Polygon RPC. The browser may not provide an observation, consent
 * flag, wallet owner, approval, RPC URL, or token address.
 *
 * The PG transaction locks profile + binding + consent until the chain
 * observation is evaluated, serializing revocation and blocking TOCTOU reads.
 * This is deliberately read-only and grants NO ability to sign or transfer.
 */
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const SUBJECT=/^[a-zA-Z0-9:_-]{8,150}$/;
type ReadRow={
  subject:string;status:string;profile_id:string;
  binding_id:string;binding_owner_id:string;chain_id:number;
  wallet_address:string;source:string;verified_at:Date|string;binding_revoked_at:Date|null;
  consent_id:string;consent_owner_id:string;consent_binding_id:string;capability:string;
  approval_evidence_id:string;issued_at:Date|string;expires_at:Date|string;
  consent_revoked_at:Date|null
};
export type ServerObservedUSDC={
 chainId:number;tokenAddress:string;walletAddress:string;rawBalance:string;
 decimals:number;source:'trusted_server_polygon_rpc';observedAt:string
};
export type USServerReadResult={
  decision:USAgenticTrustDecision;
  rawUsdcBalance:string|null;
  ownerWalletAddress:string|null;
  chainId:137;
  executionAllowed:false;
};
function iso(value:Date|string):string{
 const date=value instanceof Date?value:new Date(value);
 if(!Number.isFinite(date.getTime()))throw Error('US_AGENTIC_BAD_DATABASE_TIMESTAMP');
 return date.toISOString();
}
function deny(reason:string):USAgenticTrustDecision{
 return {decision:'deny',reason,canSign:false,canExecute:false,canTransfer:false,
  canSwap:false,portfolioNetWorthUsd:null,operationalLedgerUsd:null};
}
export async function assessServerUSAgenticRead(input:{
  pool:USWalletPool;authenticatedUSSubject:string;consentId:string;now:Date;
  fetchUSDCFromTrustedServer:(address:string,signal?:AbortSignal)=>Promise<ServerObservedUSDC>;
  rpcTimeoutMs?:number;
  /** INTERNAL: active fenced USA transaction held by the verified Privy DID owner. */
  verifiedPrivyTransactionClient?:USWalletClient;
}):Promise<USServerReadResult>{
 if(!SUBJECT.test(input.authenticatedUSSubject)||!UUID.test(input.consentId)||
    !(input.now instanceof Date)||!Number.isFinite(input.now.getTime())||
    typeof input.fetchUSDCFromTrustedServer!=='function'||
    (input.rpcTimeoutMs!==undefined&&(!Number.isInteger(input.rpcTimeoutMs)||
      input.rpcTimeoutMs<20||input.rpcTimeoutMs>8000)))
   throw Error('US_AGENTIC_READ_CONTEXT_INVALID');
 const rejected=(reason:string):USServerReadResult=>({
   decision:deny(reason),rawUsdcBalance:null,ownerWalletAddress:null,
   chainId:137,executionAllowed:false
 });
 const ownsTransaction=!input.verifiedPrivyTransactionClient;
 const client:USWalletClient=input.verifiedPrivyTransactionClient??await input.pool.connect();
 let started=false;
 const commitIfOwned=async()=>{
  if(ownsTransaction){await client.query('COMMIT');started=false;}
 };
 try{
  // PostgreSQL row-locking SELECT ... FOR SHARE is not permitted in a
  // READ ONLY transaction. This transaction uses BEGIN but writes no records.
  if(ownsTransaction){await client.query('BEGIN');started=true;}
  // Explicit bounds also protect wallet/consent revocation against indefinitely
  // waiting PostgreSQL row locks from an interrupted or overloaded service.
  if(ownsTransaction){
   await client.query("SET LOCAL lock_timeout = '5000ms'");
   await client.query("SET LOCAL statement_timeout = '8000ms'");
  }
  // Defense in depth: even an accidentally supplied NexOffice/Brazil connection
  // must fail before reading or contacting the RPC provider.
  await assertPersonalUSDedicatedDatabase(client);
  // FOR SHARE places shared row locks without application-data mutations;
  // it conflicts with revocation updates of the owner, wallet or consent.
  // PostgreSQL does not allow FOR SHARE in a READ ONLY transaction.
  const result=await client.query<ReadRow>(`
   SELECT p.auth_subject AS subject,p.status,p.id AS profile_id,
          b.id AS binding_id,b.owner_profile_id AS binding_owner_id,
          b.chain_id,b.wallet_address,b.source,b.verified_at,
          b.revoked_at AS binding_revoked_at,
          c.id AS consent_id,c.owner_profile_id AS consent_owner_id,
          c.wallet_binding_id AS consent_binding_id,c.capability,
          c.approval_evidence_id,c.issued_at,c.expires_at,
          c.revoked_at AS consent_revoked_at
     FROM nex_personal_us.wallet_agentic_read_consents c
     JOIN nex_personal_us.wallet_bindings b ON b.id=c.wallet_binding_id
     JOIN nex_personal_us.profiles p ON p.id=c.owner_profile_id
    WHERE c.id=$1 AND p.auth_subject=$2
    FOR SHARE OF p,b,c`,[input.consentId,input.authenticatedUSSubject]);
  const row=result.rows[0];
  if(result.rows.length!==1||!row||row.status!=='active'||
     row.binding_owner_id!==row.profile_id||row.consent_owner_id!==row.profile_id||
     row.consent_binding_id!==row.binding_id||
     row.consent_revoked_at!==null||row.binding_revoked_at!==null||
     row.chain_id!==137||row.capability!=='wallet.read.polygon_usdc'||
     !UUID.test(row.approval_evidence_id)){
   await commitIfOwned();
   return rejected('US_AGENTIC_DB_OWNER_OR_CONSENT_DENIED');
  }
  // No RPC call unless a current, owner-bound, server-stored grant exists.
  const now=input.now.getTime();
  if(Date.parse(iso(row.expires_at))<=now||Date.parse(iso(row.issued_at))>now||
     Date.parse(iso(row.expires_at))-Date.parse(iso(row.issued_at))>15*60_000){
   await commitIfOwned();
   return rejected('US_AGENTIC_DB_CONSENT_EXPIRED');
  }
  // Fetch only from the server-bound RPC adapter; never accept an observation
  // supplied by a browser, assistant tool, wallet extension or URL argument.
  // Holding shared US owner/consent locks indefinitely is unsafe: RPC reads
  // are bounded and cancellable. Even a callback that ignores abort cannot
  // extend the lock because Promise.race rejects and rolls back this txn.
  const controller=new AbortController();
  let timeoutHandle:ReturnType<typeof setTimeout>|undefined;
  let observed:ServerObservedUSDC;
  try{
   const providerResult=Promise.resolve().then(()=>
     input.fetchUSDCFromTrustedServer(row.wallet_address,controller.signal));
   const timeout=new Promise<never>((_,reject)=>{
     timeoutHandle=setTimeout(()=>{
       reject(Error('US_AGENTIC_RPC_TIMEOUT'));
       controller.abort();
     },input.rpcTimeoutMs??6000);
   });
   observed=await Promise.race([providerResult,timeout]);
  }finally{
   if(timeoutHandle!==undefined)clearTimeout(timeoutHandle);
   controller.abort();
  }
  const facts:USAgenticReadTrustFacts={
   usSession:{subject:row.subject,verifiedByUSServer:true,status:'active'},
   walletBinding:{id:row.binding_id,ownerSubject:row.subject,address:row.wallet_address,
     chainId:137,source:row.source as 'external'|'privy',
     verifiedAt:iso(row.verified_at),revokedAt:null},
   consent:{id:row.consent_id,ownerSubject:row.subject,walletBindingId:row.binding_id,
     capability:row.capability as 'wallet.read.polygon_usdc',
     issuedAt:iso(row.issued_at),expiresAt:iso(row.expires_at),
     revokedAt:null,verifiedExplicitUserApproval:true},
   chainObservation:observed as USAgenticReadTrustFacts['chainObservation'],
   now:input.now
  };
  // Do not leak a balance if the consent expired during a slow chain lookup.
  // The evaluation must use the wall clock at completion, not the request's
  // earlier time snapshot (which could be close to the expiry boundary).
  const completedAt=Date.now();
  if(completedAt>=Date.parse(iso(row.expires_at))){
   await commitIfOwned();
   return rejected('US_AGENTIC_DB_CONSENT_EXPIRED');
  }
  facts.now=new Date(completedAt);
  const decision=evaluatePersonalUSAgenticRead(facts);
  await commitIfOwned();
  return {
   decision,rawUsdcBalance:decision.decision==='allow_read'?observed.rawBalance:null,
   ownerWalletAddress:decision.decision==='allow_read'?row.wallet_address:null,
   chainId:137,executionAllowed:false
  };
 }catch(error){
  if(started)try{await client.query('ROLLBACK');}catch{/* keep original failure */}
  throw error;
 }finally{if(ownsTransaction)client.release();}
}
