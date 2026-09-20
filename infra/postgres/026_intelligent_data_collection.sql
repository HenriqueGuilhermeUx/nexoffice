-- NexOffice Coleta Inteligente de Dados v1.
-- Mede cobertura, frescor, automação e profundidade histórica por empresa.
-- Não cria decisão de crédito e não habilita nenhuma ação financeira externa.

create table if not exists intelligence_data_coverage_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  run_date date not null default current_date,
  coverage_pct int not null default 0 check(coverage_pct between 0 and 100),
  freshness_pct int not null default 0 check(freshness_pct between 0 and 100),
  automatic_pct int not null default 0 check(automatic_pct between 0 and 100),
  required_metrics int not null default 0 check(required_metrics >= 0),
  available_metrics int not null default 0 check(available_metrics >= 0),
  automatic_metrics int not null default 0 check(automatic_metrics >= 0),
  stale_metrics int not null default 0 check(stale_metrics >= 0),
  history_days int not null default 0 check(history_days >= 0),
  status text not null default 'forming' check(status in ('forming','usable','strong')),
  requirements jsonb not null default '[]'::jsonb,
  metric_status jsonb not null default '[]'::jsonb,
  gaps jsonb not null default '[]'::jsonb,
  sources jsonb not null default '[]'::jsonb,
  model_version text not null default 'data-coverage-v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,run_date,model_version)
);
create index if not exists intelligence_data_coverage_workspace_idx on intelligence_data_coverage_snapshots(workspace_id,run_date desc);
create index if not exists intelligence_data_coverage_status_idx on intelligence_data_coverage_snapshots(status,run_date desc,coverage_pct desc);

-- A nova camada deve rodar ao menos uma vez para cada empresa já existente após o deploy.
update intelligence_learning_daily_state
set run_date=null,status='idle',started_at=null,completed_at=null,updated_at=now()
where id='global';
