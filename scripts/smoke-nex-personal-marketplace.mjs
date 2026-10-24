import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  parseBrlInput,displayBrl,evaluateQuote,compareUserQuotes,assessVerifiedCreditOffers,FUTURE_MARKETPLACE_CAPABILITIES
} from '../apps/web/src/PersonalMarketplaceEngine.ts';

assert.equal(parseBrlInput('2.500,75'),'250075');
assert.equal(parseBrlInput('2.500'),'250000','2.500 in Brazil means two thousand five hundred, not two reais and fifty');
assert.equal(parseBrlInput('1.000.000'),'100000000','Multiple thousands separators must not be interpreted as cents');
assert.equal(parseBrlInput('R$ 1.250,5'),'125050');
assert.equal(parseBrlInput('2500,75'),'250075');
assert.equal(parseBrlInput('2500'),'250000');
assert.equal(parseBrlInput('0,00',true),'0');
assert.throws(()=>parseBrlInput('12.50'),/vírgula/,'A dot cannot ambiguously represent cents');
assert.throws(()=>parseBrlInput('1,234'),/dois dígitos/);
assert.throws(()=>parseBrlInput('12.3456'));
assert.throws(()=>parseBrlInput('1.2.345'));

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

const baseOffer={id:'bank-a',providerName:'Banco A',principalMinor:'2000000',termMonths:12,
 totalPayableMinor:'2400000',cetAnnualBps:2800,platformCommissionMinor:'90000',
 sponsored:false,sourceVerified:true,validUntil:'2026-10-30'};
const bankB={...baseOffer,id:'bank-b',providerName:'Banco B',totalPayableMinor:'2250000',
 cetAnnualBps:2700,platformCommissionMinor:'1'};
const sponsored={...baseOffer,id:'sponsor-x',providerName:'Patrocinador X',totalPayableMinor:'2100000',
 cetAnnualBps:2300,platformCommissionMinor:'150000',sponsored:true};
const ranked=assessVerifiedCreditOffers([baseOffer,bankB,sponsored],
 {principalMinor:'2000000',termMonths:12},'2026-10-23');
assert.deepEqual(ranked.organic.map(q=>q.id),['bank-b','bank-a']);
assert.deepEqual(ranked.sponsored.map(q=>q.id),['sponsor-x']);
assert.equal(ranked.commissionsUsedInRanking,false);
assert.equal(ranked.externalEffect,false);
const altered=assessVerifiedCreditOffers([
 {...baseOffer,platformCommissionMinor:'1'}, {...bankB,platformCommissionMinor:'100000'},
 {...sponsored,platformCommissionMinor:'0'}
],{principalMinor:'2000000',termMonths:12},'2026-10-23');
assert.deepEqual(altered.organic.map(q=>q.id),ranked.organic.map(q=>q.id),
 'Changing commissions cannot alter organic ranking');
const noApproval=assessVerifiedCreditOffers([{...bankB,sourceVerified:false}],
 {principalMinor:'2000000',termMonths:12},'2026-10-23');
assert.equal(noApproval.organic.length,0,'unverified offers are never presented');
assert.equal(assessVerifiedCreditOffers([{...bankB,validUntil:'2026-10-22'}],
 {principalMinor:'2000000',termMonths:12},'2026-10-23').organic.length,0);

console.log('Personal marketplace: deterministic comparison, equal basis, no CET claim, empty partners, no data-sharing OK');
