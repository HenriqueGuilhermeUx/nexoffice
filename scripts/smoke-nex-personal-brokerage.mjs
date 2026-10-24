import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const api=readFileSync('apps/api/src/routes-nex-personal-brokerage.ts','utf8');
const server=readFileSync('apps/api/src/server-personal.ts','utf8');
const page=readFileSync('apps/web/src/PersonalFInsight.tsx','utf8');
const ui=readFileSync('apps/web/src/PersonalBrokerage.tsx','utf8');

assert.match(server,/registerNexPersonalBrokerageRoutes\(app\)/);
assert.match(api,/app\.get\('\/v1\/personal\/finsight\/brokerage'/);
assert.match(api,/await requireActivePersonal\(req\)/);
assert.match(api,/select user_id from nex_personal\.profiles where user_id=\$1/);
for(const phrase of [
 "status:'preparation'","distributionEnabled:false","recommendationEnabled:false",
 "suitabilityVerified:false","partners:[]","products:[]","leadSubmissionEnabled:false",
 "accountOpeningEnabled:false","orderExecutionEnabled:false","customerDataShared:false",
 "commissionDisclosureRequired:true"
])assert.ok(api.includes(phrase),'Brokerage contract missing '+phrase);
assert.ok(!api.includes('fetch('),'Brokerage must never contact unverified partners');
assert.ok(!api.includes('app.post(')&&!api.includes('app.put(')&&!api.includes('app.delete('),
 'Brokerage must be information only');
assert.ok(!api.includes('workspaceContext('),'No PJ workspace data in PF brokerage');
assert.ok(!api.includes('INSERT INTO')&&!api.includes('insert into'),'No PF lead collection');
assert.match(page,/<PersonalBrokerage token=\{token\}\/>/);
assert.match(ui,/Compare duas propostas que você já recebeu/);
assert.match(ui,/Nenhuma comparação representa recomendação/);
assert.match(ui,/A comparação acontece apenas nesta aba, não é salva, compartilhada ou enviada a parceiros/);
assert.match(ui,/Nenhum rendimento ou preço de demonstração aparece como real/);
assert.match(ui,/setLeft\(\{\.\.\.emptyDraft\}\);setRight\(\{\.\.\.emptyDraft\}\)/);
assert.match(ui,/Nenhuma oferta foi carregada/);
assert.match(ui,/partnerLive=Boolean\(catalog\?\.status==='open'&&catalog\?\.distributionEnabled===true&&catalog\?\.suitabilityVerified===true/);
assert.match(ui,/<table className="np-brokerage-table">/);
assert.match(ui,/<th scope="col">Proposta A<\/th><th scope="col">Proposta B<\/th>/);
assert.match(ui,/\.\/personal-brokerage\.css/);
assert.ok(!ui.includes('localStorage')&&!ui.includes('sessionStorage'),'Draft comparison must not persist');
assert.ok(!ui.includes('fetch(API+\'/v1/personal/finsight/brokerage\',{method:\'POST\''),
 'There must be no outbound request with broker offer drafts');
console.log('Nex Personal brokerage: disabled, no offers/leads/orders, owner-only, local-only neutral comparison OK');
