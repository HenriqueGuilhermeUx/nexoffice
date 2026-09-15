# Plano de Desenvolvimento — NexOffice

> **NexOffice — o sistema operacional do seu negócio.**

Este documento descreve o estado real do `main`. NexOffice é um core horizontal, multi-tenant e embutível. Produtos verticais continuam donos de seus domínios especializados; NexOffice opera CRM, agenda, financeiro, cobrança, documentos, comunicação, fiscal, growth, agentes e Central de Comando.

## Fase 0 — Fundação ✅

- [x] posicionamento horizontal e modos standalone / add-on / platform;
- [x] monorepo TypeScript;
- [x] domínio multi-tenant e workspaces;
- [x] Postgres e migrations;
- [x] Event Bus, Approval Engine, Agent Runs, Outbox e audit trail;
- [x] contratos de integração AV;
- [x] CI com PostgreSQL real e smoke tests de ponta a ponta.

## Fase 1 — Core operacional ✅

- [x] autenticação, sessões e onboarding;
- [x] membros, convites, roles e permissões;
- [x] CRM: contatos, oportunidades, atividades, pipeline, timeline e tarefas;
- [x] ERP Lite: pagar/receber, contas, recorrências, caixa e baixa;
- [x] conciliação manual e auto-match assistido por confiança;
- [x] agenda e tarefas;
- [x] Action Inbox / Central de Comando;
- [x] políticas de autonomia;
- [x] audit trail;
- [x] usage/metering por capability e provider;
- [x] execução idempotente de comandos;
- [x] outbox com retry/backoff e caminho de reconciliação manual para efeitos financeiros ambíguos.

**Critério atual exercitado no CI:** cadastro → workspace → CRM → agenda → financeiro → eventos → Command Center → aprovação → Agent Run → Outbox → conciliação → convite de membro.

## Fase 2 — Equipe Digital 🟢 em execução

### Secretária
- [x] leitura de agenda e contexto operacional;
- [x] detecção proativa de compromissos a confirmar;
- [x] texto de confirmação pronto;
- [x] card com aprovação humana antes de WhatsApp;
- [ ] remarcação e lista de espera assistidas;
- [ ] execução recorrente por scheduler após ambiente de produção dedicado.

### Atendimento
- [x] chat operacional persistente;
- [x] contexto empresarial por workspace;
- [x] bridge Staff Business isolado da memória pessoal;
- [x] SmartBots service bridge;
- [ ] triagem/reclassificação multicanal avançada.

### CRM Agent
- [x] leitura e priorização de pipeline;
- [x] detecção proativa de oportunidades sem atividade;
- [x] follow-up WhatsApp pré-escrito por etapa;
- [x] aprovação humana obrigatória para primeiro outbound;
- [ ] aprendizado por taxa de resposta/conversão após amostra real.

### ERP / Cobrança / Controller
- [x] leitura financeira contextual;
- [x] régua de cobrança V1;
- [x] cobrança Pix governada via NextGen;
- [x] idempotência forte e estado de reconciliação manual em resultado ambíguo;
- [x] pulso CRM + financeiro + agenda + tarefas + sinais verticais;
- [ ] detecção estatística de anomalias e comparativos avançados.

### Document Agent
- [x] referências documentais sem armazenar arquivo bruto;
- [x] análise e assinatura orquestradas;
- [x] bridge DocWallet service-to-service;
- [x] vínculo explícito e revogável Workspace ↔ DocWallet;
- [x] idempotência e audit trail.

### Growth Agent
- [x] bridge NexOffice → MODO;
- [x] planejamento, canais, conteúdo e experimentos;
- [x] publicação e orçamento bloqueados fora do fluxo nativo de aprovação do MODO;
- [ ] feedback loop CRM → campanha → reunião → receita com amostra real.

## Fase 3 — AV Integration Hub ✅ base funcional

| Capability | Estado |
|---|---|
| DocWallet | Bridge service-to-service + análise/assinatura + isolamento de workspace validados |
| Staff | Business bridge validado; memória pessoal fica fora do NexOffice |
| SmartBots | Bridge seguro, bot por workspace, idempotência e aprovação humana validados |
| NextGen | Rota interna de cobrança NexOffice, aprovação, reserva idempotente e reconciliação manual |
| MODO | Growth planning bridge validado; sem publish/budget pelo bridge |
| TaxAgent | Company/environment por workspace, `secret_ref`, preparação fiscal aprovável e `/v1/invoices` |

