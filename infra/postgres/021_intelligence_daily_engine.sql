-- NexOffice Intelligence v5: execução diária independente do login.
-- Mantém apenas estado operacional do sweep global; regras continuam versionadas e aprovação continua manual.

create table if not exists intelligence_learning_daily_state (
  id text primary key,
  run_date date,
  status text not null default 'idle' check(status in ('idle','running','completed','failed')),
  started_at timestamptz,
  completed_at timestamptz,
  last_summary jsonb not null default '{}'::jsonb,
  last_error text,
  updated_at timestamptz not null default now()
);

insert into intelligence_learning_daily_state(id,status)
values('global','idle')
on conflict(id) do nothing;
