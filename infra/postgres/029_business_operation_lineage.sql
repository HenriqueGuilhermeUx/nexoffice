-- NexOffice business operation lineage.
-- Links specialist work, DocWallet, TaxAgent, finance and communication without
-- duplicating provider-owned documents or external secrets.

create table if not exists business_operations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  contact_id uuid references crm_contacts(id) on delete set null,
  deal_id uuid references crm_deals(id) on delete set null,
  provider_request_id uuid references provider_requests(id) on delete set null,
  document_ref_id uuid references document_refs(id) on delete set null,
  invoice_action_id uuid references command_actions(id) on delete set null,
  ledger_entry_id uuid references ledger_entries(id) on delete set null,
  title text not null,
  description text not null,
  amount_minor bigint not null check(amount_minor >= 0),
  currency char(3) not null default 'BRL',
  due_at timestamptz,
  status text not null default 'draft' check(status in ('draft','contract_ready','invoice_pending','invoice_queued','invoice_authorized','collection_ready','communication_pending','paid','closed','cancelled','attention')),
  fiscal_provider text not null default 'taxagent',
  fiscal_external_ref text,
  fiscal_status text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists business_operations_workspace_idx on business_operations(workspace_id,status,updated_at desc);
create index if not exists business_operations_contact_idx on business_operations(workspace_id,contact_id,updated_at desc);
create unique index if not exists business_operations_fiscal_ref_idx on business_operations(workspace_id,fiscal_provider,fiscal_external_ref) where fiscal_external_ref is not null;

comment on table business_operations is 'Lineage from CRM/deal through DocWallet contract, TaxAgent invoice, NexOffice receivable and approved communication.';
comment on column business_operations.document_ref_id is 'Reference only. Raw contract remains in DocWallet.';
comment on column business_operations.fiscal_external_ref is 'TaxAgent invoice operation ID/reference. Fiscal source of truth remains TaxAgent.';
