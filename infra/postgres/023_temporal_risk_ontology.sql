-- NexOffice Motor de Conhecimento e Risco v2.
-- Camada interna/aditiva. Não aprova, nega ou precifica crédito.
-- Modela ativos operacionais, sinais precursores, horizonte de antecipação e histórico temporal.

create table if not exists sector_ontologies (
  id uuid primary key default gen_random_uuid(),
  sector text not null,
  archetype text not null default 'general',
  version int not null default 1 check(version > 0),
  active boolean not null default true,
  maturity text not null default 'initial' check(maturity in ('initial','observed','validated')),
  operational_asset text not null,
  failure_mode text not null,
  anticipation_min_days int check(anticipation_min_days is null or anticipation_min_days >= 0),
  anticipation_max_days int check(anticipation_max_days is null or anticipation_max_days >= anticipation_min_days),
  leading_signals jsonb not null default '[]'::jsonb,
  mitigating_actions jsonb not null default '[]'::jsonb,
  description text,
  created_by text not null default 'system',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(sector,archetype,version)
);
create index if not exists sector_ontologies_active_idx on sector_ontologies(active,sector,archetype,version desc);

create table if not exists intelligence_temporal_signals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  ontology_id uuid references sector_ontologies(id) on delete set null,
  run_date date not null default current_date,
  code text not null,
  dimension text not null check(dimension in ('finance','sales','customers','operation','resilience')),
  severity text not null check(severity in ('info','attention','critical')),
  title text not null,
  what_changed text not null,
  why_it_matters text,
  recommendation text,
  current_value numeric,
  previous_value numeric,
  delta_pct numeric,
  horizon_days int,
  confidence numeric(5,4) not null default 0.5000 check(confidence between 0 and 1),
  evidence jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,run_date,code)
);
create index if not exists intelligence_temporal_signals_workspace_idx on intelligence_temporal_signals(workspace_id,run_date desc,severity);
create index if not exists intelligence_temporal_signals_code_idx on intelligence_temporal_signals(code,run_date desc);

create table if not exists intelligence_risk_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  as_of timestamptz not null default now(),
  run_date date not null default current_date,
  operational_stress_index int not null default 0 check(operational_stress_index between 0 and 100),
  posture text not null default 'normal' check(posture in ('normal','attention','elevated')),
  trend text not null default 'stable' check(trend in ('improving','stable','worsening')),
  confidence numeric(5,4) not null default 0.5000 check(confidence between 0 and 1),
  sector text not null default 'general',
  ontology_versions jsonb not null default '{}'::jsonb,
  signal_summary jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  model_version text not null default 'temporal-risk-v2',
  created_at timestamptz not null default now(),
  unique(workspace_id,run_date,model_version)
);
create index if not exists intelligence_risk_snapshots_workspace_idx on intelligence_risk_snapshots(workspace_id,run_date desc);
create index if not exists intelligence_risk_snapshots_posture_idx on intelligence_risk_snapshots(posture,run_date desc);

-- Ontologia inicial: hipóteses operacionais versionadas. A maturidade começa como initial e deve evoluir somente com evidência observada.
insert into sector_ontologies(sector,archetype,version,maturity,operational_asset,failure_mode,anticipation_min_days,anticipation_max_days,leading_signals,mitigating_actions,description)
values
('all','general',1,'initial','Fluxo contínuo de demanda, clientes, operação e caixa','A atividade perde ritmo antes de a pressão aparecer integralmente no resultado financeiro.',14,90,
 '[{"code":"sales_activity_drop","weight":1.0,"horizonDays":30},{"code":"customer_acquisition_drop","weight":0.8,"horizonDays":45},{"code":"receivable_stress_rise","weight":1.2,"horizonDays":30}]'::jsonb,
 '["Rever oportunidades sem próximo passo","Priorizar recebimentos vencidos","Reduzir dependências concentradas"]'::jsonb,
 'Base transversal para detectar mudança de ritmo em qualquer empresa.'),
