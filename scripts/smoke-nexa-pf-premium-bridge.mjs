import assert from 'node:assert/strict';
import test from 'node:test';
import {requirePersonalReadScope,PersonalLinkNotAuthorizedError,sameCurrencyMinorTotal}
 from '../packages/integrations/src/personal-portfolio-bridge.ts';

const link={
 linkRef:'trusted-ref',ownerUserRef:'pf-alice',source:'open_finance',providerRef:'belvo',
 status:'active',scopes:['balances.read','investments.read'],
 expiresAt:'2027-10-28T00:00:00Z',verifiedAt:'2026-10-28T00:00:00Z',consentRef:'consent'
};
const now=new Date('2026-10-28T15:00:00Z');
const assertDenied=fn=>assert.throws(fn,PersonalLinkNotAuthorizedError);
test('only the exact session-bound PF owner can read an active consented scope',()=>{
 assert.doesNotThrow(()=>requirePersonalReadScope(link,'pf-alice','balances.read',now));
 assertDenied(()=>requirePersonalReadScope(link,'pf-bob','balances.read',now));
 assertDenied(()=>requirePersonalReadScope({...link,status:'revoked'},'pf-alice','balances.read',now));
 assertDenied(()=>requirePersonalReadScope({...link,status:'expired'},'pf-alice','balances.read',now));
 assertDenied(()=>requirePersonalReadScope({...link,status:'pending_consent'},'pf-alice','balances.read',now));
 assertDenied(()=>requirePersonalReadScope({...link,expiresAt:'2020-01-01T00:00:00Z'},'pf-alice','balances.read',now));
 assertDenied(()=>requirePersonalReadScope({...link,consentRef:null},'pf-alice','balances.read',now));
 assertDenied(()=>requirePersonalReadScope({...link,verifiedAt:null},'pf-alice','balances.read',now));
 assertDenied(()=>requirePersonalReadScope({...link,scopes:['balances.read']},'pf-alice','wallet.read',now));
});
test('amounts across different currencies and partial sources MUST NOT be blended',()=>{
 const brl={source:'open_finance',linkRef:'trusted-ref',instrumentRef:'bank1',
  kind:'bank_account',name:'Banco A',currency:'BRL',balanceMinor:'11100',
  asOf:'2026-10-28',provenance:'provider_verified',coverage:'complete'};
 const brl2={...brl,instrumentRef:'bank2',balanceMinor:'200'};
 const usd={...brl,currency:'USD',balanceMinor:'1500'};
 assert.equal(sameCurrencyMinorTotal([brl,brl2],'BRL'),'11300');
 assert.equal(sameCurrencyMinorTotal([brl,usd],'BRL'),null);
 assert.equal(sameCurrencyMinorTotal([{...brl,coverage:'stale'}],'BRL'),null);
 assert.equal(sameCurrencyMinorTotal([{...brl,balanceMinor:null}],'BRL'),null);
 assert.equal(sameCurrencyMinorTotal([],'BRL'),null);
});
