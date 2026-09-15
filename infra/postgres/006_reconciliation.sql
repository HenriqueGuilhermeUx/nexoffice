-- NexOffice ERP Lite: imported bank/payment transactions and reconciliation.

create table if not exists bank_transactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  account_id uuid not null references finance_accounts(id) on delete cascade,
  provider text not null default 'manual',
  external_ref text,
  occurred_at timestamptz not null,
  direction ledger_direction not null,
  amount_minor bigint not null check(amount_minor >= 0),
  currency char(3) not null default 'BRL',
  description text not null,
  counterparty text,
  document_number text,
  status text not null default 'unmatched' check(status in ('unmatched','matched','ignored')),
  raw_metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bank_transactions_unmatched_idx on bank_transactions(workspace_id,account_id,status,occurred_at desc);
create unique index if not exists bank_transactions_external_unique_idx on bank_transactions(workspace_id,account_id,provider,external_ref) where external_ref is not null;

create table if not exists reconciliation_matches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  bank_transaction_id uuid not null references bank_transactions(id) on delete cascade,
  ledger_entry_id uuid not null references ledger_entries(id) on delete cascade,
  match_type text not null default 'manual' check(match_type in ('manual','suggested','automatic')),
  confidence numeric(5,4),
  matched_by uuid references users(id) on delete set null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique(workspace_id,bank_transaction_id)
);
create index if not exists reconciliation_ledger_idx on reconciliation_matches(workspace_id,ledger_entry_id);
