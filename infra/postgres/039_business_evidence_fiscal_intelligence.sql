-- Business Evidence & Fiscal Intelligence V1.
-- Historical snapshots store only derived metrics/references. Raw documents, OCR,
-- TaxAgent payloads, provider secrets and external document IDs never belong here.

create table if not exists fiscal_closing_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  period date not null,
  completeness integer not null check(completeness between 0 and 100),
  local_metrics jsonb not null default '{}',
  taxagent_metrics jsonb not null default '{}',
  evidence_manifest jsonb not null default '{}',
  methodology text not null,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  check(date_trunc('month',period)::date=period)
);

create index if not exists fiscal_closing_snapshots_workspace_period_idx
  on fiscal_closing_snapshots(workspace_id,period,created_at desc);

comment on table fiscal_closing_snapshots is 'Append-only API history of deterministic operational evidence/fiscal closing metrics. Not a legal/accounting compliance certification.';
comment on column fiscal_closing_snapshots.local_metrics is 'Derived NexOffice counts only; no raw document text, tax IDs, provider refs or secrets.';
comment on column fiscal_closing_snapshots.taxagent_metrics is 'Safe aggregated TaxAgent dossier metrics only; never raw fiscal payloads.';
