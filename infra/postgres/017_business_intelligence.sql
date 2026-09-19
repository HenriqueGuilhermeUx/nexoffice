-- NexOffice Inteligência do Negócio.
-- Camada aditiva: não substitui CRM, financeiro, agenda ou inteligência financeira.
-- Mantém histórico, origem/qualidade dos dados, índices explicáveis, regras versionadas e resultados observados.

create table if not exists business_profiles (
  workspace_id uuid primary key references workspaces(id) on delete cascade,
  sector text not null default 'general',
  subsector text,
  revenue_model text not null default 'mixed',
  sells_products boolean not null default false,
  sells_services boolean not null default true,
  recurring_revenue boolean not null default false,
  uses_agenda boolean not null default false,
  uses_inventory boolean not null default false,
  uses_contracts boolean not null default false,
  employee_count int check(employee_count is null or employee_count >= 0),
  active_customers_estimate int check(active_customers_estimate is null or active_customers_estimate >= 0),
  primary_sales_channel text,
  seasonality text,
  main_dependency text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  completeness_pct int not null default 0 check(completeness_pct between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists business_profiles_sector_idx on business_profiles(sector,subsector);

create table if not exists intelligence_metrics (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  metric_key text not null,
  value_numeric numeric,
  value_text text,
  unit text,
  source text not null default 'derived' check(source in ('verified_transaction','integrated_system','imported_document','client_reported','derived')),
  source_reference text,
  quality text not null default 'estimated' check(quality in ('verified','high','medium','estimated')),
  confidence numeric(5,4) not null default 0.5000 check(confidence between 0 and 1),
  period_start timestamptz,
  period_end timestamptz,
  observed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists intelligence_metrics_lookup_idx on intelligence_metrics(workspace_id,metric_key,observed_at desc);
create index if not exists intelligence_metrics_sector_time_idx on intelligence_metrics(observed_at desc);

create table if not exists intelligence_rules (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  version int not null default 1 check(version > 0),
  active boolean not null default true,
  sector text not null default 'all',
  subsector text,
  dimension text not null check(dimension in ('finance','sales','customers','operation','resilience')),
  metric_key text not null,
  operator text not null check(operator in ('gt','gte','lt','lte')),
  warning_value numeric,
  critical_value numeric,
  weight numeric(7,4) not null default 1 check(weight >= 0),
  title text not null,
  message_template text not null,
  recommendation text,
  config jsonb not null default '{}'::jsonb,
  created_by text not null default 'system',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(code,version)
);
create index if not exists intelligence_rules_active_idx on intelligence_rules(active,sector,dimension);

create table if not exists intelligence_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  as_of timestamptz not null default now(),
  overall_score int check(overall_score between 0 and 100),
  finance_score int check(finance_score between 0 and 100),
  sales_score int check(sales_score between 0 and 100),
  customer_score int check(customer_score between 0 and 100),
  operation_score int check(operation_score between 0 and 100),
  resilience_score int check(resilience_score between 0 and 100),
  knowledge_pct int not null default 0 check(knowledge_pct between 0 and 100),
  status text not null default 'learning' check(status in ('learning','healthy','attention','critical')),
  trend text not null default 'stable' check(trend in ('improving','stable','worsening')),
  summary text not null default '',
  metrics jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  sector_insights jsonb not null default '[]'::jsonb,
  sources jsonb not null default '{}'::jsonb,
  model_version text not null default 'business-health-v1',
  created_at timestamptz not null default now()
);
create index if not exists intelligence_snapshots_workspace_idx on intelligence_snapshots(workspace_id,as_of desc);
create index if not exists intelligence_snapshots_status_idx on intelligence_snapshots(status,as_of desc);

create table if not exists intelligence_signals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  snapshot_id uuid not null references intelligence_snapshots(id) on delete cascade,
  rule_id uuid references intelligence_rules(id) on delete set null,
  code text not null,
  dimension text not null,
  severity text not null default 'info' check(severity in ('info','attention','critical')),
  title text not null,
  message text not null,
  why_it_matters text,
  recommendation text,
  evidence jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique(workspace_id,snapshot_id,code)
);
create index if not exists intelligence_signals_workspace_idx on intelligence_signals(workspace_id,active,created_at desc);

create table if not exists intelligence_outcomes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  snapshot_id uuid references intelligence_snapshots(id) on delete set null,
  signal_id uuid references intelligence_signals(id) on delete set null,
  outcome_type text not null,
  expected jsonb not null default '{}'::jsonb,
  observed jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  notes text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists intelligence_outcomes_workspace_idx on intelligence_outcomes(workspace_id,occurred_at desc);

create table if not exists intelligence_daily_state (
  workspace_id uuid primary key references workspaces(id) on delete cascade,
  last_snapshot_at timestamptz
);

-- Regras universais iniciais. São explicáveis, versionadas e editáveis pelo portal administrativo.
insert into intelligence_rules(code,version,sector,dimension,metric_key,operator,warning_value,critical_value,weight,title,message_template,recommendation)
values
('client_concentration_top1',1,'all','resilience','top_client_share_pct','gte',30,45,1.2,'Dependência de um cliente','Seu maior cliente representa {value}% das entradas recentes.','Crie novas oportunidades e reduza a dependência antes que ela pressione o caixa.'),
('overdue_receivable_share',1,'all','finance','overdue_receivable_share_pct','gte',10,25,1.3,'Recebimentos atrasados estão crescendo','{value}% do valor a receber está vencido.','Priorize os maiores valores vencidos e acompanhe a recuperação semanalmente.'),
('task_overdue_rate',1,'all','operation','task_overdue_rate_pct','gte',15,30,0.8,'Rotina acumulando atrasos','{value}% das tarefas abertas já passaram do prazo.','Repriorize a rotina e retire tarefas sem responsável ou sem próxima ação.'),
('appointment_problem_rate',1,'all','operation','appointment_problem_rate_pct','gte',15,30,0.8,'Agenda com perdas acima do normal','{value}% dos compromissos recentes foram cancelados ou tiveram ausência.','Revise confirmações, remarcações e a forma de ocupação da agenda.'),
('pipeline_coverage',1,'all','sales','pipeline_coverage_months','lt',1.0,0.5,1.0,'Cobertura comercial baixa','Seu pipeline ponderado cobre cerca de {value} mês(es) da receita média.','Aumente prospecção e próximos passos antes de a queda chegar ao faturamento.'),
('cash_coverage',1,'all','finance','cash_coverage_months','lt',1.5,0.75,1.1,'Reserva de caixa curta','Sua reserva estimada cobre cerca de {value} mês(es) do ritmo de despesas.','Proteja caixa, acelere recebimentos e evite novos compromissos fixos até recuperar folga.')
on conflict(code,version) do nothing;
