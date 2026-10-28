/**
 * Belvo OFDA BR mockbank-only read model. NO persistence, balances in production,
 * data aggregation into PF wealth, logging, third-party forwarding or Pix.
 *
 * The read model requires a CURRENT server-to-server verified consent, not a
 * browser callback, webhook receipt or a stored snapshot alone. All results
 * are segregated and explicitly tagged as fictitious sandbox data.
 */
import {BELVO_MOCKBANK,BELVO_SANDBOX_HOST,widgetReady,type SandboxConfig} from './belvo-sandbox-contract.js';
import {verifyBelvoSandboxConsent,BelvoVerificationError} from './belvo-sandbox-verification.js';

const UUID=/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;
export class SandboxReadError extends Error{
 constructor(public readonly code:'disabled'|'invalid_reference'|'provider_failed'|'incomplete_page'|'malformed_data'){
  super(code);this.name='SandboxReadError';
 }
}
type RecordLike=Record<string,unknown>;
function record(value:unknown):RecordLike|null{
 return value&&typeof value==='object'&&!Array.isArray(value)?value as RecordLike:null;
}
function shortText(value:unknown,max=75):string|null{
 if(typeof value!=='string')return null;
 // Never allow untrusted provider output to control text layout.
 const safe=value.replace(/[\x00-\x1f\x7f]/g,' ').trim();
 return safe.length>0&&safe.length<=max?safe:null;
}
function brlMinor(value:unknown):string|null{
 // Belvo may return finer precision than cents. No silent rounding and no
 // floating-point sum: reject unrepresentable monetary figures.
 if(typeof value!=='number'&&! (typeof value==='string'))return null;
 if(typeof value==='number'&&!Number.isFinite(value))return null;
 const normalized=String(value);
 if(!/^-?\d{1,12}(?:\.\d{1,2})?$/.test(normalized))return null;
 const negative=normalized[0]==='-';
 const [whole,fraction='']=(negative?normalized.slice(1):normalized).split('.');
 const minor=(BigInt(whole)*100n+BigInt((fraction+'00').slice(0,2)));
 return (negative?'-':'')+minor.toString();
}
function safeDateTime(value:unknown):string|null{
 if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT/.test(value))return null;
 const date=Date.parse(value);
 return Number.isFinite(date)?new Date(date).toISOString():null;
}
export type SandboxAccount={
 id:string;kind:string;balanceType:'ASSET'|'LIABILITY'|'UNKNOWN';
 currency:'BRL'|null;currentMinor:string|null;availableMinor:string|null;
 collectedAt:string|null;
};
export type SandboxTransaction={
 id:string;kind:string;accountId:string;bookedAt:string|null;
 currency:'BRL'|null;amountMinor:string|null;
};
export type SandboxReadModel={
 environment:'sandbox';institution:typeof BELVO_MOCKBANK;
 source:'belvo_sandbox_demo';simulatedData:true;neverCombineWithRealPortfolio:true;
 readOnly:true;consentCheckedAt:string;verifiedAccounts:true;
 balancesVerifiedForProduction:false;investmentsFetched:false;
 accounts:SandboxAccount[];transactions:SandboxTransaction[];
 accountCount:number;transactionCount:number;noCurrencyTotal:true;
};