`NEXOFFICE_EXTERNAL_ACTIONS=false` continua sendo a postura segura por padrão. Efeitos externos reais só devem ser ligados capability por capability depois de configuração do ambiente.

## Fase 4 — Plataforma embutível e Vertical Packs 🟢

### Provisionamento AV
- [x] `/v1/platform/provision` idempotente;
- [x] `workspace_origins`, `external_identities` e entitlements;
- [x] session exchange / handoff;
- [x] roles owner/admin/member/viewer;
- [x] mesmo workspace pode nascer standalone ou via produto AV.

### Legal / NexJud
- [x] pack Legal;
- [x] domínio jurídico continua no NexJud;
- [x] firewall aggregate-only;
- [x] sinais agregados de atividade, prazos, monitoramento, workload e carteira;
- [x] prioridades entram no Copiloto e Central de Comando.

### Health / MyDataMed + Health Wallet
- [x] pack Health;
- [x] firewall explícito contra identidade de paciente e dado clínico bruto;
- [x] sinais somente administrativos/agregados;
- [x] agenda operacional, requests, SLA, workload e programas agregados;
- [x] prioridades entram no Copiloto e Central de Comando.

### Condo / SindCopilot
- [x] pack Condo;
- [x] firewall aggregate-only;
- [x] compliance, documentos, comunicados, fornecedores e portfólio agregados;
- [x] nenhum morador/unidade/conteúdo privado cru entra pelo bridge;
- [x] prioridades entram no Copiloto e Central de Comando.

### Commerce
- [x] pack Commerce;
- [x] conectores lógicos Shopify / WooCommerce / Nuvemshop / Mercado Livre / manual;
- [x] firewall aggregate-only;
- [x] pedidos, fulfillment, estoque, clientes agregados, suporte e conversão;
- [x] nenhum pedido individual, nome, e-mail, telefone, endereço, CPF ou item comprado entra pelo bridge;
- [x] Copiloto e Central de Comando entendem o contexto de commerce;
- [ ] adapters nativos de coleta para cada plataforma, começando pelo canal com cliente piloto.

## Fase 5 — Operação proativa 🟢

- [x] Operational Signal Engine;
- [x] prioridades por vertical;
- [x] materialização idempotente de sinais em cards do Command Center;
- [x] Rotina Operacional V1 de Secretária + CRM Agent;
- [x] pulse de rotina no shell web;
- [ ] scheduler recorrente de rotina após staging dedicado;
- [ ] playbooks adicionais: pós-reunião, proposta parada, reativação e lista de espera;
- [ ] transformação de sinais seguros em propostas MODO/SmartBots/Staff com governança por risco.

## Fase 6 — Staging e produção controlada

- [x] NextGen bridge endurecido e live no Render;
- [ ] Postgres dedicado do NexOffice;
- [ ] API NexOffice em staging;
- [ ] web staging;
- [ ] pareamento de secrets service-to-service;
- [ ] probes sem efeitos externos;
- [ ] ativação gradual de capabilities reais;
- [ ] E2E humano por vertical antes de produção comercial.

**Bloqueio de infraestrutura atual:** a conta Render não oferece outra vaga de Postgres gratuito; não reutilizar banco de outra venture e não criar recurso pago sem autorização explícita.

**Pendência NextGen separada:** o scheduler Bull depende de Redis e o workspace Render ainda não possui Key Value/Redis. Não remover silenciosamente essa dependência.

## Fase 7 — Comercialização e pricing

- [ ] observar custo real por workspace e capability;
- [ ] perfis de uso leve / médio / intenso;
- [ ] preço standalone;
- [ ] preço add-on dentro das ventures AV;
- [ ] franquias e overage compreensíveis;
- [ ] onboarding por segmento;
- [ ] templates de automação;
- [ ] expansão futura de packs/adapters.

## Regra de arquitetura

NexOffice não replica sistemas especialistas. Ele mantém a experiência principal, a memória operacional e a governança. DocWallet, Staff, SmartBots, NextGen, MODO, TaxAgent e os produtos verticais permanecem engines/capabilities com contratos estreitos, isolamento de dados, idempotência, audit trail e níveis explícitos de autonomia.
