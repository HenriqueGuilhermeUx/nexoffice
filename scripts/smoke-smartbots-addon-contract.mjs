import fs from 'node:fs';

const runtime=fs.readFileSync(new URL('../apps/api/src/integration-runtime.ts',import.meta.url),'utf8');
const routes=fs.readFileSync(new URL('../apps/api/src/routes-smartbots.ts',import.meta.url),'utf8');
const revenueRoutes=fs.readFileSync(new URL('../apps/api/src/routes-revenue.ts',import.meta.url),'utf8');
const reconcile=fs.readFileSync(new URL('../apps/api/src/smartbots-addon-reconciliation.ts',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../apps/web/src/IntegrationSetupCenter.tsx',import.meta.url),'utf8');
const revenueUi=fs.readFileSync(new URL('../apps/web/src/RevenueCenter.tsx',import.meta.url),'utf8');
const main=fs.readFileSync(new URL('../apps/web/src/main.tsx',import.meta.url),'utf8');
const envExample=fs.readFileSync(new URL('../.env.example',import.meta.url),'utf8');

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
expect(runtime.includes('NEXOFFICE_SMARTBOTS_EXTERNAL_ACTIONS'),'Isolated SmartBots external-action gate missing');
expect(runtime.includes("topic==='smartbots.message.send'&&smartBotsEnabled"),'Isolated gate must apply only to SmartBots message.send');
expect(envExample.includes('NEXOFFICE_EXTERNAL_ACTIONS=false'),'Global external action gate must remain OFF by default');
expect(envExample.includes('NEXOFFICE_SMARTBOTS_EXTERNAL_ACTIONS=false'),'SmartBots external action gate must remain OFF by default');
expect(reconcile.includes("status='paused'"),'Subscription-loss reconciliation missing');
expect(ui.includes('Ativar SmartBots')&&ui.includes('Abrir SmartBots'),'One-click SmartBots UX missing');
expect(ui.includes('<details className="iscAdvanced">'),'Manual binding must stay collapsed');

expect(revenueRoutes.includes("app.get('/v1/revenue/overview'"),'Revenue attribution overview endpoint missing');
expect(revenueRoutes.includes('modo_won_value_minor'),'Revenue overview must expose MODO-attributed won value');
expect(revenueRoutes.includes("metadata->>'marketingProjectId'"),'Revenue attribution must use the existing MODO project identity');
expect(revenueRoutes.includes('moneyNow'),'Revenue overview must expose prioritized money-now signals');
expect(revenueRoutes.includes("app.post('/v1/revenue/followups'"),'Native revenue follow-up endpoint missing');
expect(revenueRoutes.includes("'approval_required'"),'Revenue follow-up must always require approval');
expect(revenueRoutes.includes("{type:'message.send',payload}"),'Revenue follow-up must route through SmartBots message.send');
expect(revenueRoutes.includes('humanApprovalRequired:true'),'Revenue follow-up approval proof metadata missing');
expect(revenueRoutes.includes('externalEffect:false'),'Revenue preparation must not claim an external effect');
expect(revenueUi.includes("post('/v1/revenue/followups'"),'Revenue UI must use the governed follow-up endpoint');
expect(revenueUi.includes("api<RevenueOverview>('/v1/revenue/overview')"),'Revenue UI must consume attributed revenue overview');
expect(revenueUi.includes('Receita atribuída'),'Revenue UI must expose MODO-attributed revenue');
expect(revenueUi.includes('DINHEIRO AGORA'),'Revenue UI must surface prioritized monetization actions');
expect(revenueUi.includes('MODO + SmartBots'),'Revenue UI must expose the combined revenue loop');
expect(revenueUi.includes('Enviar para aprovação'),'Revenue UI must keep outbound approval-first');
expect(main.includes('<RevenueCenter/>'),'Revenue Loop must be mounted inside NexOffice');

for(const source of [runtime,routes,revenueRoutes,reconcile,ui,revenueUi]){
  expect(!/KAPSO_API_KEY|provider_phone_number_id|WABA/i.test(source),'NexOffice must not depend on WhatsApp provider internals');
}
console.log('SmartBots NexOffice add-on + native Revenue Loop architecture contract OK');
