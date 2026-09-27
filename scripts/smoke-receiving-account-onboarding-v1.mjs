import fs from 'node:fs';
import assert from 'node:assert/strict';

const adapter=fs.readFileSync('apps/api/src/nextgen-financial-adapter.ts','utf8');
const routes=fs.readFileSync('apps/api/src/routes-receiving-account.ts','utf8');
const standalone=fs.readFileSync('apps/api/src/routes-standalone.ts','utf8');
const ui=fs.readFileSync('apps/web/src/ReceivingAccountOnboardingBridge.tsx','utf8');
const main=fs.readFileSync('apps/web/src/main.tsx','utf8');

for(const path of ['/v1/collections/receiving-account','/v1/collections/receiving-account/setup','/v1/collections/receiving-account/refresh','/v1/collections/receiving-account/test-charge','/v1/collections/receiving-account/withdraw'])assert.ok(routes.includes(path),`missing route ${path}`);
assert.ok(routes.includes("NEXTGEN_RECEIVING_ACCOUNT_ACTIONS_ENABLED||process.env.NEXTGEN_FINANCIAL_ACTIONS_ENABLED||'false'"),'receiving actions must default off');
assert.ok(routes.includes("humanConfirmed:z.literal(true)"),'external receiving actions require explicit human confirmation');
assert.ok(adapter.includes("NEXTGEN_FINANCIAL_RECEIVING_MODE||'subaccount'"),'subaccount receiving mode must be default');
assert.ok(adapter.includes("if(path==='/charges')return '/receiving-account/charges'"),'normal charges must route through workspace receiving account');
assert.ok(adapter.includes("/receiving-account/charges/${reconcile[1]}/reconcile"),'charge reconciliation must stay on subaccount path');
assert.ok(!routes.includes('WOOVI_APP_ID')&&!routes.includes('WOOVI_API_KEY'),'NexOffice must not own Woovi credentials');
assert.ok(standalone.includes('registerReceivingAccountRoutes(app)'),'receiving account routes must be registered');
for(const copy of ['Recebimento Pix','Onde sua empresa vai receber.','Saque diário para a chave cadastrada','Criar cobrança teste R$ 1','O dinheiro não fica no NexOffice.'])assert.ok(ui.includes(copy),`missing onboarding copy: ${copy}`);
assert.ok(ui.includes("humanConfirmed:true"),'setup/test action must carry explicit confirmation');
assert.ok(ui.includes("amountMinor:100"),'test charge must default to R$1.00');
assert.ok(ui.includes("pixKeyMasked"),'UI must only render masked stored key');
assert.ok(!ui.includes('SPLIT_SUB_ACCOUNT'),'provider split terminology must stay hidden from onboarding UX');
assert.ok(!ui.includes('Woovi'),'provider brand must stay hidden from onboarding UX');
assert.ok(main.includes('<ReceivingAccountOnboardingBridge/>'),'onboarding bridge must be mounted');

console.log(JSON.stringify({ok:true,module:'Receiving Account Onboarding V1',providerInvisible:true,subaccountDefault:true,normalChargesUseSubaccount:true,actionsDefaultOff:true,humanConfirmationRequired:true,testChargeMinor:100,dailyPayoutPolicy:true}));
