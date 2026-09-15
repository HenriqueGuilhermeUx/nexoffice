import {NexOfficePlatformBridgeClient} from '../packages/integrations/dist/index.js';

const base=process.env.SMOKE_API_URL||'http://127.0.0.1:4000';
const internalKey=process.env.NEXOFFICE_INTERNAL_KEY||'platform-smoke-key';
const bridge=new NexOfficePlatformBridgeClient(base,internalKey,5000);
const assert=(value,message)=>{if(!value)throw new Error(`ASSERT: ${message}`)};
const now=new Date();
const periodEnd=now.toISOString();
const periodStart=new Date(now.getTime()-86_400_000).toISOString();

const health=await bridge.health();
assert(health.status==='ok'&&health.service==='nexoffice-platform','SDK reaches platform health');
assert(health.externalEffects===false,'platform bridge does not enable external effects');

const nexjud=await bridge.provisionNexJud({
  externalWorkspaceRef:'sdk-nexjud-office-001',businessName:'NexJud SDK Smoke',ownerEmail:'sdk-nexjud@nexoffice.test',ownerName:'NexJud SDK Owner',externalUserSubject:'sdk-nexjud-user-001',entitlements:['addon.nexjud']
});
assert(nexjud.workspace.vertical==='legal','NexJud helper forces legal vertical');
assert(nexjud.origin.source_product==='nexjud','NexJud helper forces source product');
const nexjudSession=await bridge.exchangeNexJudSession({externalWorkspaceRef:'sdk-nexjud-office-001',externalUserSubject:'sdk-nexjud-user-001',email:'sdk-nexjud@nexoffice.test'});
assert(nexjudSession.workspace.id===nexjud.workspace.id&&nexjudSession.workspace.role==='owner','NexJud helper exchanges correct federated session');
const legalSignal=await bridge.pushLegalSignal({externalWorkspaceRef:'sdk-nexjud-office-001',correlationId:'sdk-legal-0001',periodStart,periodEnd,dimensions:{window:'day',scope:'workspace'},signalType:'deadlines.summary',metrics:{dueToday:2,due7Days:5,overdue:1,completed:7}});
assert(legalSignal.ok&&legalSignal.privacy==='aggregate_only','NexJud operational signal remains aggregate-only');
assert(legalSignal.signal.source_product==='nexjud','NexJud signal source is injected by SDK');

const mydatamed=await bridge.provisionMyDataMed({
  externalWorkspaceRef:'sdk-mydatamed-clinic-001',businessName:'MyDataMed SDK Smoke',ownerEmail:'sdk-mydatamed@nexoffice.test',ownerName:'MyDataMed SDK Owner',externalUserSubject:'sdk-mydatamed-user-001',entitlements:['addon.mydatamed']
});
assert(mydatamed.workspace.vertical==='health','MyDataMed helper forces health vertical');
assert(mydatamed.origin.source_product==='mydatamed','MyDataMed helper forces source product');
const mydatamedSession=await bridge.exchangeMyDataMedSession({externalWorkspaceRef:'sdk-mydatamed-clinic-001',externalUserSubject:'sdk-mydatamed-user-001',email:'sdk-mydatamed@nexoffice.test'});
assert(mydatamedSession.workspace.id===mydatamed.workspace.id,'MyDataMed helper exchanges correct federated session');
const healthSignal=await bridge.pushHealthSignal({sourceProduct:'mydatamed',externalWorkspaceRef:'sdk-mydatamed-clinic-001',correlationId:'sdk-health-0001',periodStart,periodEnd,dimensions:{window:'day',scope:'team'},signalType:'requests.summary',metrics:{open:4,overdue:1,escalated:1,resolved:9}});
assert(healthSignal.ok&&healthSignal.privacy==='aggregate_only','MyDataMed operational signal remains aggregate-only');
assert(healthSignal.signal.source_product==='mydatamed','MyDataMed source is preserved by SDK');

const sindcopilot=await bridge.provisionSindCopilot({
  externalWorkspaceRef:'sdk-sindcopilot-manager-001',businessName:'SindCopilot SDK Smoke',ownerEmail:'sdk-sindcopilot@nexoffice.test',ownerName:'SindCopilot SDK Owner',externalUserSubject:'sdk-sindcopilot-user-001',entitlements:['addon.sindcopilot']
});
assert(sindcopilot.workspace.vertical==='condo','SindCopilot helper forces condo vertical');
assert(sindcopilot.origin.source_product==='sindcopilot','SindCopilot helper forces source product');
const sindSession=await bridge.exchangeSindCopilotSession({externalWorkspaceRef:'sdk-sindcopilot-manager-001',externalUserSubject:'sdk-sindcopilot-user-001',email:'sdk-sindcopilot@nexoffice.test'});
assert(sindSession.workspace.id===sindcopilot.workspace.id,'SindCopilot helper exchanges correct federated session');
const condoSignal=await bridge.pushCondoSignal({externalWorkspaceRef:'sdk-sindcopilot-manager-001',correlationId:'sdk-condo-0001',periodStart,periodEnd,dimensions:{window:'day',scope:'workspace'},signalType:'compliance.summary',metrics:{pending:3,upcoming:4,overdue:1,completed:8,alertsFailed:0}});
assert(condoSignal.ok&&condoSignal.privacy==='aggregate_only','SindCopilot operational signal remains aggregate-only');
assert(condoSignal.signal.source_product==='sindcopilot','SindCopilot signal source is injected by SDK');

console.log(JSON.stringify({ok:true,externalEffects:false,contracts:{nexjud:{workspace:nexjud.workspace.id,signal:legalSignal.signal.signal_type},mydatamed:{workspace:mydatamed.workspace.id,signal:healthSignal.signal.signal_type},sindcopilot:{workspace:sindcopilot.workspace.id,signal:condoSignal.signal.signal_type}},privacy:'aggregate_only'},null,2));
