import fs from 'node:fs';

const migration=fs.readFileSync(new URL('../infra/postgres/043_recurrence_intelligence.sql',import.meta.url),'utf8');
const route=fs.readFileSync(new URL('../apps/api/src/routes-recurrence-intelligence.ts',import.meta.url),'utf8');
const panel=fs.readFileSync(new URL('../apps/web/src/RecurrenceIntelligencePanel.tsx',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../apps/web/src/App.tsx',import.meta.url),'utf8');
const server=fs.readFileSync(new URL('../apps/api/src/server.ts',import.meta.url),'utf8');

function expect(condition,message){if(!condition)throw new Error(message)}

expect(migration.includes('source_operation_id'),'Recurring rule must retain source operation');
expect(migration.includes('catalog_item_id'),'Recurring rule must retain catalog offer');
expect(migration.includes('recurring_rules_source_operation_uidx'),'Activation must be idempotent per source operation');

expect(route.includes("app.post('/v1/finance/recurrence-intelligence/activate/:operationId'"),'Activation endpoint missing');
expect(route.includes("app.get('/v1/finance/recurrence-intelligence'"),'Intelligence endpoint missing');
expect(route.includes("workspaceContext(req,'finance.write')"),'Activation must be finance-write scoped');
expect(route.includes("workspaceContext(req,'finance.read')"),'Intelligence must be finance-read scoped');
expect(route.includes('retroactiveGeneration:false'),'Activation must explicitly forbid retroactive generation');
expect(route.includes("cycle==='quarterly'"),'Quarterly recurrence mapping missing');
expect(route.includes("action:'activate_recurrence'"),'Activate recurrence recommendation missing');
expect(route.includes("action:'generate_upcoming'"),'Generate upcoming recommendation missing');
expect(route.includes("action:'review_receivables'"),'Receivables risk recommendation missing');
expect(route.includes("action:'create_proposal'"),'Expansion proposal recommendation missing');
expect(!route.includes('emitBusinessEvent'),'Activation should not create an artificial command-center event');

expect(panel.includes('RECORRÊNCIA INTELIGENTE'),'Recurrence intelligence panel missing');
expect(panel.includes('MELHORES OPÇÕES AGORA'),'Next-best-action block missing');
expect(panel.includes('Gerar próximos 30 dias'),'Explicit generation action missing');
expect(panel.includes('nenhuma cobrança, mensagem ou pagamento externo é disparado automaticamente'),'Safety copy missing');
expect(app.includes('<RecurrenceIntelligencePanel/>'),'Recurrence intelligence must be visible in Finance');
expect(server.includes('registerRecurrenceIntelligenceRoutes'),'Recurrence routes must be registered');

console.log('NexOffice Recurrence Intelligence V1 contract OK');
