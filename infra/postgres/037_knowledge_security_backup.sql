-- Knowledge & Security V1: customer-owned Restic backup orchestration.
-- NexOffice stores operational status only. Repository credentials/passwords and
-- backup bytes remain on the customer's agent/storage.

create table if not exists backup_agents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  token_hash text not null unique,
  status text not null default 'active' check(status in ('active','revoked')),
  hostname text,
  platform text,
  restic_version text,
  capabilities jsonb not null default '{}',
  last_seen_at timestamptz,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists backup_agents_workspace_idx on backup_agents(workspace_id,status,last_seen_at desc);

create table if not exists backup_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  agent_id uuid references backup_agents(id) on delete set null,
  name text not null default 'Backup principal',
  status text not null default 'setup' check(status in ('setup','active','paused','attention')),
  source_labels text[] not null default '{}',
  target_kind text not null default 'customer_owned' check(target_kind in ('customer_owned')),
  target_label text,
  schedule_label text not null default 'Diário',
  retention_label text,
  last_snapshot_id text,
  last_backup_at timestamptz,
  last_verified_at timestamptz,
  verification_status text check(verification_status in ('ok','warning','failed') or verification_status is null),
  metadata jsonb not null default '{}',
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists backup_profiles_workspace_idx on backup_profiles(workspace_id,status,updated_at desc);

create table if not exists backup_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  agent_id uuid references backup_agents(id) on delete set null,
  profile_id uuid references backup_profiles(id) on delete set null,
  run_ref text not null,
  status text not null check(status in ('started','success','failed')),
  snapshot_id text,
  files_new bigint,
  files_changed bigint,
  files_unmodified bigint,
  bytes_added bigint,
  verification_status text check(verification_status in ('ok','warning','failed') or verification_status is null),
  error_summary text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique(agent_id,run_ref)
);
create index if not exists backup_runs_workspace_idx on backup_runs(workspace_id,created_at desc);

comment on table backup_agents is 'Local/customer-controlled Restic agents. Only a hash of the NexOffice reporting token is stored.';
comment on table backup_profiles is 'Backup status/config labels only. Restic repository URLs, passwords and cloud credentials must remain on the customer agent.';
comment on table backup_runs is 'Metadata-only backup run ledger. NexOffice never receives backup file contents.';
