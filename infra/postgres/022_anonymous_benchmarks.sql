-- NexOffice · referências anônimas por setor.
-- Nenhum dado individual de empresa é persistido nesta camada.

create table if not exists intelligence_benchmark_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date not null default current_date,
  cohort_key text not null,
  cohort_level text not null check(cohort_level in ('sector','sector_model','sector_model_size')),
  sector text not null,
  revenue_model text,
  size_band text,
  metric_key text not null,
  sample_size int not null check(sample_size >= 10),
  p25 numeric not null,
  median numeric not null,
  p75 numeric not null,
  mean numeric not null,
  privacy_minimum int not null default 10 check(privacy_minimum >= 10),
  model_version text not null default 'anonymous-benchmark-v1',
  created_at timestamptz not null default now(),
  unique(snapshot_date,cohort_key,metric_key)
);
create index if not exists intelligence_benchmark_lookup_idx on intelligence_benchmark_snapshots(snapshot_date desc,cohort_key,metric_key);
create index if not exists intelligence_benchmark_sector_idx on intelligence_benchmark_snapshots(snapshot_date desc,sector,cohort_level);

create table if not exists intelligence_benchmark_runs (
  id uuid primary key default gen_random_uuid(),
  run_date date not null default current_date,
  status text not null default 'running' check(status in ('running','completed','failed')),
  eligible_workspaces int not null default 0,
  cohorts_created int not null default 0,
  metric_rows_created int not null default 0,
  summary jsonb not null default '{}'::jsonb,
  last_error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists intelligence_benchmark_runs_date_idx on intelligence_benchmark_runs(run_date desc,started_at desc);
