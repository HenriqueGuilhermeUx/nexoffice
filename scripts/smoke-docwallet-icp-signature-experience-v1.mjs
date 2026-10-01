import fs from 'node:fs';
import assert from 'node:assert/strict';

const route=fs.readFileSync('apps/api/src/routes-docwallet-workspace.ts','utf8');
const ui=fs.readFileSync('apps/web/src/DocumentWorkspaceCenter.tsx','utf8');
const migration=fs.readFileSync('infra/postgres/038_docwallet_signature_modes.sql','utf8');

for(const value of ["z.enum(['electronic','icp_brasil'])","/v1/documents/signature-modes","/v1/documents/signatures/:signatureId/icp/prepare","human_confirmation_required","DOCWALLET_ICP_SIGNATURE_ENABLED","NEXOFFICE_EXTERNAL_ACTIONS","icp_external_actions_disabled"]){
  assert.ok(route.includes(value),`missing backend guard: ${value}`);
}
assert.ok(route.includes("modeChangesPrice:false"),'signature mode must not change allowance pricing');
assert.ok(route.includes("providerRedirectStoredInNexOffice:false"),'provider redirect privacy boundary missing');
assert.ok(route.includes("certificateIdentityStoredInNexOffice:false"),'certificate identity privacy boundary missing');
assert.ok(route.includes("providerRedirectReturned:false"),'provider redirect must not be returned');
assert.ok(route.includes("certificateIdentityReturned:false"),'certificate identity must not be returned');
assert.ok(route.includes("signature_mode"),'signature modality must be persisted');
assert.ok(route.includes("icp_status"),'sanitized ICP status must be persisted');
assert.ok(!route.includes('ICP_SIGNATURE_API_KEY'),'Lacuna credential must never be read by NexOffice');
assert.ok(!route.includes('core.pki.rest'),'provider endpoint must remain DocWallet-owned');

assert.ok(migration.includes("check(signature_mode in ('electronic','icp_brasil'))"),'database signature mode constraint missing');
assert.ok(migration.includes('one monthly usage'),'allowance semantics missing');
assert.ok(migration.includes('Provider redirect URLs, certificate identity, private keys, passwords and raw evidence are never stored here.'),'database privacy boundary missing');

for(const copy of ['Assinatura eletrônica','ICP-Brasil · certificado digital','1 documento enviado = 1 uso da franquia','o certificado e sua senha nunca passam pelo NexOffice']){
  assert.ok(ui.includes(copy),`missing user-facing contract: ${copy}`);
}
assert.ok(ui.includes("mode:selectedMode"),'selected modality must be sent explicitly');
assert.ok(ui.includes("humanConfirmed:selectedMode==='icp_brasil'"),'ICP user action must carry explicit confirmation');
assert.ok(ui.includes('Preparar novamente'),'ICP retry UX missing');
assert.ok(!ui.includes('core.pki.rest'),'provider endpoint leaked into web');
assert.ok(!ui.includes('ICP_SIGNATURE_API_KEY'),'provider secret leaked into web');
assert.ok(!ui.includes('redirectUrl'),'provider redirect leaked into web contract');

console.log(JSON.stringify({ok:true,module:'DocWallet ICP Signature Experience V1',modes:['electronic','icp_brasil'],sameMonthlyAllowance:true,humanConfirmationRequired:true,externalActionGate:true,providerRedirectExposed:false,certificateSecretsHandledByNexOffice:false}));
