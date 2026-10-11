import fs from 'node:fs';

const migration=fs.readFileSync(new URL('../infra/postgres/042_business_profitability.sql',import.meta.url),'utf8');
const route=fs.readFileSync(new URL('../apps/api/src/routes-profitability.ts',import.meta.url),'utf8');
const operations=fs.readFileSync(new URL('../apps/api/src/routes-business-operations.ts',import.meta.url),'utf8');
const catalog=fs.readFileSync(new URL('../apps/web/src/BusinessCatalogPanel.tsx',import.meta.url),'utf8');
const profitability=fs.readFileSync(new URL('../apps/web/src/ProfitabilityPanel.tsx',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../apps/web/src/App.tsx',import.meta.url),'utf8');
const server=fs.readFileSync(new URL('../apps/api/src/server.ts',import.meta.url),'utf8');
const materials=fs.readFileSync(new URL('../apps/web/src/MaterialsCenter.tsx',import.meta.url),'utf8');

function expect(condition,message){if(!condition)throw new Error(message)}

expect(migration.includes('unit_cost_minor'),'Profitability migration must add an operation cost snapshot');
expect(migration.includes('Cost snapshot'),'Cost snapshot must be documented');

expect(route.includes("app.get('/v1/finance/profitability'"),'Profitability endpoint missing');
expect(route.includes("workspaceContext(req,'finance.read')"),'Profitability must be workspace scoped');
expect(route.includes('cost_known_revenue_minor'),'Profitability must separate cost-covered revenue');
expect(route.includes('cost_coverage_pct'),'Profitability must expose cost coverage');
expect(route.includes("action:'catalog_set_cost'"),'Missing-cost next best action missing');
expect(route.includes("action:'catalog_review_price'"),'Low-margin price review option missing');
expect(route.includes("action:'create_proposal'"),'Proposal option missing');
expect(route.includes("action:'review_receivables'"),'Cash conversion option missing');
expect(route.includes('coverage<100'),'Incomplete cost coverage must gate margin recommendations');

expect(operations.includes('unitCostMinor=catalog?.cost_minor'),'Operation cost snapshot is not captured from the catalog');
expect(operations.includes('unit_cost_minor'),'Operation insert does not persist unit cost');
expect(operations.includes('unitCostMinor:operation.unit_cost_minor'),'Finance lineage does not retain unit cost context');

expect(catalog.includes("await patch('/v1/catalog/items/'"),'Catalog item editing is not connected to API');
expect(catalog.includes('Editar oferta'),'Catalog edit action must be visible');
expect(catalog.includes('Custo estimado'),'Catalog edit must expose cost');

expect(profitability.includes('MELHORES OPÇÕES AGORA'),'Next-best-action block missing from profitability UI');
expect(profitability.includes('Fazer agora'),'Recommended actions must be one-click accessible');
expect(profitability.includes("nexoffice:business-operations"),'Profitability must connect actions to commercial operations');
expect(profitability.includes("nexoffice:navigate"),'Profitability must connect actions to product navigation');

expect(app.includes('<ProfitabilityPanel/>'),'Profitability must be visible inside Finance');
expect(app.includes("addEventListener('nexoffice:navigate'"),'App navigation bridge missing');
expect(materials.includes('nexoffice.material.catalogItemId'),'Proposal handoff must preserve selected catalog offer');
expect(server.includes('registerProfitabilityRoutes'),'Profitability routes are not registered');

for(const source of [route,profitability,catalog]){
  expect(!/auto.?payout|automatic.?outreach|auto.?publish|automatic.?publication/i.test(source),'Profitability V1 must not add automatic external effects');
}

console.log('NexOffice Business Profitability V1 contract OK');
