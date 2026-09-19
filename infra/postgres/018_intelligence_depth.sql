-- NexOffice Inteligência do Negócio v2.
-- Aprofunda os três primeiros arquétipos: serviços/agenda, comércio e recorrência/contratos.
-- Também adiciona revisão explícita dos resultados observados para medir a utilidade das regras.

alter table intelligence_outcomes add column if not exists verdict text;
alter table intelligence_outcomes add column if not exists reviewed_at timestamptz;
alter table intelligence_outcomes add column if not exists reviewed_by uuid references users(id) on delete set null;
alter table intelligence_outcomes add column if not exists impact_score int;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='intelligence_outcomes_verdict_check') then
    alter table intelligence_outcomes add constraint intelligence_outcomes_verdict_check check(verdict is null or verdict in ('confirmed','partial','not_confirmed','unknown'));
  end if;
  if not exists (select 1 from pg_constraint where conname='intelligence_outcomes_impact_check') then
    alter table intelligence_outcomes add constraint intelligence_outcomes_impact_check check(impact_score is null or impact_score between -100 and 100);
  end if;
end $$;

create index if not exists intelligence_outcomes_review_idx on intelligence_outcomes(verdict,reviewed_at desc);

-- Serviços / agenda
insert into intelligence_rules(code,version,sector,dimension,metric_key,operator,warning_value,critical_value,weight,title,message_template,recommendation)
values
('services_appointment_problem_rate',1,'services','operation','appointment_problem_rate_pct','gte',15,30,1.0,'Perdas na agenda acima do esperado','Cancelamentos e ausências representam {value}% dos compromissos recentes.','Reforce confirmação, remarcação e retorno dos clientes antes que a perda apareça no caixa.'),
('services_future_agenda',1,'services','sales','future_appointment_change_pct','lt',-15,-30,1.1,'Agenda futura perdendo ritmo','A agenda dos próximos 30 dias está {value}% em relação ao período anterior.','Ative recompra, indicação e prospecção antes que a queda vire faturamento menor.'),
('health_future_agenda',1,'health','sales','future_appointment_change_pct','lt',-15,-30,1.1,'Agenda futura perdendo ritmo','A agenda dos próximos 30 dias está {value}% em relação ao período anterior.','Reforce confirmação, retorno e ocupação da agenda sem usar qualquer dado clínico do paciente.'),
('beauty_future_agenda',1,'beauty','sales','future_appointment_change_pct','lt',-15,-30,1.1,'Agenda futura perdendo ritmo','A agenda dos próximos 30 dias está {value}% em relação ao período anterior.','Ative retorno de clientes e ações de ocupação da agenda.'),
('automotive_future_agenda',1,'automotive','sales','future_appointment_change_pct','lt',-15,-30,1.1,'Agenda futura perdendo ritmo','A agenda dos próximos 30 dias está {value}% em relação ao período anterior.','Reforce revisões, retornos e novos orçamentos antes da queda de demanda.'),
('professional_services_future_agenda',1,'professional_services','sales','future_appointment_change_pct','lt',-15,-30,1.0,'Agenda comercial perdendo ritmo','A agenda dos próximos 30 dias está {value}% em relação ao período anterior.','Reforce reuniões comerciais, retornos e próximos passos do funil.')
on conflict(code,version) do nothing;

-- Comércio / estoque. Enquanto não houver estoque nativo completo, estes indicadores podem ser informados/importados.
insert into intelligence_rules(code,version,sector,dimension,metric_key,operator,warning_value,critical_value,weight,title,message_template,recommendation)
values
('commerce_inventory_turnover',1,'commerce','operation','inventory_turnover','lt',1.5,0.8,1.1,'Giro de estoque baixo','O giro de estoque informado está em {value}x.','Revise itens parados, compras futuras e capital imobilizado antes de aumentar estoque.'),
('commerce_gross_margin',1,'commerce','finance','gross_margin_pct','lt',20,10,1.2,'Margem bruta apertada','A margem bruta informada está em {value}%.','Revise preço, custo, descontos e mix antes de aumentar volume com margem insuficiente.'),
('commerce_stockout',1,'commerce','operation','stockout_rate_pct','gte',5,15,0.9,'Falta de estoque recorrente','A falta de estoque informada está em {value}%.','Revise reposição e itens críticos para evitar perder venda por indisponibilidade.'),
('restaurant_waste',1,'restaurant','operation','waste_rate_pct','gte',5,10,1.0,'Desperdício pressionando resultado','O desperdício informado está em {value}%.','Revise compras, porções, perdas e validade para proteger margem e caixa.')
on conflict(code,version) do nothing;

-- Receita recorrente / contratos
insert into intelligence_rules(code,version,sector,dimension,metric_key,operator,warning_value,critical_value,weight,title,message_template,recommendation)
values
('professional_contract_renewal',1,'professional_services','resilience','contract_renewal_rate_pct','lt',80,60,1.1,'Renovação de contratos abaixo do ideal','A taxa de renovação informada está em {value}%.','Antecipe conversas de renovação e acompanhe contratos próximos do vencimento.'),
('professional_contract_concentration',1,'professional_services','resilience','contract_concentration_pct','gte',35,50,1.2,'Receita concentrada em poucos contratos','Os maiores contratos representam {value}% da receita recorrente informada.','Diversifique a carteira e reduza dependência de poucos contratos.'),
('education_contract_renewal',1,'education','resilience','contract_renewal_rate_pct','lt',80,60,1.0,'Renovação abaixo do esperado','A taxa de renovação informada está em {value}%.','Antecipe ações de retenção antes do ciclo de renovação.'),
('services_contract_renewal',1,'services','resilience','contract_renewal_rate_pct','lt',80,60,1.0,'Renovação abaixo do esperado','A taxa de renovação informada está em {value}%.','Antecipe conversas de renovação e trate riscos antes do vencimento.')
on conflict(code,version) do nothing;
