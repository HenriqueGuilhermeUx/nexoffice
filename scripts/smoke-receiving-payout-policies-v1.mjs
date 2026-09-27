import fs from 'node:fs';
import assert from 'node:assert/strict';

const route=fs.readFileSync('apps/api/src/routes-receiving-account.ts','utf8');
const ui=fs.readFileSync('apps/web/src/ReceivingAccountOnboardingBridge.tsx','utf8');

for(const value of ["z.enum(['manual','daily','economic'])","/v1/collections/receiving-account/payout-preview","/v1/collections/receiving-account/payout-policy","/v1/collections/receiving-account/withdraw-now","NEXTGEN_PAYOUT_ACTIONS_ENABLED"]){assert.ok(route.includes(value),`missing payout policy contract: ${value}`)}
assert.ok(route.includes('humanConfirmed:z.literal(true)'),'payout actions require human confirmation');
assert.ok(route.includes('humanApproved:true'),'provider action must carry explicit approval');
assert.ok(route.includes("auditLog(ctx,'collections.receiving_account.withdraw_now'"),'instant payout must be audited');

for(const copy of ['Econômico — acumula para reduzir custo','Diário — um repasse consolidado por dia','Manual — somente quando eu pedir','Receber agora','pode ter tarifa do provider']){assert.ok(ui.includes(copy),`missing payout UX: ${copy}`)}
assert.ok(ui.includes("updatePayoutPolicy('economic')"),'economic policy control missing');
assert.ok(ui.includes("updatePayoutPolicy('daily')"),'daily policy control missing');
assert.ok(ui.includes('window.confirm'),'payout UX must ask for explicit confirmation');
assert.ok(!ui.includes('Woovi'),'provider brand must remain hidden from customer UX');
assert.ok(!ui.includes('subconta'),'technical account model must remain hidden from customer UX');

console.log(JSON.stringify({ok:true,module:'Receiving Payout Policies V1',policies:['economic','daily','manual'],instantPayout:true,humanConfirmation:true,providerHidden:true}));
