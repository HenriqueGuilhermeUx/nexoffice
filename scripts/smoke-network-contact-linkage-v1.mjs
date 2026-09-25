import fs from 'node:fs';

const api=fs.readFileSync('apps/api/src/routes-network-work-execution.ts','utf8');
const ui=fs.readFileSync('apps/web/src/NetworkWorkLineage.tsx','utf8');

const checks=[
  ['contact route exists',api.includes("app.patch('/v1/network/requests/:id/contact'")],
  ['contact route requester scoped',api.includes('requester_workspace_id=$2')],
  ['contact belongs requester workspace',api.includes('crm_contacts where id=$1 and workspace_id=$2')],
  ['operation mismatch blocked',api.includes('operation_contact_mismatch')],
  ['existing operation may inherit contact',api.includes('contact_id=coalesce(contact_id,$3)')],
  ['no provider membership granted',api.includes('workspaceMembershipGranted:false')&&ui.includes('sem acesso amplo ao CRM')],
  ['UI loads CRM contacts',ui.includes("api<Contact[]>('/v1/crm/contacts')")],
  ['UI loads existing operations',ui.includes("api<ExistingOperation[]>('/v1/business-operations')")],
  ['UI links contact',ui.includes("patch(`/v1/network/requests/${request.id}/contact`")],
  ['UI links existing operation',ui.includes("post<{requestContactId?:string|null}>(`/v1/network/requests/${request.id}/link-operation`")],
  ['delegated contact access remains separate',ui.includes('contact_read continua separado')||ui.includes('escopo “Contato”')],
  ['no external action',api.includes('externalEffect:false')&&ui.includes('Nenhuma ação externa foi executada.')],
  ['no Pix in linkage UI',!ui.includes('pixKey')&&!ui.includes('maskedPixKey')],
  ['no provider membership mutation',!api.includes('insert into workspace_members')&&!api.includes('update workspace_members')]
];

let failed=0;
for(const[name,ok]of checks){console.log(`${ok?'✓':'✗'} ${name}`);if(!ok)failed++}
if(failed){console.error(`Network Contact Linkage V1 failed: ${failed} check(s).`);process.exit(1)}
console.log(`Network Contact Linkage V1 success: ${checks.length}/${checks.length} checks.`);
