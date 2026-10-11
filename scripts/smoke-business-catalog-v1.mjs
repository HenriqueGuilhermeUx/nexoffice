import fs from 'node:fs';

const migration=fs.readFileSync(new URL('../infra/postgres/041_business_catalog.sql',import.meta.url),'utf8');
const routes=fs.readFileSync(new URL('../apps/api/src/routes-catalog.ts',import.meta.url),'utf8');
const operations=fs.readFileSync(new URL('../apps/api/src/routes-business-operations.ts',import.meta.url),'utf8');
const server=fs.readFileSync(new URL('../apps/api/src/server.ts',import.meta.url),'utf8');
const panel=fs.readFileSync(new URL('../apps/web/src/BusinessCatalogPanel.tsx',import.meta.url),'utf8');
const operationUi=fs.readFileSync(new URL('../apps/web/src/BusinessOperationCenter.tsx',import.meta.url),'utf8');
const materials=fs.readFileSync(new URL('../apps/web/src/MaterialsCenter.tsx',import.meta.url),'utf8');

function expect(condition,message){if(!condition)throw new Error(message)}

expect(migration.includes('create table if not exists business_catalog_items'),'Catalog table migration missing');
expect(migration.includes('catalog_item_id'),'Commercial operation catalog lineage missing');
expect(migration.includes('quantity numeric'),'Commercial operation quantity missing');
expect(migration.includes('unit_price_minor'),'Commercial operation unit price snapshot missing');

for(const endpoint of [
  "app.get('/v1/catalog/items'",
  "app.get('/v1/catalog/summary'",
  "app.post('/v1/catalog/items'",
  "app.patch('/v1/catalog/items/:id'",
  "app.delete('/v1/catalog/items/:id'"
])expect(routes.includes(endpoint),'Catalog endpoint missing: '+endpoint);

expect(routes.includes("workspaceContext(req,'workspace.read')"),'Catalog reads must be workspace scoped');
expect(routes.includes("workspaceContext(req,'workspace.write')"),'Catalog writes must be workspace scoped');
expect(routes.includes('catalog.item_created')&&routes.includes('catalog.item_updated')&&routes.includes('catalog.item_archived'),'Catalog audit trail missing');
expect(routes.includes('catalog_name_exists')&&routes.includes('catalog_sku_exists'),'Catalog uniqueness guards missing');
expect(server.includes("registerCatalogRoutes"),'Catalog routes are not registered');

expect(operations.includes('catalogItemId'),'Commercial operation does not accept catalog item');
expect(operations.includes('catalogSnapshot'),'Commercial operation must snapshot catalog context');
expect(operations.includes('catalog_fiscal_code')&&operations.includes('catalog_nbs'),'Fiscal preparation does not reuse catalog tax hints');
expect(operations.includes('catalogItemId:operation.catalog_item_id'),'Catalog lineage missing from downstream payload');
expect(operations.includes("externalEffect:false"),'Commercial safety declaration missing');

expect(panel.includes('Catálogo do Negócio'),'Catalog UI label missing');
expect(panel.includes('Usar na operação'),'Catalog-to-operation action missing');
expect(operationUi.includes('<BusinessCatalogPanel'),'Catalog panel not mounted in commercial operations');
expect(operationUi.includes('selectedCatalog'),'Catalog selection not connected to operation form');

expect(materials.includes("api<CatalogItem[]>('/v1/catalog/items')"),'Materials Studio is not loading catalog offers');
expect(materials.includes('<MaterialCatalogPicker'),'Materials Studio catalog picker missing');
expect(materials.includes('catalogItemId:catalogId||null'),'Materials do not preserve catalog lineage');

for(const source of [routes,operations,panel,operationUi,materials]){
  expect(!/auto.?payout|automatic.?payout|auto.?publish|automatic.?outreach/i.test(source),'Business Catalog V1 must not add automatic external effects');
}

console.log('NexOffice Business Catalog V1 contract OK');
