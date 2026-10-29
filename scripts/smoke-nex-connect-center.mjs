import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=p=>fs.readFileSync(p,'utf8');
const component=read('apps/web/src/NexConnectCenter.tsx');
const app=read('apps/web/src/App.tsx');
const css=read('apps/web/src/styles.css');

for(const phrase of [
  'NEX CONNECT CENTER',
  'Conecte o que sua empresa já usa. A Nex dá sentido ao conjunto.',
  'JÁ ALIMENTA A NEX',
  'ALTERNATIVE VENTURES',
  'O CLIENTE JÁ USA',
  'PRÓXIMAS CONEXÕES',
  'Sem migração obrigatória',
  'Diagnóstico read-only',
  'Evidência antes de causalidade'
])assert.ok(component.includes(phrase),`missing Nex Connect contract: ${phrase}`);

assert.ok(component.includes("api<Registry>('/v1/business-graph/sources')"),'Connect Center must use Business Graph source registry');
assert.ok(component.includes("api<Diagnosis>('/v1/onboarding/business/diagnosis')"),'Connect Center must use Business Discovery diagnosis');
assert.ok(component.includes('button disabled'),'planned connectors must not pretend to execute');
assert.ok(!component.includes('SERVICE_KEY'),'frontend must never expose service keys');
assert.ok(!component.includes('SECRET_PASSWORD'),'frontend must never expose provider secrets');
assert.ok(component.includes("post<any>('/v1/connect/spreadsheet/preview'"),'spreadsheet preview must be explicit');
assert.ok(component.includes("post<any>('/v1/connect/spreadsheet/import'"),'spreadsheet import must be explicit');
assert.ok(component.includes('humanConfirmed:true'),'spreadsheet import must require explicit human confirmation');
const postTargets=[...component.matchAll(/post<any>\('([^']+)'/g)].map(match=>match[1]);
assert.deepEqual([...new Set(postTargets)].sort(),['/v1/connect/erp/import','/v1/connect/erp/preview','/v1/connect/google/disconnect','/v1/connect/google/start','/v1/connect/google/sync','/v1/connect/microsoft/disconnect','/v1/connect/microsoft/start','/v1/connect/microsoft/sync','/v1/connect/spreadsheet/import','/v1/connect/spreadsheet/preview'],'Nex Connect Center write calls must stay inside explicit connector actions');
assert.ok(app.includes("['integrations','Nex Connect','⇄']"),'navigation must expose Nex Connect');
assert.ok(app.includes("<NexConnectCenter workspaceId={activeWorkspace?.id||''} current={integrations}/>"),'Nex Connect Center must replace legacy integration view');
assert.ok(css.includes('.connectCenter'),'Nex Connect Center styles missing');
assert.ok(css.includes('.connectRecommendationGrid'),'recommended connection styles missing');
assert.ok(component.includes("api<GoogleStatus>('/v1/connect/google/status')"),'Google connector status must be read from backend');
assert.ok(component.includes('Gmail sem corpo/anexos'),'Google Gmail UX must disclose metadata-only mode');
assert.ok(component.includes('Agenda sem escrita'),'Google Calendar UX must disclose read-only mode');
assert.ok(component.includes('Tokens criptografados'),'Google connector must disclose encrypted token handling');
assert.ok(component.includes("api<MicrosoftStatus>('/v1/connect/microsoft/status')"),'Microsoft connector status must be read from backend');
assert.ok(component.includes('Microsoft 365'),'Microsoft 365 connector must be visible');
assert.ok(component.includes('Mail.ReadBasic'),'Microsoft mail scope must be visible');
assert.ok(component.includes('Calendars.ReadBasic'),'Microsoft calendar scope must be visible');
assert.ok(component.includes('Outlook sem corpo/preview/anexos'),'Microsoft mail minimization must be disclosed');
assert.ok(component.includes('ERP / CONTÁBIL UNIVERSAL'),'ERP universal import must be visible');
assert.ok(component.includes("post<any>('/v1/connect/erp/preview'"),'ERP import must preview before persistence');
assert.ok(component.includes("post<any>('/v1/connect/erp/import'"),'ERP import must require explicit import action');
assert.ok(component.includes('Arquivo e linha bruta não armazenados'),'ERP minimization must be disclosed');
assert.ok(component.includes('Sem ação financeira externa'),'ERP import must disclose no financial external action');
assert.ok(css.includes('.connectErpControls'),'ERP connector styles missing');

assert.ok(component.includes('IMPORTAÇÃO MANUAL · E-MAIL + AGENDA'),'manual Workspace Context section must be visible');
assert.ok(component.includes("previewWorkspaceContext(file,'email')"),'manual email import must preview EML before persistence');
assert.ok(component.includes("previewWorkspaceContext(file,'calendar')"),'manual calendar import must preview ICS before persistence');
assert.ok(component.includes('`/v1/connect/${kind}/preview`'),'manual context must call preview endpoint first');
assert.ok(component.includes('`/v1/connect/${contextKind}/import`'),'manual context import must be explicit');
assert.ok(component.includes('humanConfirmed:true'),'all manual context imports must require explicit confirmation');
assert.ok(component.includes('Arquivo bruto não armazenado'),'manual context UX must disclose raw-file minimization');
assert.ok(component.includes('Sem efeito externo'),'manual context UX must disclose no external effects');
assert.ok(css.includes('.connectManualGrid'),'manual Workspace Context styles missing');


console.log(JSON.stringify({
  ok:true,
  module:'Nex Connect Center V1',
  sourceRegistry:true,
  businessDiscoveryDiagnosis:true,
  googleWorkspaceReadOnly:true,
  manualEmailCalendarFallback:true,
  previewReadOnly:true,
  importHumanConfirmed:true,
  externalEffects:false,
  secretExposure:false
},null,2));