('services','schedule',1,'initial','Capacidade futura ocupada e comparecimento','A agenda futura enfraquece ou perde qualidade antes da queda de receita.',7,60,
 '[{"code":"future_agenda_drop","weight":1.2,"horizonDays":30},{"code":"appointment_problem_rise","weight":1.0,"horizonDays":21},{"code":"sales_activity_drop","weight":0.8,"horizonDays":45}]'::jsonb,
 '["Reforçar confirmação e remarcação","Ativar recompra e retorno","Recuperar capacidade futura ociosa"]'::jsonb,
 'Arquétipo de serviços e negócios movidos por agenda.'),
('health','schedule',1,'initial','Ocupação futura da agenda de atendimento','Cancelamentos, ausências e menor ocupação futura reduzem produção antes do efeito completo no caixa.',7,60,
 '[{"code":"future_agenda_drop","weight":1.3,"horizonDays":30},{"code":"appointment_problem_rise","weight":1.1,"horizonDays":21}]'::jsonb,
 '["Reforçar confirmação","Reativar pacientes/clientes elegíveis","Distribuir melhor a agenda"]'::jsonb,
 'Somente sinais operacionais agregados; não utiliza dado clínico para risco.'),
('beauty','schedule',1,'initial','Ocupação futura e recorrência de atendimentos','A agenda perde ocupação ou aumenta faltas antes de reduzir faturamento.',7,45,
 '[{"code":"future_agenda_drop","weight":1.2,"horizonDays":21},{"code":"appointment_problem_rise","weight":1.0,"horizonDays":14}]'::jsonb,
 '["Confirmar horários","Estimular retorno","Preencher janelas ociosas"]'::jsonb,
 'Arquétipo de beleza e bem-estar movido por agenda.'),
('automotive','schedule',1,'initial','Capacidade ocupada e fluxo de serviços aprovados','Menor fluxo de serviços e ocupação reduz produção futura.',14,60,
 '[{"code":"future_agenda_drop","weight":1.0,"horizonDays":30},{"code":"sales_activity_drop","weight":1.0,"horizonDays":45}]'::jsonb,
 '["Retomar orçamentos","Reativar clientes","Ocupar capacidade disponível"]'::jsonb,
 'Primeira ontologia para oficinas e serviços automotivos.'),
('commerce','inventory',1,'initial','Giro entre demanda, venda, margem e estoque','A frequência de vendas/clientes diminui enquanto capital pode permanecer preso na operação.',14,75,
 '[{"code":"sales_activity_drop","weight":1.2,"horizonDays":30},{"code":"customer_acquisition_drop","weight":0.8,"horizonDays":45},{"code":"receivable_stress_rise","weight":1.0,"horizonDays":30}]'::jsonb,
 '["Rever giro e mix","Recuperar clientes","Evitar ampliar estoque sem demanda comprovada"]'::jsonb,
 'Aprofunda automaticamente quando estoque e margem estiverem disponíveis.'),
('all','recurring',1,'initial','Base ativa de receita recorrente e disciplina de recebimento','Menor renovação/entrada e piora de recebimento antecedem pressão na receita recorrente.',30,90,
 '[{"code":"receivable_stress_rise","weight":1.3,"horizonDays":30},{"code":"customer_acquisition_drop","weight":0.7,"horizonDays":60},{"code":"sales_activity_drop","weight":0.8,"horizonDays":60}]'::jsonb,
 '["Atuar em atrasos cedo","Rever renovações próximas","Reduzir concentração da receita recorrente"]'::jsonb,
 'Arquétipo complementar para contratos e receitas recorrentes.'),
('education','enrollment',1,'initial','Base ativa e engajada de matrículas','Queda de engajamento, renegociação e evasão operacional tendem a anteceder perda financeira.',30,120,
 '[{"code":"receivable_stress_rise","weight":1.0,"horizonDays":45}]'::jsonb,
 '["Tratar atrasos e renegociações cedo","Acompanhar engajamento e rematrícula"]'::jsonb,
 'Fica mais profundo quando frequência, rematrícula e evasão estiverem estruturadas.')
on conflict(sector,archetype,version) do nothing;
