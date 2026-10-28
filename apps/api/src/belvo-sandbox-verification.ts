/**
 * Read-only Belvo OFDA sandbox link + consent verification.
 * Never trust browser widget callbacks or webhook payloads as consent proof.
 * Never returns PII, credentials, raw API response, or balances.
 * API endpoints are fixed, redirect disabled and credentials remain on server.
 */
import {BELVO_SANDBOX_HOST,BELVO_MOCKBANK,widgetReady,type SandboxConfig} from './belvo-sandbox-contract.js';

const uuidPattern=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const externalPattern=/^nexa_pf_sb_[a-f0-9]{32}$/;
export class BelvoVerificationError extends Error{
 constructor(public readonly code:'disabled'|'invalid_reference'|'provider_unavailable'|'provider_rejected'|'invalid_response'){
  super(code);this.name='BelvoVerificationError';
 }
}
export type VerifiedSandboxConsent={
 verified:true;simulation:true;linkRef:string;consentRef:string;
 institution:typeof BELVO_MOCKBANK;verifiedAt:string;
 accountsPermission:true;portfolioImported:false;paymentsEnabled:false;
};
export type ConsentVerificationInput={externalId:string;linkId:string};
export async function verifyBelvoSandboxConsent(
 env:SandboxConfig,input:ConsentVerificationInput,
 http:typeof fetch=fetch,
 now=new Date(),requireTransactions=false
):Promise<VerifiedSandboxConsent|null>{
 if(!widgetReady(env))throw new BelvoVerificationError('disabled');
 if(!externalPattern.test(input.externalId)||!uuidPattern.test(input.linkId)
  ||!Number.isFinite(now.getTime()))throw new BelvoVerificationError('invalid_reference');
 const authorization='Basic '+Buffer.from(env.BELVO_SANDBOX_SECRET_ID!+':'
   +env.BELVO_SANDBOX_SECRET_PASSWORD!,'utf8').toString('base64');
 async function get(path:string):Promise<Record<string,unknown>>{
  let res:Response;
  try{
   res=await http(BELVO_SANDBOX_HOST+path,{
    method:'GET',headers:{authorization,accept:'application/json'},
    redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000)
   });
  }catch{throw new BelvoVerificationError('provider_unavailable');}
  if(!res.ok)throw new BelvoVerificationError('provider_rejected');
  let value:unknown;
  try{value=await res.json();}catch{throw new BelvoVerificationError('invalid_response');}
  if(!value||typeof value!=='object'||Array.isArray(value))
   throw new BelvoVerificationError('invalid_response');
  return value as Record<string,unknown>;
 }
 // Exact link ID is not sufficient: server MUST check unique opaque external
 // ID, fixed mockbank and active link status before even reading consents.
 const link=await get('/api/links/'+encodeURIComponent(input.linkId)+'/');
 if(link.id!==input.linkId||link.external_id!==input.externalId
  ||link.institution!==BELVO_MOCKBANK||link.status!=='valid')
  return null;
 const document=env.BELVO_SANDBOX_MOCK_CPF;
 if(!document||!/^[0-9]{11}$/.test(document))throw new BelvoVerificationError('disabled');
 // Belvo consent list is filtered by user_document (not link); fail closed on
 // pagination rather than trusting a truncated list or fetching an unbounded
 // number of third-party records. The document is exclusively a mock fixture.
 const data=await get('/api/consents/?user_document='+encodeURIComponent(document)+'&page_size=1000');
 const records=data.results;
 if(!Array.isArray(records)||typeof data.count!=='number'
  ||!Number.isSafeInteger(data.count)||data.count<0
  ||data.count>records.length||data.next!==null)
  throw new BelvoVerificationError('invalid_response');
 for(const item of records){
  if(!item||typeof item!=='object'||Array.isArray(item))continue;
  const consent=item as Record<string,unknown>;
  if(consent.link_id!==input.linkId||consent.belvo_institution_name!==BELVO_MOCKBANK
   ||consent.document_number!==document||consent.status!=='AUTHORISED'
   ||typeof consent.id!=='string'||!uuidPattern.test(consent.id))continue;
  const permissions=consent.permissions;
  if(!permissions||typeof permissions!=='object'||Array.isArray(permissions)
   ||!Array.isArray((permissions as Record<string,unknown>).ACCOUNTS)
   ||!(permissions as {ACCOUNTS:unknown[]}).ACCOUNTS.length)continue;
  if(requireTransactions&&(!Array.isArray((permissions as Record<string,unknown>).TRANSACTIONS)
    ||!(permissions as {TRANSACTIONS:unknown[]}).TRANSACTIONS.length))continue;
  const noExpiration=consent.undefined_consent_expiration===true
    &&consent.expired_at===null;
  const expiration=typeof consent.expired_at==='string'
    ?Date.parse(consent.expired_at):NaN;
  if(!noExpiration&&(!Number.isFinite(expiration)||expiration<=now.getTime()))continue;
  return {
   verified:true,simulation:true,linkRef:input.linkId,
   consentRef:consent.id,institution:BELVO_MOCKBANK,
   verifiedAt:now.toISOString(),accountsPermission:true,
   portfolioImported:false,paymentsEnabled:false
  };
 }
 return null;
}
