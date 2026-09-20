# Coleta Inteligente de Dados v1

A Coleta Inteligente transforma a operação normal do NexOffice em histórico útil para Saúde do Negócio, trajetória, inteligência setorial e validação longitudinal.

## Princípio

O NexOffice deve coletar primeiro o que já existe na operação e pedir ao empresário somente o que não consegue calcular com segurança.

Nunca inventar uma métrica por aproximação silenciosa. Quando a informação exata depende de capacidade, timesheet, veículo, estoque, ERP ou outro dado ainda não estruturado, a lacuna deve permanecer explícita.

## Fontes nativas v1

- Financeiro / `ledger_entries`
- CRM / contatos e negócios
- Agenda / compromissos agregados por contato
- Recorrências e contratos operacionais
- Event Bus / `business_events`
- Perfil do negócio

## Métricas automáticas iniciais

A camada pode registrar, quando houver amostra suficiente: ritmo de receita, pressão de recebíveis, recorrência observada de clientes, retenção baseada em comportamento de pagamento, conversão comercial, ritmo da agenda futura, cancelamentos/ausências, retorno administrativo, próxima visita agendada, aprovação de negócios explicitamente identificados como orçamento, retorno de veículo somente quando existe `vehicleId`, base recorrente ativa e vencimentos recorrentes próximos.

Todas as métricas automáticas registram `source=integrated_system`, `source_reference`, confiança, definição e tamanho da amostra quando aplicável.

## Métricas que não são inventadas

Exemplos: ocupação real da agenda sem capacidade disponível conhecida, ocupação de boxes sem capacidade cadastrada, utilização faturável sem timesheet/capacidade, renovação contratual sem evento de renovação, giro/margem sem estoque/vendas estruturados.

Essas informações aparecem como lacunas com o modo de coleta recomendado: automático, atualização rápida do cliente ou integração.

## Cobertura

Cada empresa recebe snapshots diários de:

- cobertura dos indicadores necessários;
- frescor;
- percentual automático;
- profundidade histórica;
- indicadores disponíveis e obsoletos;
- lacunas e forma recomendada de obtê-las;
- fontes e qualidade observadas.

Estados internos: `forming`, `usable`, `strong`.

A classificação mede maturidade de dados, não risco de crédito.

## Segurança

Esta camada não aprova, nega ou precifica crédito; não movimenta dinheiro; não altera `NEXOFFICE_EXTERNAL_ACTIONS`; e, em saúde/beleza, usa somente sinais administrativos agregados, sem conteúdo clínico.
