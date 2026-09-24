import fs from 'node:fs';

const runtime=fs.readFileSync(new URL('../apps/api/src/integration-runtime.ts',import.meta.url),'utf8');
const routes=fs.readFileSync(new URL('../apps/api/src/routes-smartbots.ts',import.meta.url),'utf8');
const reconcile=fs.readFileSync(new URL('../apps/api/src/smartbots-addon-reconciliation.ts',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../apps/web/src/IntegrationSetupCenter.tsx',import.meta.url),'utf8');

function expect(condition,message){if(!condition)throw new Error(message)}

expect(routes.includes('PARTNER_PRICE_MINOR=7900'),'SmartBots NexOffice price must be R$79');
expect(routes.includes('REGULAR_PRICE_MINOR=14900'),'SmartBots regular reference price must be R$149');
expect(routes.includes("capability='addon.smartbots'"),'SmartBots entitlement missing');
expect(routes.includes("app.post('/v1/integrations/smartbots/activate'"),'SmartBots activation endpoint missing');
expect(routes.includes("app.post('/v1/integrations/smartbots/handoff'"),'SmartBots handoff endpoint missing');
expect(routes.includes('clientTokenPersisted:false'),'Manual Client Token persistence guard missing');
expect(runtime.includes('smartBotsAddonRequest'),'SmartBots add-on runtime adapter missing');
expect(runtime.includes('smartbots_human_approval_required'),'Approval-first outbound guard missing');
expect(runtime.includes('approvalProof(workspaceId,actionId)'),'Outbound approval proof missing');
expect(reconcile.includes("status='paused'"),'Subscription-loss reconciliation missing');
expect(ui.includes('Ativar SmartBots')&&ui.includes('Abrir SmartBots'),'One-click SmartBots UX missing');
expect(ui.includes('<details className="iscAdvanced">'),'Manual binding must stay collapsed');
for(const source of [runtime,routes,reconcile,ui]){
  expect(!/KAPSO_API_KEY|provider_phone_number_id|WABA/i.test(source),'NexOffice must not depend on WhatsApp provider internals');
}
console.log('SmartBots NexOffice add-on architecture contract OK');
