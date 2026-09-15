-- NexOffice platform foundation: identity federation, entitlements, reliability and audit.

create table if not exists external_identities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid,
  provider text not null,
  external_subject text not null,
  external_tenant_ref text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, external_subject, workspace_id)
);
create index if not exists external_identities_lookup_idx on external_identities(provider,external_subject);

create table if not exists workspace_origins (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  source_product text not null,
  external_workspace_ref text,
  mode text not null default 'standalone' check(mode in ('standalone','addon','platform')),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique(workspace_id,source_product)
);

create table if not exists entitlements (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  capability text not null,
  status text not null default 'active' check(status in ('active','trial','paused','expired','cancelled')),
  source text not null default 'nexoffice',
  limit_value numeric,
  limit_unit text,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  metadata jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  unique(workspace_id,capability,source)
);

create table if not exists webhook_receipts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  provider text not null,
  external_event_id text not null,
  event_type text,
  payload_hash text,
  status text not null default 'received',
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique(provider,external_event_id)
);
create index if not exists webhook_receipts_status_idx on webhook_receipts(status,received_at);

create table if not exists outbox_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  topic text not null,
  payload jsonb not null default '{}',
  status text not null default 'pending' check(status in ('pending','processing','sent','failed','dead')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists outbox_pending_idx on outbox_messages(status,next_attempt_at);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  actor_type text not null,
  actor_ref text,
  action text not null,
  subject_type text,
  subject_id text,
  before_state jsonb,
  after_state jsonb,
  correlation_id text,
  metadata jsonb not null default '{}',
  occurred_at timestamptz not null default now()
);
create index if not exists audit_log_workspace_idx on audit_log(workspace_id,occurred_at desc);
create index if not exists audit_log_subject_idx on audit_log(workspace_id,subject_type,subject_id,occurred_at desc);

comment on table workspace_origins is 'Tracks whether a workspace entered NexOffice standalone or through another AV product.';
comment on table entitlements is 'Capability access independent from billing provider; supports standalone and AV add-on plans.';
comment on table webhook_receipts is 'Idempotency ledger for external provider callbacks.';
comment on table outbox_messages is 'Reliable delivery queue for events/actions that must leave NexOffice.';
comment on table audit_log is 'Immutable operational trail for human, agent and integration actions.';
