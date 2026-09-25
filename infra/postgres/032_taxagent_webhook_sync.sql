-- TaxAgent -> NexOffice fiscal status webhook bridge.
-- Webhook secrets are encrypted at application level; raw fiscal documents remain TaxAgent-owned.

create table if not exists taxagent_webhook_receivers (
  id uuid primary key,
  workspace_id uuid not null unique references workspaces(id) on delete cascade,
  provider_endpoint_id text,
  events text[] not null default array['invoice.authorized','invoice.rejected']::text[],
  secret_ciphertext text,
  secret_iv text,
  secret_tag text,
  status text not null default 'pending' check(status in ('pending','active','error','disabled')),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists taxagent_webhook_events (
  event_id text primary key,
  receiver_id uuid not null references taxagent_webhook_receivers(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  event_type text not null,
  invoice_id text not null,
  fiscal_status text,
  processed_at timestamptz not null default now()
);

create index if not exists taxagent_webhook_events_workspace_idx
  on taxagent_webhook_events(workspace_id,processed_at desc);

comment on table taxagent_webhook_receivers is 'Encrypted TaxAgent webhook endpoint secret mapped to one NexOffice workspace.';
comment on table taxagent_webhook_events is 'Idempotency ledger for verified TaxAgent fiscal status callbacks; raw webhook payload is not persisted.';
