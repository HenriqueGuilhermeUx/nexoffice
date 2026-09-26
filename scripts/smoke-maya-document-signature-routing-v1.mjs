import fs from 'node:fs';
import assert from 'node:assert/strict';

const src=fs.readFileSync('apps/api/src/routes-assistant.ts','utf8');

assert.ok(src.includes("Quero assinar um contrato com certificado digital ICP-Brasil"),'signature discovery prompt missing');
assert.ok(src.includes('const signatureIntent=detectSignatureIntent(text);'),'signature intent must run before generic document routing');
assert.ok(src.indexOf('const signatureIntent=detectSignatureIntent(text);')<src.indexOf("if(vertical==='legal'"),'signature intent must be evaluated early');
assert.ok(src.includes("mode:signatureIntent.mode"),'requested mode must be explicit');
assert.ok(src.includes('humanConfirmationRequired:true'),'human confirmation contract missing');
assert.ok(src.includes('externalEffect:false'),'Maya signature intent must have no external effect');
assert.ok(src.includes('requestCreated:false'),'Maya must not create signature request');
assert.ok(src.includes('allowanceConsumed:false'),'Maya must not consume monthly allowance');
assert.ok(src.includes('providerCalled:false'),'Maya must not call DocWallet/Lacuna provider');
assert.ok(src.includes('documentAutoSelected:false'),'Maya must not auto-select a document');
assert.ok(src.includes("actions.push({label:'Abrir Documentos e confirmar',target:'documents'})"),'Maya must route to Documents for final confirmation');
assert.ok(src.includes("const icp=match(text,['icp-brasil','icp brasil','certificado digital','certificacao digital','a1','a3','pades'])"),'ICP-Brasil language detection missing');
assert.ok(src.includes("if(!(action&&(documentContext||icp||electronic)))return null"),'bare ICP must not trigger signature intent without signature action context');
assert.ok(src.includes("return{mode:icp?'icp_brasil':'electronic'}"),'electronic/ICP mode selection missing');
assert.ok(!src.includes("/v1/documents/signatures/")&&!src.includes("/api/internal/nexoffice/signatures/"),'assistant route must not invoke signature action endpoints');
assert.ok(!src.includes('DOCWALLET_SERVICE_KEY')&&!src.includes('ICP_SIGNATURE_API_KEY'),'assistant must not access signature provider credentials');

console.log(JSON.stringify({ok:true,module:'Maya Document Signature Routing V1',prepareOnly:true,humanConfirmationRequired:true,requestCreated:false,allowanceConsumed:false,providerCalled:false,modes:['electronic','icp_brasil']}));