export async function readBelvoSandboxDemo(
 env:SandboxConfig,input:{externalId:string;linkId:string},
 http:typeof fetch=fetch, now=new Date()
):Promise<SandboxReadModel|null>{
 if(!widgetReady(env))throw new SandboxReadError('disabled');
 if(!UUID.test(input.linkId)||!/^nexa_pf_sb_[a-f0-9]{32}$/.test(input.externalId)
   ||!Number.isFinite(now.getTime()))throw new SandboxReadError('invalid_reference');
 let permission;
 try{permission=await verifyBelvoSandboxConsent(env,input,http,now);}
 catch(e){if(e instanceof BelvoVerificationError)throw new SandboxReadError('provider_failed');
  throw new SandboxReadError('provider_failed');}
 if(!permission)return null;
 const secret=Buffer.from(env.BELVO_SANDBOX_SECRET_ID!+':'+env.BELVO_SANDBOX_SECRET_PASSWORD!,'utf8').toString('base64');
 async function page(kind:'accounts'|'transactions'):Promise<RecordLike[]>{
  const uri=BELVO_SANDBOX_HOST+'/api/'+kind+'/?link='+encodeURIComponent(input.linkId)+'&page_size=100';
  let res:Response;
  try{res=await http(uri,{
    method:'GET',redirect:'error',cache:'no-store',
    headers:{authorization:'Basic '+secret,accept:'application/json'},
    signal:AbortSignal.timeout(10000)
  });}catch{throw new SandboxReadError('provider_failed');}
  if(!res.ok)throw new SandboxReadError('provider_failed');
  let response:unknown;
  try{response=await res.json();}catch{throw new SandboxReadError('malformed_data');}
  const data=record(response);
  if(!data||!Array.isArray(data.results)||typeof data.count!=='number'
   ||!Number.isSafeInteger(data.count)||data.count<0
   ||data.count!==data.results.length||data.next!==null||data.results.length>100)
   throw new SandboxReadError('incomplete_page');
  if(data.results.some(x=>!record(x)))throw new SandboxReadError('malformed_data');
  return data.results as RecordLike[];
 }
 // Read only data already fetched by provider from the consented mockbank.
 // No POST collection or background sync (which could create new data).
 const [rawAccounts,rawTransactions]=await Promise.all([page('accounts'),page('transactions')]);
 // Fail entire snapshot rather than leak or show foreign-link data.
 for(const item of rawAccounts){
  if(item.link!==input.linkId||!UUID.test(String(item.id||''))
   ||record(item.institution)?.name!==BELVO_MOCKBANK)
   throw new SandboxReadError('malformed_data');
 }
 const accountIds=new Set(rawAccounts.map(x=>String(x.id)));
 for(const item of rawTransactions){
  const account=record(item.account);
  if(!UUID.test(String(item.id||''))||!account
   ||account.link!==input.linkId||!accountIds.has(String(account.id))
   ||record(account.institution)?.name!==BELVO_MOCKBANK)
   throw new SandboxReadError('malformed_data');
 }
 const accounts=rawAccounts.map(a=>{
  const balance=record(a.balance);
  const currency=a.currency==='BRL'||balance?.currency==='BRL'?'BRL' as const:null;
  const balanceType=a.balance_type==='ASSET'||a.balance_type==='LIABILITY'?a.balance_type:'UNKNOWN';
  return {
   id:String(a.id),kind:shortText(a.category,50)||'UNCATEGORIZED',
   balanceType,currency,
   currentMinor:currency?brlMinor(balance?.current):null,
   availableMinor:currency?brlMinor(balance?.available):null,
   collectedAt:safeDateTime(a.collected_at)
  };
 });
 const transactions=rawTransactions.map(t=>{
  const account=record(t.account)!;
  const currency=t.currency==='BRL'?'BRL' as const:null;
  return {
   id:String(t.id),kind:shortText(t.category,55)||'TRANSACTION',
   accountId:String(account.id),bookedAt:safeDateTime(t.transacted_at),
   currency,amountMinor:currency?brlMinor(t.amount):null
  };
 });
 return {
  environment:'sandbox',institution:BELVO_MOCKBANK,
  source:'belvo_sandbox_demo',simulatedData:true,neverCombineWithRealPortfolio:true,
  readOnly:true,consentCheckedAt:now.toISOString(),verifiedAccounts:true,
  balancesVerifiedForProduction:false,investmentsFetched:false,
  accounts,transactions,accountCount:accounts.length,transactionCount:transactions.length,
  noCurrencyTotal:true
 };
}
