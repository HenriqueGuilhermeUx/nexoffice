# Plano de Desenvolvimento

## Fase 0 — Fundação (agora)

- [x] posicionamento e arquitetura horizontal;
- [x] monorepo TypeScript;
- [x] domínio multi-tenant;
- [x] schema Postgres inicial;
- [x] contratos de integração AV;
- [x] API base CRM/ERP/Event/Approval/Usage;
- [x] Central de Comando web inicial;
- [x] CI.

## Fase 1 — Core operacional

- [ ] autenticação e onboarding de workspace;
- [ ] membros, convites, papéis e permissões;
- [ ] CRM completo: contatos, deals, timeline, atividades, tarefas e filtros;
- [ ] ERP Lite: pagar/receber, recorrências, categorias, fluxo de caixa e conciliação manual;
- [ ] agenda e tarefas;
- [ ] Action Inbox real com decisões persistidas;
- [ ] políticas de autonomia configuráveis;
- [ ] audit trail;
- [ ] metering e custo estimado real.

**Critério de saída:** uma empresa consegue operar CRM + agenda + financeiro + decisões diárias apenas no NexOffice.

## Fase 2 — Equipe Digital

- [ ] Secretária: agenda, confirmação, remarcação, lista de espera;
- [ ] Atendimento: base de conhecimento, triagem, respostas sugeridas;
- [ ] CRM Agent: follow-up e priorização;
- [ ] ERP Agent: lançamento por texto/voz e classificação;
- [ ] Cobrança: régua e escalonamento;
- [ ] Controller: pulso diário/semanal, caixa, atrasos, anomalias;
- [ ] Document Agent;
- [ ] Growth Agent;
- [ ] chat unificado por agente e contexto do card.

**Critério de saída:** ações frequentes podem ser propostas/executadas por agentes com níveis explícitos de autonomia.

## Fase 3 — AV Integration Hub

Ordem sugerida por dependência operacional:

1. DocWallet — documentos/assinaturas/aprovações.
2. Staff — conversa/voz/agenda/comandos.
3. SmartBots — canais/WhatsApp/atendimento/CRM automation.
4. NextGen — cobrança/Pix/conciliação.
5. MODO — growth/campanhas/conteúdo.
6. TaxAgent — NFS-e/fiscal.

Cada adapter deve ter sandbox/mock, contrato, idempotência, webhook e metering.

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

Construir primeiro o que cria uso diário e dados estruturados: CRM, agenda, financeiro e Action Inbox. Integrações entram por trás desses fluxos, não como telas isoladas.
