-- Explicit DocWallet signature entitlement for NexOffice workspaces.
-- This is intentionally independent from workspaces.plan and billing integrations.

create table if not exists docwallet_signature_entitlements (
  workspace_id uuid primary key references workspaces(id) on delete cascade,
  tier text not null default 'included' check(tier in ('included','signatures_plus')),
  monthly_limit integer not null default 6 check(monthly_limit > 0 and monthly_limit <= 10000),
  source text not null default 'nexoffice_default',
  notes text,
  updated_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists docwallet_signature_usage (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  document_ref_id uuid not null references document_refs(id) on delete cascade,
  business_operation_id uuid references business_operations(id) on delete set null,
  external_signature_request_id text not null,
  status text not null default 'pending' check(status in ('pending','completed','cancelled')),
  period_start date not null,
  requested_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,external_signature_request_id)
);

create index if not exists docwallet_signature_usage_period_idx on docwallet_signature_usage(workspace_id,period_start,created_at desc);
create index if not exists docwallet_signature_usage_document_idx on docwallet_signature_usage(workspace_id,document_ref_id,created_at desc);

comment on table docwallet_signature_entitlements is 'Explicit NexOffice entitlement for DocWallet document-signature requests. Never inferred from generic workspace plan or integration rows.';
comment on table docwallet_signature_usage is 'Monthly usage ledger for documents sent to DocWallet signature. One signature request/document counts as one included usage regardless of number of parties.';
comment on column docwallet_signature_entitlements.tier is 'included = standard NexOffice allowance; signatures_plus = explicit expanded entitlement. This table does not charge or bill customers.';
