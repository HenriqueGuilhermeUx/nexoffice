# Plano de Desenvolvimento

## Fase 0 — Fundação

- [x] posicionamento e arquitetura horizontal;
- [x] monorepo TypeScript;
- [x] domínio multi-tenant;
- [x] schema Postgres inicial;
- [x] contratos de integração AV;
- [x] API base CRM/ERP/Event/Approval/Usage;
- [x] Central de Comando web inicial;
- [x] CI com build e integração em PostgreSQL real.

## Fase 1 — Core operacional

- [x] autenticação e onboarding de workspace;
- [x] membros, convites, papéis e permissões;
- [x] CRM: contatos, deals, timeline, atividades, tarefas e filtros;
- [ ] ERP Lite: pagar/receber, recorrências, categorias e fluxo de caixa estão prontos; falta fechar conciliação manual e visão gerencial final;
- [x] agenda e tarefas;
- [x] Action Inbox real com decisões persistidas;
- [x] políticas de autonomia configuráveis;
- [x] audit trail;
- [ ] metering: estrutura, API e custo estimado estão prontos; falta instrumentar automaticamente todos os adapters externos.

**Estado atual:** o critério funcional principal já é exercitado no CI: cadastro → workspace → CRM → agenda → financeiro → eventos → Central de Comando → convite de membro. A Fase 1 entra em fechamento, com conciliação e instrumentação automática como pendências principais.

## Fase 2 — Equipe Digital

- [~] Secretária: agenda e leitura operacional prontas; confirmações/remarcações/lista de espera avançadas ainda serão conectadas;
- [~] Atendimento: chat operacional e contexto do workspace prontos; canais externos entram via SmartBots;
- [~] CRM Agent: leitura/priorização do pipeline pronta; follow-up automatizado ainda será conectado;
- [~] ERP Agent: leitura financeira/contextual pronta; lançamento por voz depende do Staff service mode;
- [x] Cobrança V1: régua configurável, identificação de vencidos, tentativas idempotentes e aprovação humana;
- [~] Controller: pulso operacional de CRM/caixa/agenda/tarefas pronto; anomalias e comparativos avançados virão depois;
- [~] Document Agent: referências, estados, análise e solicitação de assinatura orquestrados; depende do bridge service-to-service do DocWallet para produção;
- [~] Growth Agent: contrato/eventos prontos; execução depende do adapter MODO;
- [x] chat operacional persistente por workspace e agente, usando fatos reais do NexOffice Core.

**Critério de saída:** ações frequentes podem ser propostas/executadas por agentes com níveis explícitos de autonomia. A infraestrutura de Agent Run + Approval + Outbox idempotente já existe; a próxima etapa é conectar os engines externos em modo de serviço.

## Fase 3 — AV Integration Hub

Ordem por dependência operacional:

1. **DocWallet** — contrato real auditado; endpoints de análise e assinatura mapeados; falta autenticação service-to-service estável.
2. **Staff** — chat atual auditado; hoje depende de sessão Supabase do usuário; falta expor service mode para conversa/voz/comandos do NexOffice.
3. **SmartBots** — contrato NexOffice e dispatcher configurável prontos; falta consolidar endpoint service-to-service de envio/atendimento.
4. **NextGen** — criação de cobrança já mapeada para a API/SDK existente com `X-API-Key`; execução externa permanece desligada por padrão.
5. **MODO** — contrato e dispatcher configurável prontos; falta consolidar endpoint service-to-service de growth.
6. **TaxAgent** — contrato preparado para NFS-e/fiscal; conectar quando o motor fiscal estiver pronto.

Todo adapter deve ter contrato, idempotência, health check, outbox/retry, webhook e metering. `NEXOFFICE_EXTERNAL_ACTIONS=false` continua sendo o padrão seguro até configuração de produção.

## Fase 4 — Vertical Packs

### Legal / NexJud
Mapear cliente, caso/processo, honorário, audiência e documentos; não copiar conteúdo jurídico desnecessário para o core horizontal.

### Health / MyDataMed
Mapear paciente, agenda, atendimento e financeiro administrativo. Dados clínicos permanecem no produto de saúde e são consultados apenas quando estritamente necessário e autorizado.

### Condo / SindCopilot
Mapear condomínio, unidades, fornecedores, agenda, documentos, cobranças e comunicação.

### Commerce
Primeiro por adapters para Shopify/WooCommerce/Nuvemshop/marketplaces. NexOffice opera clientes, pedidos, atendimento, financeiro, cobrança e growth; não replica storefront/checkout/logística na V1.

## Fase 5 — Comercialização

- [ ] planos standalone;
- [ ] add-on pricing dentro das ventures AV;
- [ ] limites e overage por capability;
- [ ] onboarding por segmento;
- [ ] templates de automação;
- [ ] marketplace de Vertical Packs/adapters no futuro.

## Regra de priorização

Construir primeiro o que cria uso diário e dados estruturados: CRM, agenda, financeiro e Action Inbox. Integrações entram por trás desses fluxos, não como telas isoladas. O NexOffice é sempre a experiência principal; engines especializados permanecem capabilities internas.
