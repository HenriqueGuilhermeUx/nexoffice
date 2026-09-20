-- NexOffice Inteligência Setorial v3.
-- Aprofunda comércio, receita recorrente e educação sem criar decisão automática de crédito.
-- Observações ficam separadas dos sinais: assim o sistema aprende também quando um sinal deixa de disparar.

create table if not exists intelligence_temporal_observations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  run_date date not null default current_date,
  code text not null,
  dimension text not null check(dimension in ('finance','sales','customers','operation','resilience')),
  current_value numeric,
  previous_value numeric,
  delta_pct numeric,
  signal_triggered boolean not null default false,
  source text not null default 'sector_intelligence_v3',
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,run_date,code)
);
create index if not exists intelligence_temporal_observations_lookup_idx on intelligence_temporal_observations(workspace_id,code,run_date desc);

alter table intelligence_actions add column if not exists temporal_signal_id uuid references intelligence_temporal_signals(id) on delete set null;
create index if not exists intelligence_actions_temporal_signal_idx on intelligence_actions(temporal_signal_id) where temporal_signal_id is not null;
create unique index if not exists intelligence_actions_temporal_signal_unique_idx on intelligence_actions(temporal_signal_id) where temporal_signal_id is not null;

-- Mantém a história das ontologias anteriores e publica novas versões apenas para os arquétipos aprofundados.
update sector_ontologies set active=false,updated_at=now()
where active=true and ((sector='commerce' and archetype='inventory') or (sector='all' and archetype='recurring') or (sector='education' and archetype='enrollment'));

insert into sector_ontologies(sector,archetype,version,maturity,operational_asset,failure_mode,anticipation_min_days,anticipation_max_days,leading_signals,mitigating_actions,description)
values
('commerce','inventory',2,'initial','Giro saudável entre demanda, venda, margem e estoque','Receita, conversão ou margem perdem ritmo enquanto faltas e capital parado aumentam.',7,60,
 '[{"code":"commerce_revenue_drop","weight":1.2,"horizonDays":30},{"code":"commerce_stockout_rise","weight":1.0,"horizonDays":21},{"code":"commerce_conversion_drop","weight":1.0,"horizonDays":21},{"code":"commerce_margin_drop","weight":1.2,"horizonDays":30}]'::jsonb,
 '["Rever itens sem giro e rupturas","Recuperar conversão antes de ampliar mídia","Proteger margem antes de aumentar compras","Priorizar produtos que combinam giro e contribuição"]'::jsonb,
 'Versão 2 usa histórico agregado de pedidos, estoque, conversão e margem quando disponível.'),
('all','recurring',2,'initial','Base ativa de receita recorrente e capacidade de renovação','Receita contratada perde base ou fica concentrada em vencimentos próximos antes de pressionar o caixa.',14,90,
 '[{"code":"recurring_expiry_concentration","weight":1.2,"horizonDays":45},{"code":"recurring_income_drop","weight":1.3,"horizonDays":60},{"code":"renewal_rate_drop","weight":1.0,"horizonDays":60}]'::jsonb,
 '["Antecipar renovações relevantes","Atuar primeiro nos contratos de maior valor","Entender perdas antes do próximo ciclo","Reduzir concentração de vencimentos"]'::jsonb,
 'Versão 2 acompanha valor mensal recorrente, vencimentos próximos e renovação informada.'),
('education','enrollment',2,'initial','Base ativa, frequente e propensa à rematrícula','Queda de frequência, rematrícula e aumento de evasão ou renegociação antecedem deterioração financeira.',14,120,
 '[{"code":"education_attendance_drop","weight":1.0,"horizonDays":45},{"code":"education_reenrollment_drop","weight":1.2,"horizonDays":75},{"code":"education_dropout_rise","weight":1.3,"horizonDays":60},{"code":"education_renegotiation_rise","weight":1.0,"horizonDays":45}]'::jsonb,
 '["Atuar em faltas recorrentes antes da evasão","Antecipar campanha de rematrícula","Tratar renegociações por coorte","Identificar turmas com deterioração mais rápida"]'::jsonb,
 'Versão 2 trabalha apenas com métricas operacionais e financeiras agregadas; não usa conteúdo pedagógico individual.')
on conflict(sector,archetype,version) do nothing;

-- Força uma rodada do motor no dia da publicação sem alterar as travas de ações externas.
update intelligence_learning_daily_state set run_date=null,status='idle',updated_at=now() where id='global';
