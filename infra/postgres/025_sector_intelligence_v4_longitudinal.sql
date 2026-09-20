-- NexOffice Inteligência Setorial v4 + base longitudinal.
-- Expande serviços profissionais, automotivo e saúde/beleza sem criar decisão automática de crédito.
-- Saúde/beleza utiliza somente indicadores administrativos agregados; nenhum dado clínico entra no motor.

update sector_ontologies set active=false,updated_at=now()
where active=true and (
  (sector='health' and archetype='schedule') or
  (sector='beauty' and archetype='schedule') or
  (sector='automotive' and archetype='schedule') or
  (sector='professional_services' and archetype='contracts')
);

insert into sector_ontologies(sector,archetype,version,maturity,operational_asset,failure_mode,anticipation_min_days,anticipation_max_days,leading_signals,mitigating_actions,description)
values
('professional_services','contracts',1,'initial','Carteira ativa, renovação e capacidade produtiva faturável','Renovação, utilização e retenção perdem força antes de reduzir receita e previsibilidade.',14,90,
 '[{"code":"pro_contract_renewal_drop","weight":1.2,"horizonDays":60},{"code":"pro_billable_utilization_drop","weight":1.0,"horizonDays":30},{"code":"pro_client_retention_drop","weight":1.1,"horizonDays":60}]'::jsonb,
 '["Antecipar renovações relevantes","Reequilibrar capacidade faturável","Tratar risco de saída dos clientes de maior valor"]'::jsonb,
 'Primeira ontologia específica para escritórios, consultorias, contabilidade e serviços profissionais.'),
('automotive','schedule',2,'initial','Capacidade produtiva ocupada, orçamentos aprovados e retorno de veículos','Ocupação, aprovação de orçamento e retorno perdem ritmo antes de reduzir produção e faturamento.',7,60,
 '[{"code":"automotive_bay_occupancy_drop","weight":1.1,"horizonDays":21},{"code":"automotive_quote_approval_drop","weight":1.2,"horizonDays":30},{"code":"automotive_repeat_vehicle_drop","weight":1.0,"horizonDays":45}]'::jsonb,
 '["Retomar orçamentos pendentes","Ocupar capacidade disponível","Ativar manutenção preventiva e retorno de clientes"]'::jsonb,
 'Versão 2 aprofunda oficinas e centros automotivos com sinais operacionais próprios.'),
('health','schedule',2,'initial','Ocupação administrativa futura e continuidade de atendimento','Ocupação e retorno perdem ritmo antes da queda de produção administrativa e receita.',7,60,
 '[{"code":"health_occupancy_drop","weight":1.2,"horizonDays":30},{"code":"health_return_drop","weight":1.0,"horizonDays":45}]'::jsonb,
 '["Recuperar capacidade ociosa","Reforçar retornos administrativamente elegíveis","Melhorar confirmação e remarcação"]'::jsonb,
 'Somente métricas administrativas agregadas. Não usa diagnóstico, prontuário, exame, prescrição ou condição clínica para risco.'),
('beauty','schedule',2,'initial','Ocupação, retorno e reagendamento da carteira','Ocupação, retorno ou reagendamento perdem força antes de reduzir faturamento futuro.',7,45,
 '[{"code":"beauty_occupancy_drop","weight":1.1,"horizonDays":21},{"code":"beauty_return_drop","weight":1.0,"horizonDays":30},{"code":"beauty_rebooking_drop","weight":1.0,"horizonDays":30}]'::jsonb,
 '["Preencher horários ociosos","Estimular retorno","Reagendar antes de perder recorrência"]'::jsonb,
 'Versão 2 aprofunda salões, estética e bem-estar com métricas administrativas agregadas.')
on conflict(sector,archetype,version) do nothing;

-- Libera uma única rodada do motor após a publicação da nova ontologia.
update intelligence_learning_daily_state set run_date=null,status='idle',started_at=null,completed_at=null,updated_at=now() where id='global';
