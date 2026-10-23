import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  parseBrlInput,displayBrl,evaluateQuote,compareUserQuotes,FUTURE_MARKETPLACE_CAPABILITIES
} from '../apps/web/src/PersonalMarketplaceEngine.ts';

assert.equal(parseBrlInput('2.500,75'),'250075');
assert.equal(parseBrlInput('0',true),'0');
assert.equal(displayBrl(250075n),'R$ 2.500,75');
assert.throws(()=>parseBrlInput('-2.500'));
assert.throws(()=>parseBrlInput('0'));
assert.throws(()=>parseBrlInput('Infinity'));
assert.throws(()=>parseBrlInput('1.000,999'));

const a={label:'A',principalMinor:'2000000',upfrontMinor:'200000',
 installmentMinor:'170000',installments:12,extraFeesMinor:'5000'};
const b={label:'B',principalMinor:'2000000',upfrontMinor:'200000',
 installmentMinor:'180000',installments:12,extraFeesMinor:'5000'};
const first=evaluateQuote(a);
assert.equal(first.totalMinor,2245000n);
assert.equal(first.nominalCostMinor,245000n);
const compared=compareUserQuotes(a,b);
assert.equal(compared.comparable,true);
assert.equal(compared.cheapest,'a');
assert.equal(compared.differenceMinor,120000n);
assert.equal(compared.partnerConnected,false);
assert.equal(compared.userDataShared,false);
assert.equal(compared.externalEffect,false);
assert.match(compared.notes.join(' '),/NÃO é o Custo Efetivo Total/i);
const unequal=compareUserQuotes(a,{...b,principalMinor:'1800000'});
assert.equal(unequal.comparable,false);
assert.equal(unequal.cheapest,null);
assert.equal(unequal.differenceMinor,null);
assert.equal(compareUserQuotes(a,a).cheapest,'tie');
assert.throws(()=>evaluateQuote({...a,installments:0}));
assert.throws(()=>evaluateQuote({...a,installments:361}));
assert.throws(()=>evaluateQuote({...a,label:''}));
assert.equal(FUTURE_MARKETPLACE_CAPABILITIES.length,6);
assert.ok(FUTURE_MARKETPLACE_CAPABILITIES.every(x=>x.status==='not_connected'||x.status==='disabled'));

for(const file of ['apps/web/src/PersonalMarketplaceEngine.ts','apps/web/src/PersonalMarketplaceLab.tsx']){
 const source=readFileSync(file,'utf8');
 assert.doesNotMatch(source,/\bfetch\s*\(|XMLHttpRequest|sendBeacon|localStorage\.setItem|sessionStorage\.setItem|WebSocket\s*\(/,
  file+' must never transmit entered figures or store quote history');
}
console.log('Personal marketplace: deterministic comparison, equal basis, no CET claim, empty partners, no data-sharing OK');
