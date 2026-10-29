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
assert.deepEqual([...new Set(postTargets)].sort(),['/v1/connect/spreadsheet/import','/v1/connect/spreadsheet/preview'],'Nex Connect Center must not introduce other write calls');
assert.ok(app.includes("['integrations','Nex Connect','⇄']"),'navigation must expose Nex Connect');
assert.ok(app.includes("<NexConnectCenter workspaceId={activeWorkspace?.id||''} current={integrations}/>"),'Nex Connect Center must replace legacy integration view');
assert.ok(css.includes('.connectCenter'),'Nex Connect Center styles missing');
assert.ok(css.includes('.connectRecommendationGrid'),'recommended connection styles missing');

console.log(JSON.stringify({
  ok:true,
  module:'Nex Connect Center V1',
  sourceRegistry:true,
  businessDiscoveryDiagnosis:true,
  previewReadOnly:true,
  importHumanConfirmed:true,
  externalEffects:false,
  secretExposure:false
},null,2));
