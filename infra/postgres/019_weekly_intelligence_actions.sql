-- NexOffice Inteligência do Negócio · camada de utilidade diária.
-- Guarda resumos semanais explicáveis e mede quando uma recomendação vira ação interna.

create table if not exists intelligence_weekly_briefs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  week_start date not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  overall_score int check(overall_score between 0 and 100),
  score_delta int,
  summary text not null,
  wins jsonb not null default '[]'::jsonb,
  attention jsonb not null default '[]'::jsonb,
  priorities jsonb not null default '[]'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  sources jsonb not null default '{}'::jsonb,
  model_version text not null default 'weekly-brief-v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,week_start)
);
create index if not exists intelligence_weekly_briefs_workspace_idx on intelligence_weekly_briefs(workspace_id,week_start desc);

create table if not exists intelligence_actions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  signal_id uuid references intelligence_signals(id) on delete set null,
  weekly_brief_id uuid references intelligence_weekly_briefs(id) on delete set null,
  task_id uuid references tasks(id) on delete set null,
  source_type text not null check(source_type in ('radar','signal','weekly_brief','sector')),
  source_key text,
  title text not null,
  status text not null default 'created' check(status in ('created','done','cancelled')),
  created_by uuid references users(id) on delete set null,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists intelligence_actions_workspace_idx on intelligence_actions(workspace_id,created_at desc);
create index if not exists intelligence_actions_signal_idx on intelligence_actions(signal_id) where signal_id is not null;
create unique index if not exists intelligence_actions_task_unique_idx on intelligence_actions(task_id) where task_id is not null;
