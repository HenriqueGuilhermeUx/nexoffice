import assert from 'node:assert/strict';
import {
 evaluatePersonalUSAgenticRead,USA_AGENTIC_ALLOWED_TOKEN,USA_AGENTIC_READ_CAPABILITY
} from '../apps/api/dist/personal-us-agentic-trust.js';
const now=new Date('2026-10-25T18:00:00.000Z'),owner='us_subject_verified';
const addr='0x1111111111111111111111111111111111111111';
const facts={
 usSession:{subject:owner,verifiedByUSServer:true,status:'active'},
 walletBinding:{id:'wallet-binding-1',ownerSubject:owner,address:addr,chainId:137,
  source:'external',verifiedAt:'2026-10-25T17:00:00.000Z',revokedAt:null},
 consent:{id:'consent-1',ownerSubject:owner,walletBindingId:'wallet-binding-1',
  capability:USA_AGENTIC_READ_CAPABILITY,issuedAt:'2026-10-25T17:50:00.000Z',
  expiresAt:'2026-10-25T18:05:00.000Z',revokedAt:null,
  verifiedExplicitUserApproval:true},
 chainObservation:{chainId:137,tokenAddress:USA_AGENTIC_ALLOWED_TOKEN,walletAddress:addr,
  rawBalance:'120000000',decimals:6,source:'trusted_server_polygon_rpc',
  observedAt:'2026-10-25T17:59:35.000Z'},
 now
};
const clone=()=>structuredClone(facts);
const good=evaluatePersonalUSAgenticRead(facts);
assert.equal(good.decision,'allow_read');
assert.equal(good.canSign,false);
assert.equal(good.canExecute,false);
assert.equal(good.canTransfer,false);
assert.equal(good.canSwap,false);
assert.equal(good.portfolioNetWorthUsd,null);
assert.equal(good.operationalLedgerUsd,null);
const mustDeny=(mutate,reason)=>{
 const input=clone();mutate(input);
 const answer=evaluatePersonalUSAgenticRead(input);
 assert.equal(answer.decision,'deny',reason);
 assert.equal(answer.reason,reason);
 assert.equal(answer.canExecute,false);
 return answer;
};
assert.equal(evaluatePersonalUSAgenticRead(undefined).reason,'TRUST_CONTEXT_MISSING');
mustDeny(f=>{f.usSession.verifiedByUSServer=false},'US_SESSION_NOT_VERIFIED');
mustDeny(f=>{f.usSession.status='suspended'},'US_SESSION_NOT_VERIFIED');
mustDeny(f=>{f.walletBinding.ownerSubject='us_subject_brazil'},'WALLET_OWNER_NOT_VERIFIED');
mustDeny(f=>{f.walletBinding.revokedAt='2026-10-25T17:58:00.000Z'},'WALLET_OWNER_NOT_VERIFIED');
mustDeny(f=>{f.walletBinding.chainId=1},'WALLET_OWNER_NOT_VERIFIED');
mustDeny(f=>{f.consent.ownerSubject='other_owner'},'EXPLICIT_CONSENT_MISSING');
mustDeny(f=>{f.consent.walletBindingId='another-binding'},'EXPLICIT_CONSENT_MISSING');
mustDeny(f=>{f.consent.capability='wallet.send'},'EXPLICIT_CONSENT_MISSING');
mustDeny(f=>{f.consent.verifiedExplicitUserApproval=false},'EXPLICIT_CONSENT_MISSING');
mustDeny(f=>{f.consent.revokedAt=now.toISOString()},'EXPLICIT_CONSENT_MISSING');
mustDeny(f=>{f.consent.expiresAt='2026-10-25T17:59:59.000Z'},'CONSENT_EXPIRED_OR_TOO_BROAD');
mustDeny(f=>{f.consent.expiresAt='2026-10-25T18:10:00.000Z'},'CONSENT_EXPIRED_OR_TOO_BROAD');
mustDeny(f=>{f.chainObservation.source='injected_wallet_eip1193'},'ONCHAIN_PROVENANCE_INVALID');
mustDeny(f=>{f.chainObservation.walletAddress='0x2222222222222222222222222222222222222222'},'ONCHAIN_PROVENANCE_INVALID');
mustDeny(f=>{f.chainObservation.tokenAddress=123},'ONCHAIN_PROVENANCE_INVALID');
mustDeny(f=>{f.chainObservation.chainId=8453},'ONCHAIN_PROVENANCE_INVALID');
mustDeny(f=>{f.chainObservation.observedAt='2026-10-25T17:55:00.000Z'},'ONCHAIN_OBSERVATION_STALE');
mustDeny(f=>{f.chainObservation.rawBalance='-1'},'ONCHAIN_AMOUNT_INVALID');
mustDeny(f=>{f.chainObservation.rawBalance='9'.repeat(100000)},'ONCHAIN_AMOUNT_INVALID');
console.log('Nex Personal USA Maya Agentics Trust read-only policy: PASS');
