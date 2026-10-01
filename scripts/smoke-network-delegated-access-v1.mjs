import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const must=(value,label)=>{if(!value)throw new Error(`Delegated access contract failed: ${label}`)};
const has=(text,value,label)=>must(text.includes(value),label||`missing ${value}`);
const lacks=(text,value,label)=>must(!text.includes(value),label||`unexpected ${value}`);

const migration=read('infra/postgres/034_provider_delegated_access.sql');
const routes=read('apps/api/src/routes-network-delegations.ts');
const standalone=read('apps/api/src/routes-standalone.ts');
const ui=read('apps/web/src/NetworkCenter.tsx');
const css=read('apps/web/src/network-center.css');

has(migration,'provider_delegations','delegation table');
has(migration,'request_id uuid not null unique','one delegation contract per provider request');
has(migration,"status text not null default 'active' check(status in ('active','revoked'))",'revocable lifecycle');
has(migration,'expires_at timestamptz not null','mandatory expiration');
for(const scope of ['contact_read','deal_read','operation_read','document_status_read','fiscal_status_read','finance_status_read'])has(migration,scope,`allowed scope ${scope}`);
lacks(migration,'workspace_members(','delegation must not create workspace membership');
lacks(migration,'write','V1 scope list must remain read-only');

has(routes,"r.status in ('accepted','in_progress')",'provider context only during active work');
has(routes,"d.expires_at>now()",'expired delegation rejected');
has(routes,"d.status='active'",'revoked delegation rejected');
has(routes,"requester_workspace_id=$2",'only requester can grant/revoke its delegation');
has(routes,"provider_workspace_id=$2",'only assigned provider workspace can read delegated context');
has(routes,'broadWorkspaceMembershipGranted:false','grant response denies broad membership');
has(routes,'broadWorkspaceAccess:false','context response denies broad workspace access');
has(routes,'pixSecretExposed:false','Pix secret privacy contract');
has(routes,'rawDocumentContentExposed:false','raw document privacy contract');
has(routes,'fiscalPayloadExposed:false','raw fiscal payload privacy contract');
has(routes,"'network.delegation.context_read'",'every delegated context read is audited in client workspace');
has(routes,"select id,name,email,phone,company_name from crm_contacts",'contact scope is field-minimized');
lacks(routes,'document_number','delegated contact must not expose CPF/CNPJ');
lacks(routes,'pix_key','delegated context must never touch Pix secret');
lacks(routes,'external_ref,title,status,document_type,signature_status','document query must not expose provider external reference');
lacks(routes,'value_minor','delegated deal context must not expose deal value');
lacks(routes,'fiscal_external_ref','delegated fiscal context must not expose TaxAgent reference');
lacks(routes,'clientWorkspaceId,context','response must not expose client workspace id alongside context');

const contextBlock=routes.slice(routes.indexOf("app.get('/v1/network/delegations/:id/context'"));
lacks(contextBlock,'update crm_contacts','delegated read route cannot mutate CRM contacts');
lacks(contextBlock,'update crm_deals','delegated read route cannot mutate deals');
lacks(contextBlock,'update business_operations','delegated read route cannot mutate operations');
lacks(contextBlock,'update ledger_entries','delegated read route cannot mutate finance');
lacks(contextBlock,'update document_refs','delegated read route cannot mutate documents');

has(standalone,'registerNetworkDelegationRoutes(app)','delegation routes registered');
has(ui,"type Tab='discover'|'work'|'provider'|'pix'",'Network work tab');
has(ui,'Trabalhos','work hub visible');
has(ui,'Contexto suficiente para executar. Nada além.','least-privilege UX');
has(ui,'Liberar acesso','explicit client grant action');
has(ui,'Revogar agora','immediate revocation action');
has(ui,'Ver contexto liberado','provider read-only context action');
has(ui,'Registrar outcome','requester outcome action');
has(ui,'Nenhuma membership ampla foi criada.','UI reinforces no broad membership');
has(ui,'Nenhum Pix secreto, conteúdo bruto de contrato ou payload fiscal é exposto.','UI privacy explanation');
has(css,'.delegationBox','delegation UI styled');
has(css,'.delegatedContext','delegated context UI styled');

console.log('NexOffice Network Delegated Access V1 security contract OK');
