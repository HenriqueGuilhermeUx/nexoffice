-- NexOffice Inteligência do Negócio · ciclo fechado de aprendizado.
-- Separa a precisão do sinal do efeito da ação e mantém qualquer ajuste de regra sob aprovação administrativa.

alter table intelligence_actions add column if not exists rule_id uuid references intelligence_rules(id) on delete set null;
alter table intelligence_actions add column if not exists baseline_snapshot_id uuid references intelligence_snapshots(id) on delete set null;
alter table intelligence_actions add column if not exists metric_key text;
alter table intelligence_actions add column if not exists baseline_value numeric;
alter table intelligence_actions add column if not exists desired_direction text;
alter table intelligence_actions add column if not exists evaluation_due_at timestamptz;
alter table intelligence_actions add column if not exists evaluated_at timestamptz;
alter table intelligence_actions add column if not exists evaluation_status text;
alter table intelligence_actions add column if not exists observed_value numeric;
alter table intelligence_actions add column if not exists effect_delta numeric;
alter table intelligence_actions add column if not exists effect_pct numeric;
alter table intelligence_actions add column if not exists effect_summary text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='intelligence_actions_direction_check') then
    alter table intelligence_actions add constraint intelligence_actions_direction_check check(desired_direction is null or desired_direction in ('up','down'));
  end if;
  if not exists (select 1 from pg_constraint where conname='intelligence_actions_evaluation_check') then
    alter table intelligence_actions add constraint intelligence_actions_evaluation_check check(evaluation_status is null or evaluation_status in ('waiting','improved','stable','worsened','insufficient_data'));
  end if;
end $$;

create index if not exists intelligence_actions_evaluation_idx on intelligence_actions(status,evaluation_due_at,evaluated_at);
create index if not exists intelligence_actions_rule_idx on intelligence_actions(rule_id,created_at desc) where rule_id is not null;

create table if not exists intelligence_rule_suggestions (
  id uuid primary key default gen_random_uuid(),
  source_rule_id uuid not null references intelligence_rules(id) on delete cascade,
  rule_code text not null,
  rule_version int not null,
  suggestion_type text not null check(suggestion_type in ('increase_weight','decrease_weight','review_recommendation')),
  sample_size int not null default 0 check(sample_size>=0),
  confidence numeric(5,4) not null default 0 check(confidence between 0 and 1),
  evidence jsonb not null default '{}'::jsonb,
  current_config jsonb not null default '{}'::jsonb,
  suggested_config jsonb not null default '{}'::jsonb,
  rationale text not null,
  status text not null default 'pending' check(status in ('pending','applied','dismissed','stale')),
  reviewed_at timestamptz,
  reviewed_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists intelligence_rule_suggestions_status_idx on intelligence_rule_suggestions(status,created_at desc);
create unique index if not exists intelligence_rule_suggestions_pending_unique_idx on intelligence_rule_suggestions(source_rule_id,suggestion_type) where status='pending';
