import fs from 'node:fs';
import assert from 'node:assert/strict';

const adapter=fs.readFileSync('apps/api/src/nextgen-financial-adapter.ts','utf8');
const routes=fs.readFileSync('apps/api/src/routes-financial-engine.ts','utf8');
const standalone=fs.readFileSync('apps/api/src/routes-standalone.ts','utf8');
const migration=fs.readFileSync('infra/postgres/039_nextgen_financial_engine.sql','utf8');

for(const path of ['/v1/collections/payment-engine','/v1/collections/actions/:actionId/execute-charge','/v1/collections/ledger/:id/charge','/v1/collections/ledger/:id/reconcile-charge','/v1/collections/recurring-rules/:id/prepare-pix-recurring','/v1/collections/actions/:actionId/execute-recurring','/v1/collections/recurring','/v1/collections/recurring/:operationId/prepare-cancel','/v1/collections/actions/:actionId/execute-recurring-cancel'])assert.ok(routes.includes(path),`missing route ${path}`);
assert.ok(adapter.includes("NEXTGEN_FINANCIAL_ACTIONS_ENABLED||'false'"),'NexOffice financial actions must default OFF');
assert.ok(routes.includes('humanConfirmed:z.literal(true)'),'explicit final human confirmation missing');
assert.ok(routes.includes("action.autonomy!=='approval_required'"),'approved command action boundary missing');
assert.ok(routes.includes("action.status!=='approved'"),'command action must be approved before execution');
assert.ok(routes.includes("action.approval_status!=='approved'"),'approval request must be approved before execution');
assert.ok(routes.includes("'payment.charge.create'"),'charge action contract missing');
assert.ok(routes.includes("'payment.recurring.create'"),'recurring creation action contract missing');
assert.ok(routes.includes("'payment.recurring.cancel'"),'recurring cancellation action contract missing');
assert.ok(routes.includes('ledgerMarkedPaid:becamePaid'),'paid provider evidence must reconcile the existing ledger');
assert.ok(routes.includes("emitBusinessEvent(ctx.workspaceId,'payment.received'"),'reconciled income must project payment.received');
assert.ok(routes.includes('externalEffect:false'),'read/reconciliation paths must declare no financial external effect');
assert.ok(routes.includes('externalEffect:true'),'provider mutations must declare external effect');
assert.ok(routes.includes('safeCharge'),'provider charge response must be sanitized');
assert.ok(routes.includes('safeSubscription'),'provider recurring response must be sanitized');
assert.ok(!routes.includes('WOOVI_APP_ID')&&!adapter.includes('WOOVI_APP_ID'),'NexOffice must not own Woovi credentials');
assert.ok(!routes.includes('createTransfer')&&!routes.includes('pix-out'),'Pix-out must remain outside V1');
assert.ok(!routes.includes('USDC')&&!routes.includes('PAXG')&&!routes.includes('USDY'),'investment/crypto automation must remain outside V1');
assert.ok(migration.includes('financial_provider_operations'),'provider operation ledger missing');
assert.ok(migration.includes('NexOffice ledger remains source of truth'),'accounting source-of-truth boundary missing');
assert.ok(migration.includes("'payment.charge.create','approval_required'"),'charge approval-first policy missing');
assert.ok(standalone.includes('registerFinancialEngineRoutes(app)'),'financial engine routes not registered');
assert.ok(adapter.includes("headers.set('x-nexoffice-key',key)"),'server-to-server credential header missing');
assert.ok(adapter.includes("headers.set('x-nexoffice-workspace-id',workspaceId)"),'workspace propagation missing');

console.log(JSON.stringify({ok:true,module:'NexOffice Financial Engine V1',providerInvisible:true,ledgerSourceOfTruth:true,approvalRequired:true,humanConfirmationRequired:true,actionsDefaultOff:true,pixOut:false,investmentAutomation:false,openFinanceDeferred:true}));
