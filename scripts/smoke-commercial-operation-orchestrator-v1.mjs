import fs from 'node:fs';

const routes=fs.readFileSync(new URL('../apps/api/src/routes-business-operations.ts',import.meta.url),'utf8');
const payments=fs.readFileSync(new URL('../apps/api/src/routes-owned-payments.ts',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../infra/postgres/031_business_operation_communication.sql',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../apps/web/src/BusinessOperationCenter.tsx',import.meta.url),'utf8');
const main=fs.readFileSync(new URL('../apps/web/src/main.tsx',import.meta.url),'utf8');
const plan=fs.readFileSync(new URL('../docs/NEXOFFICE_EXECUTION_PLAN.md',import.meta.url),'utf8');

function expect(condition,message){if(!condition)throw new Error(message)}

expect(routes.includes("app.get('/v1/business-operations'"),'Business operation listing route missing');
expect(routes.includes("app.post('/v1/business-operations'"),'Business operation create route missing');
expect(routes.includes("/prepare-invoice'"),'TaxAgent invoice preparation route missing');
expect(routes.includes("emitBusinessEvent(ctx.workspaceId,'invoice.issue'"),'Invoice flow must use governed fiscal capability');
expect(routes.includes("/prepare-collection'"),'Owner-controlled collection route missing');
expect(routes.includes("/communication-draft'"),'Authenticated Pix draft route missing');
expect(routes.includes('decryptPaymentValue'),'Authenticated Pix draft must use encrypted owner payment profile');
expect(routes.includes('secretPersisted:false'),'Pix draft must declare that raw secret is not persisted');
expect(routes.includes("/prepare-communication'"),'Governed SmartBots reminder route missing');
expect(routes.includes("'approval_required'"),'SmartBots reminder must be approval-first');
expect(routes.includes('paymentDataIncluded:false'),'SmartBots reminder must explicitly exclude payment secrets');
expect(routes.includes('pixKeyPersisted:false'),'SmartBots reminder must explicitly guard Pix persistence');
expect(!routes.includes('{{PIX_KEY}}'),'Persisted SmartBots payload must never contain a Pix-key placeholder for later secret hydration');
expect(!routes.includes('paymentHydration'),'Automatic secret hydration into third-party messaging must not be present');
expect(payments.includes('encryptPaymentValue(input.pixKey)'),'Owner Pix profile must be encrypted before storage');
expect(payments.includes('maskedPixKey'),'Payment profile response must be masked by default');
expect(migration.includes('communication_action_id'),'Business operation must track governed communication lineage');
expect(ui.includes('Contrato')&&ui.includes('Nota')&&ui.includes('Cobrança')&&ui.includes('Comunicar')&&ui.includes('Recebido'),'Commercial operation UI lineage missing');
expect(ui.includes('Ver mensagem Pix'),'Authenticated owner-Pix message action missing');
expect(ui.includes('Lembrete via SmartBots'),'Non-sensitive SmartBots reminder action missing');
expect(ui.includes('Nexa não custodiam nem movimentam o valor'),'UI must communicate no-custody boundary');
expect(main.includes('<BusinessOperationCenter/>'),'Commercial Operation Center must be mounted');
expect(plan.includes('No Nexa BaaS account opening through NexOffice yet.'),'Nexa no-BaaS boundary missing from execution plan');
expect(plan.includes('Full Pix data must not be persisted'),'Pix data boundary missing from execution plan');
expect(plan.includes('DocWallet owns raw contracts/documents'),'DocWallet source-of-truth boundary missing');
expect(plan.includes('TaxAgent owns fiscal issuance'),'TaxAgent source-of-truth boundary missing');
expect(plan.includes('NexJud Mini'),'NexJud Mini milestone missing');
expect(plan.includes('Alternative Ventures Studio'),'AV Studio milestone missing');

for(const source of [routes,ui]){
  expect(!/nexa-business|nexa\/business|cashout|usdc/i.test(source),'Operational Nexa/crypto finance must stay out of Commercial Operation V1');
}

console.log('NexOffice Commercial Operation Orchestrator V1 contract OK');
