/**
 * Nex Personal USA -> Nexa Agentics Trust REFERENCE POLICY (not routed).
 * Pure, deterministic owner-scoped evaluation. No cross-product calls, LLMs,
 * wallet signing or financial actions. Grant and wallet records MUST come from
 * a trusted USA database, not browser-supplied JSON.
 */
export const USA_AGENTIC_READ_CAPABILITY='wallet.read.polygon_usdc' as const;
export const USA_AGENTIC_ALLOWED_TOKEN='0x3c499c542cef5e3811e1192ce70d8cc03d5c3359' as const;
export type USAgenticReadTrustFacts={
 usSession:{subject:string;verifiedByUSServer:true;status:'active'};
 walletBinding:{id:string;ownerSubject:string;address:string;chainId:137;
  source:'external'|'privy';verifiedAt:string;revokedAt:null};
 consent:{id:string;ownerSubject:string;walletBindingId:string;
  capability:typeof USA_AGENTIC_READ_CAPABILITY;
  issuedAt:string;expiresAt:string;revokedAt:null;
  verifiedExplicitUserApproval:true};
 chainObservation:{chainId:137;tokenAddress:typeof USA_AGENTIC_ALLOWED_TOKEN;
  walletAddress:string;rawBalance:string;decimals:6;
  source:'trusted_server_polygon_rpc';observedAt:string};
 now:Date;
};
export type USAgenticTrustDecision={
 decision:'allow_read'|'deny';reason:string;
 canExecute:false;canSign:false;canTransfer:false;canSwap:false;
 portfolioNetWorthUsd:null;operationalLedgerUsd:null;
};
const DENY=(reason:string):USAgenticTrustDecision=>({
 decision:'deny',reason,canExecute:false,canSign:false,
 canTransfer:false,canSwap:false,portfolioNetWorthUsd:null,operationalLedgerUsd:null
});
const AUTH_SUBJECT=/^[a-zA-Z0-9:_-]{8,150}$/;
const ADDRESS=/^0x[0-9a-fA-F]{40}$/;
const INTEGER=/^(0|[1-9][0-9]*)$/;
function ts(s:unknown):number{
 if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s))return NaN;
 return Date.parse(s);
}
export function evaluatePersonalUSAgenticRead(facts:USAgenticReadTrustFacts|undefined):USAgenticTrustDecision{
 if(!facts||!facts.usSession||!facts.walletBinding||!facts.consent||!facts.chainObservation||!facts.now)
  return DENY('TRUST_CONTEXT_MISSING');
 const {usSession:session,walletBinding:binding,consent,chainObservation:obs}=facts;
 const now=facts.now instanceof Date?facts.now.getTime():NaN;
 if(!Number.isFinite(now)||!AUTH_SUBJECT.test(session.subject)||
    session.verifiedByUSServer!==true||session.status!=='active')
  return DENY('US_SESSION_NOT_VERIFIED');
 if(!binding.id||binding.ownerSubject!==session.subject||
    binding.revokedAt!==null||!['external','privy'].includes(binding.source)||
    !ADDRESS.test(binding.address)||binding.chainId!==137||
    !Number.isFinite(ts(binding.verifiedAt))||ts(binding.verifiedAt)>now)
  return DENY('WALLET_OWNER_NOT_VERIFIED');
 if(!consent.id||consent.ownerSubject!==session.subject||
    consent.walletBindingId!==binding.id||
    consent.capability!==USA_AGENTIC_READ_CAPABILITY||
    consent.revokedAt!==null||consent.verifiedExplicitUserApproval!==true)
  return DENY('EXPLICIT_CONSENT_MISSING');
 const issued=ts(consent.issuedAt),expiry=ts(consent.expiresAt);
 if(!Number.isFinite(issued)||!Number.isFinite(expiry)||issued>now||
    expiry<=now||expiry<=issued||expiry-issued>15*60_000)
  return DENY('CONSENT_EXPIRED_OR_TOO_BROAD');
 if(obs.source!=='trusted_server_polygon_rpc'||obs.chainId!==137||
    typeof obs.tokenAddress!=='string'||obs.tokenAddress.toLowerCase()!==USA_AGENTIC_ALLOWED_TOKEN||
    typeof obs.walletAddress!=='string'||obs.walletAddress.toLowerCase()!==binding.address.toLowerCase()||
    obs.decimals!==6)
  return DENY('ONCHAIN_PROVENANCE_INVALID');
 const at=ts(obs.observedAt);
 if(!Number.isFinite(at)||at>now||now-at>2*60_000)
  return DENY('ONCHAIN_OBSERVATION_STALE');
 if(typeof obs.rawBalance!=='string'||obs.rawBalance.length>78||!INTEGER.test(obs.rawBalance)||
    BigInt(obs.rawBalance)>2n**256n-1n)
  return DENY('ONCHAIN_AMOUNT_INVALID');
 return {decision:'allow_read',reason:'EXPLICIT_US_READ_ONLY',
  canExecute:false,canSign:false,canTransfer:false,canSwap:false,
  portfolioNetWorthUsd:null,operationalLedgerUsd:null};
}
