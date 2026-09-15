# Arquitetura

## Visão

NexOffice é um control plane operacional multi-tenant. O `workspace_id` é a fronteira lógica principal. Toda entidade de negócio, evento, ação, integração e medição de uso pertence a um workspace.

```text
                      NexOffice Web
                           │
                       NexOffice API
                           │
     ┌─────────────────────┼─────────────────────┐
     │                     │                     │
 Workspace/CRM        ERP/Agenda            Command Core
                                               │
                              ┌────────────────┼───────────────┐
                          Event Bus       Approval Engine  Agent Router
                              │                                │
                              └──────────── Integration Hub ───┘
                                               │
              ┌───────────┬──────────┬─────────┼─────────┬──────────┐
            DocWallet  SmartBots    Staff    NextGen     MODO    TaxAgent
```

## Event-driven, sem microserviços prematuros

V1 usa um backend modular e um Postgres único. O contrato de eventos é criado desde o início para permitir extração futura de workers/serviços sem reescrever o domínio.

Todo fato relevante produz um `BusinessEvent`, por exemplo:

- `lead.created`
- `lead.followup_due`
- `appointment.created`
- `appointment.cancelled`
- `document.signature_required`
- `document.signed`
- `payment.charge_created`
- `payment.overdue`
- `payment.received`
- `campaign.opportunity`

## Action Inbox

Eventos podem produzir `CommandAction`. Uma ação tem agente responsável, prioridade, resumo, subject, ação principal e modo de autonomia.

## Autonomia e aprovação

Toda ação executável é classificada como:

- `automatic`: NexOffice pode executar sem interromper o usuário.
- `notify`: executa e informa.
- `approval_required`: cria Approval Request antes da execução.

A postura padrão é conservadora. Ações financeiras sensíveis, alteração de orçamento, cancelamento, assinatura em nome de alguém, ações jurídicas ou clínicas exigem aprovação.

## Identidade CRM

Uma pessoa/empresa tem um registro horizontal no CRM. Produtos verticais mantêm seus dados especializados e guardam referência ao contato NexOffice quando necessário. O NexOffice não deve copiar prontuário, conteúdo processual sensível ou documentos integrais apenas para conveniência.

## ERP Lite

ERP Lite é um ledger operacional, não um sistema contábil completo. Guarda fatos financeiros suficientes para operação, cobrança, caixa e Controller. Fiscal é delegado ao TaxAgent; pagamentos/cobranças podem ser delegados à NextGen.

## Integrações

Adapters implementam contratos estáveis. O core nunca chama detalhes específicos de uma venture diretamente. Exemplo: o core pede `createCharge`; o adapter NextGen decide endpoint, autenticação e tradução de payload.

## Segurança planejada

- tenant isolation por `workspace_id` em todas as queries;
- RLS quando Supabase/Auth forem conectados;
- secrets somente no servidor;
- audit/event log para ações de agentes e aprovações;
- escopo mínimo de dados em integrações;
- idempotência em webhooks e eventos externos;
- consentimento específico para canais e capabilities quando aplicável.

## Escala

A primeira meta é simplicidade operacional. Quando necessário, o Event Bus pode migrar de tabela/outbox para fila dedicada sem alterar os contratos de domínio.
