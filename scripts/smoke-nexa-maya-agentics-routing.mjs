import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MAYA_QUICK_INTENTS,mayaRouteFor,routeMayaIntent} from '../apps/web/src/personal-assistant-routing.ts';

for(const [message,section,agent] of [
 ['organizar minhas despesas','agents','expenses'],
 ['rever metas de viagem','agents','planning'],
 ['comparar um CDB','agents','investments'],
 ['comparar uma compra','agents','shopping'],
 ['preciso de contrato','agents','contracts'],
 ['renegociar dívida','agents','debt_review'],
 ['como emitir IPTU','agents','public_services'],
 ['minha privacidade e LGPD','privacy',null],
 ['quero enviar USDC','crypto',null],
 ['quero fazer pix','crypto',null],
 ['conectar Metamask','crypto',null],
 ['rever o saldo das contas','agents','financial'],
 ['quero organizar contas a vencer','agents','payments']
]){
 const routed=routeMayaIntent(message);
 assert.ok(routed,'missing route '+message);
 assert.equal(routed.destination.section,section,message);
 assert.equal(routed.destination.agent,agent,message);
 assert.equal(routed.capability,'personal.local_navigation');
 assert.equal(routed.sharesWalletSession,false);
 assert.equal(routed.mayExecuteFinancialOperation,false);
 assert.equal(routed.requiresExternalConsent,false);
}
assert.equal(routeMayaIntent(''),null);
assert.equal(routeMayaIntent('x'.repeat(241)),null);
assert.equal(MAYA_QUICK_INTENTS.length,6);
for(const intent of MAYA_QUICK_INTENTS)assert.equal(mayaRouteFor(intent).mayExecuteFinancialOperation,false);
const component=readFileSync('apps/web/src/NexaMayaCoordinator.tsx','utf8');
const entry=readFileSync('apps/web/src/NexPersonal.tsx','utf8');
const hub=readFileSync('apps/web/src/NexaCryptoHub.tsx','utf8');
assert.match(entry,/NexaMayaCoordinator/);
assert.match(entry,/section==='maya'&&<>/);
assert.match(hub,/Assistente Nexa/);
assert.match(component,/routeMayaIntent\(request\)/);
assert.match(component,/onOpenAgent\(destination.agent\)/);
assert.doesNotMatch(component,/fetch\s*\(|localStorage|sessionStorage|postMessage\s*\(|window\.open\s*\(/);
assert.doesNotMatch(component,/privy|Pix.*(execute|send)/i);
console.log('Nexa PF Maya local coordinator: 13 intents, distinct Wallet Assistant, zero external execution PASS');
