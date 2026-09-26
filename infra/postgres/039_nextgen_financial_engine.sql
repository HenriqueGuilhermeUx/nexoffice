-- NexOffice Financial Engine V1
-- Keeps NexOffice ledger_entries as the accounting/business source of truth.
-- This table stores only provider-operation references and sanitized receipts.

create table if not exists financial_provider_operations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  ledger_entry_id uuid references ledger_entries(id) on delete set null,
  recurring_rule_id uuid references recurring_rules(id) on delete set null,
  command_action_id uuid references command_actions(id) on delete set null,
  approval_id uuid references approval_requests(id) on delete set null,
  operation_type text not null check(operation_type in ('pix_charge','pix_recurring')),
  provider text not null default 'nextgen',
  correlation_id text not null,
  provider_status text not null default 'prepared',
  amount_minor bigint not null check(amount_minor>=0),
  external_ref text,
  receipt jsonb not null default '{}',
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,correlation_id)
);
create index if not exists financial_provider_operations_ledger_idx on financial_provider_operations(workspace_id,ledger_entry_id,created_at desc);
create index if not exists financial_provider_operations_recurring_idx on financial_provider_operations(workspace_id,recurring_rule_id,created_at desc);
create index if not exists financial_provider_operations_status_idx on financial_provider_operations(workspace_id,operation_type,provider_status,updated_at desc);

comment on table financial_provider_operations is 'Sanitized provider-operation state only. NexOffice ledger remains source of truth; provider credentials never persist here.';
comment on column financial_provider_operations.receipt is 'May contain Pix BR Code/payment link/status. Must never contain provider API credentials or unrelated raw provider payload.';

-- Financial external actions always start approval-first. A later product decision may
-- change a workspace policy explicitly, but the default is never automatic.
insert into autonomy_policies(workspace_id,action_type,mode)
select id,'payment.charge.create','approval_required'::autonomy_mode from workspaces
on conflict(workspace_id,action_type) do nothing;
insert into autonomy_policies(workspace_id,action_type,mode)
select id,'payment.recurring.create','approval_required'::autonomy_mode from workspaces
on conflict(workspace_id,action_type) do nothing;
insert into autonomy_policies(workspace_id,action_type,mode)
select id,'payment.recurring.cancel','approval_required'::autonomy_mode from workspaces
on conflict(workspace_id,action_type) do nothing;

create or replace function seed_workspace_financial_engine_policies() returns trigger language plpgsql as $$
begin
  insert into autonomy_policies(workspace_id,action_type,mode) values
    (new.id,'payment.charge.create','approval_required'),
    (new.id,'payment.recurring.create','approval_required'),
    (new.id,'payment.recurring.cancel','approval_required')
  on conflict(workspace_id,action_type) do nothing;
  return new;
end $$;

drop trigger if exists workspaces_seed_financial_engine_policies on workspaces;
create trigger workspaces_seed_financial_engine_policies after insert on workspaces
for each row execute function seed_workspace_financial_engine_policies();
