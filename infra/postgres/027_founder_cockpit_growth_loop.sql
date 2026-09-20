-- NexOffice Founder Cockpit + activation analytics + plano inteligente de 7 dias.
-- Fecha a jornada recomendacao -> uso -> primeiro valor e preserva o ciclo sinal -> acao -> resultado.

create table if not exists intelligence_activation_journeys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  recommendation_key text not null,
  target text not null,
  first_shown_at timestamptz,
  last_shown_at timestamptz,
  shown_count int not null default 0 check(shown_count>=0),
  clicked_at timestamptz,
  first_value_at timestamptz,
  status text not null default 'shown' check(status in ('shown','clicked','value')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,recommendation_key)
);
create index if not exists intelligence_activation_journeys_workspace_idx on intelligence_activation_journeys(workspace_id,updated_at desc);
create index if not exists intelligence_activation_journeys_value_idx on intelligence_activation_journeys(first_value_at) where first_value_at is not null;

create table if not exists intelligence_7day_plans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  week_start date not null,
  summary text not null,
  status text not null default 'active' check(status in ('active','completed','archived')),
  model_version text not null default 'seven-day-plan-v1',
  metadata jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,week_start)
);
create index if not exists intelligence_7day_plans_workspace_idx on intelligence_7day_plans(workspace_id,week_start desc);

create table if not exists intelligence_7day_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references intelligence_7day_plans(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  signal_id uuid references intelligence_signals(id) on delete set null,
  task_id uuid references tasks(id) on delete set null,
  source_type text not null,
  source_key text not null,
  title text not null,
  rationale text not null,
  benefit text not null,
  action_target text not null,
  priority int not null default 50 check(priority between 0 and 100),
  status text not null default 'suggested' check(status in ('suggested','tracking','done','cancelled','superseded')),
  due_at timestamptz,
  metric_key text,
  baseline_value numeric,
  metadata jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(plan_id,source_type,source_key)
);
create index if not exists intelligence_7day_plan_items_workspace_idx on intelligence_7day_plan_items(workspace_id,status,priority desc);
create unique index if not exists intelligence_7day_plan_items_task_unique_idx on intelligence_7day_plan_items(task_id) where task_id is not null;

-- A versao entra hoje mesmo no sweep diario, ainda que a rodada anterior ja tenha ocorrido.
update intelligence_learning_daily_state
set run_date=null,status='idle',started_at=null,completed_at=null,updated_at=now()
where id='global';
