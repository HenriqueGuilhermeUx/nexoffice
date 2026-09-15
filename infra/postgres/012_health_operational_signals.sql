-- Privacy-safe operational aggregates for health vertical integrations.
-- This table is intentionally unsuitable for patient-level or clinical payloads.

create table if not exists workspace_operational_signals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  source_product text not null,
  signal_type text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  metrics jsonb not null,
  dimensions jsonb not null default '{}',
  correlation_id text,
  created_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create index if not exists workspace_operational_signals_recent_idx
  on workspace_operational_signals(workspace_id, created_at desc);

create unique index if not exists workspace_operational_signals_idempotency_idx
  on workspace_operational_signals(workspace_id, source_product, correlation_id)
  where correlation_id is not null;

comment on table workspace_operational_signals is
  'Aggregate-only operational signals. API schema forbids patient-level identifiers, clinical text and raw health data.';
