-- NexOffice financial intelligence: company-level financial memory, signals, recommendations and outcomes.
-- Raw data remains tenant-isolated; these tables store only derived workspace-level intelligence.

create table if not exists finance_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  as_of timestamptz not null default now(),
  window_days int not null default 90 check(window_days between 7 and 365),
  metrics jsonb not null default '{}'::jsonb,
  sources jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists finance_snapshots_workspace_idx on finance_snapshots(workspace_id,as_of desc);

create table if not exists finance_signals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  snapshot_id uuid not null references finance_snapshots(id) on delete cascade,
  code text not null,
  level text not null default 'info' check(level in ('info','attention','critical')),
  title text not null,
  message text not null,
  evidence jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique(workspace_id,snapshot_id,code)
);
create index if not exists finance_signals_workspace_idx on finance_signals(workspace_id,active,created_at desc);

create table if not exists finance_recommendations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  snapshot_id uuid not null references finance_snapshots(id) on delete cascade,
  signal_id uuid references finance_signals(id) on delete set null,
  code text not null,
  priority text not null default 'normal' check(priority in ('low','normal','high','urgent')),
  title text not null,
  message text not null,
  rationale jsonb not null default '{}'::jsonb,
  options jsonb not null default '[]'::jsonb,
  status text not null default 'open' check(status in ('open','accepted','dismissed','completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,snapshot_id,code)
);
create index if not exists finance_recommendations_workspace_idx on finance_recommendations(workspace_id,status,created_at desc);

create table if not exists finance_decisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  recommendation_id uuid references finance_recommendations(id) on delete set null,
  title text not null,
  decision text not null,
  expected jsonb not null default '{}'::jsonb,
  outcome jsonb not null default '{}'::jsonb,
  decided_at timestamptz not null default now(),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists finance_decisions_workspace_idx on finance_decisions(workspace_id,decided_at desc);
