import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 citizenGuide,debtScenario,debtNegotiationDraft,legalChecklist,parseMoney,brl
} from '../apps/web/src/PersonalCitizenHelpers.ts';

const iptu=citizenGuide('iptu','Santos','SP');
assert.match(iptu.title,/Santos \/ SP/);
assert.equal(iptu.officialLinks.length,0,'No unverified city URLs fabricated');
assert.match(iptu.steps.join(' '),/Prefeitura/);
const cin=citizenGuide('identity','Santos','SP');
assert.ok(cin.officialLinks.every(x=>new URL(x.url).hostname==='www.gov.br'));
assert.match(cin.steps.join(' '),/certid[aã]o/i);
const building=citizenGuide('construction','Belo Horizonte','MG');
assert.match(building.steps.join(' '),/ART ou RRT/);
assert.match(citizenGuide('vehicle','Campinas','SP').caution,/agendamento automático/);
assert.equal(parseMoney('8.500,00'),850000n);
const fair=debtScenario({
 claimedMinor:850000n,upfrontMinor:50000n,installments:10,installmentMinor:25000n,monthlyFreeMinor:30000n
});
assert.equal(fair.totalMinor,300000n);
assert.equal(fair.differenceMinor,550000n);
assert.equal(fair.monthlyAffordable,true);
assert.equal(brl(fair.totalMinor),'R$ 3.000,00');
const expensive=debtScenario({claimedMinor:50000n,upfrontMinor:10000n,installments:3,installmentMinor:20000n});
assert.equal(expensive.differenceMinor,-20000n);
assert.throws(()=>debtScenario({claimedMinor:50000n,upfrontMinor:0n,installments:121,installmentMinor:200n}));
const draft=debtNegotiationDraft('Banco Modelo',850000n,300000n);
assert.match(draft,/memória de cálculo/);
assert.match(draft,/credor atual/);
assert.match(draft,/não constitui reconhecimento/i);
assert.ok(!draft.includes('CPF'));
const legal=legalChecklist('labor','O contrato estipula salário, mas não indica jornada, férias ou rescisão.');
assert.equal(legal.reviewed,true);
assert.ok(legal.missing.length>=1);
assert.match(legal.disclaimer,/não análise jurídica/);
assert.ok(legalChecklist('condo','').missing.length>0);

for(const file of [
 'apps/web/src/PersonalCitizenHelpers.ts',
 'apps/web/src/PersonalCitizenAgents.tsx'
]){
 const source=readFileSync(file,'utf8');
 assert.doesNotMatch(source,/\bfetch\s*\(|XMLHttpRequest|sendBeacon|localStorage\.setItem|sessionStorage\.setItem|WebSocket\s*\(/,
  file+' must not upload or persist typed sensitive data');
}
console.log('Personal local citizen, debt and legal helpers: calculations, trusted portals and no data upload OK');
