import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=p=>fs.readFileSync(p,'utf8');
const discovery=read('apps/web/src/ProductDiscovery.tsx');
const marketing=read('apps/web/src/MarketingDiscoveryBridge.tsx');
const main=read('apps/web/src/main.tsx');
const css=read('apps/web/src/product-discovery.css');

for(const title of ['Central de Comando','Equipe Digital','Pergunte à empresa','DocWallet','Investimentos & Mercados','Fiscal','Marketing & Growth','Rede de Profissionais','Backup Empresarial','Compliance & Segurança'])assert.ok(discovery.includes(title),`missing capability tile: ${title}`);
for(const phrase of ['Este é o seu negócio agora.','Você ganhou uma equipe que compartilha contexto.','Pergunte à sua própria empresa.','O trabalho deixa de quebrar entre sistemas.','O NexOffice começa a lembrar junto com você.'])assert.ok(discovery.includes(phrase),`missing discovery tour step: ${phrase}`);
assert.ok(discovery.includes('nexoffice.discovery.completed.'),'discovery completion must be workspace scoped');
assert.ok(discovery.includes('nexoffice.setup.dismissed.'),'discovery must suppress setup while first-run tour is incomplete');
assert.ok(discovery.includes('nexoffice.setup.reopen.'),'discovery must hand off to existing operational setup');
assert.ok(discovery.includes("window.location.reload()"),'discovery-to-setup handoff must be deterministic');
assert.ok(discovery.includes("api<CapabilityGraph>('/v1/capabilities')"),'capability map should use existing capability graph when permitted');
assert.ok(discovery.includes("api<BackupState>('/v1/security/backups')"),'backup state should be reflected');
assert.ok(discovery.includes("api<InvestmentHealth>('/v1/investments/health')"),'F-Insight connection state should be reflected');
assert.ok(!discovery.includes('SERVICE_KEY'),'frontend must not reference server-side service secrets');
assert.ok(!discovery.includes('RESTIC_PASSWORD'),'frontend must not request restic password');
for(const pillar of ['Comando','Equipe Digital','Conhecimento','Dinheiro','Execução','Ecossistema & Segurança'])assert.ok(marketing.includes(`title:'${pillar}'`),`public landing missing pillar ${pillar}`);
for(const stage of ['Cliente','Venda','Contrato','Trabalho','Nota','Cobrança','Pagamento','Resultado','Memória'])assert.ok(marketing.includes(`'${stage}'`),`public landing lineage missing ${stage}`);
assert.ok(main.indexOf('<ProductDiscovery/>')<main.indexOf('<StandaloneSetup/>'),'product discovery must mount before operational setup');
assert.ok(main.includes('<MarketingDiscoveryBridge/>'),'public discovery bridge not mounted');
assert.ok(css.includes('.mkUniverseGrid'),'landing capability universe styles missing');
assert.ok(css.includes('.productCapabilityMap'),'capability map styles missing');
console.log(JSON.stringify({ok:true,module:'Product Discovery & Onboarding V1',tourSteps:5,publicPillars:6,setupPreserved:true,secretExposure:false}));
