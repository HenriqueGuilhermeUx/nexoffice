import fs from 'node:fs';
import assert from 'node:assert/strict';

const consoleSrc=fs.readFileSync('apps/web/src/DigitalTeamConsole.tsx','utf8');
const navSrc=fs.readFileSync('apps/web/src/AssistantNavigationBridge.tsx','utf8');
const docsSrc=fs.readFileSync('apps/web/src/DocumentWorkspaceCenter.tsx','utf8');
const mainSrc=fs.readFileSync('apps/web/src/main.tsx','utf8');

assert.ok(consoleSrc.includes("sessionStorage.setItem('nexoffice.document.signatureIntent'"),'Maya must persist one-shot document handoff');
assert.ok(consoleSrc.includes("suggestedDocumentId:only?.id||null"),'single candidate suggestion missing');
assert.ok(consoleSrc.includes("humanConfirmationRequired:true"),'handoff must preserve human confirmation');
assert.ok(consoleSrc.includes("externalEffect:false"),'handoff itself must have no external effect');
assert.ok(consoleSrc.includes("window.dispatchEvent(new CustomEvent('nexoffice:navigate'"),'assistant navigation event missing');
assert.ok(!consoleSrc.includes('/v1/documents/')&&!consoleSrc.includes('/api/internal/nexoffice/signatures/'),'DigitalTeamConsole must not invoke signature endpoints');

assert.ok(navSrc.includes("window.addEventListener('nexoffice:navigate'"),'safe navigation listener missing');
assert.ok(navSrc.includes("button?.click()"),'navigation bridge must only activate existing internal nav');
assert.ok(!navSrc.includes('fetch(')&&!navSrc.includes('post('),'navigation bridge must have no API side effect');
assert.ok(mainSrc.includes('<AssistantNavigationBridge/>'),'navigation bridge must be mounted');

assert.ok(docsSrc.includes("const handoffKey='nexoffice.document.signatureIntent'"),'Documents handoff key mismatch');
assert.ok(docsSrc.includes("setSelectedMode(parsed.mode)"),'requested signature mode must be preselected');
assert.ok(docsSrc.includes("A Maya encontrou")&&docsSrc.includes("ainda não foi selecionado nem enviado"),'single-document suggestion must remain suggestion only');
assert.ok(docsSrc.includes('Revisar documento sugerido'),'explicit user click for suggested document missing');
assert.ok(docsSrc.includes('Nenhuma solicitação foi criada e nenhuma unidade da franquia foi consumida.'),'no-effect copy missing');
assert.ok(docsSrc.includes("onClick={()=>beginSignature(suggestedDoc,handoff.mode)}"),'suggested document must require explicit click');
assert.ok(!docsSrc.includes('autoSubmit')&&!docsSrc.includes('autoSend'),'Documents must not auto-submit handoff');

console.log(JSON.stringify({ok:true,module:'Maya Document Handoff V1',modePreselected:true,singleCandidateSuggested:true,documentAutoSelected:false,requestCreated:false,allowanceConsumed:false,providerCalled:false,humanConfirmationRequired:true}));
