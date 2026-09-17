# NexOffice Ecosystem Capability Graph

Status: implementado no core em 2026-09-17.

## Objetivo

O NexOffice não replica os produtos da Alternative Ventures. Ele resolve uma intenção empresarial em uma **capability** e escolhe o motor especializado que deve atendê-la. O workspace, a governança, a memória operacional horizontal, o Command Center e o audit trail permanecem no NexOffice.

Fluxo-base:

```text
usuário / agente
  -> intenção
  -> capability
  -> motor especializado
  -> resultado normalizado
  -> NexOffice
  -> recomendação / aprovação / execução / registro
```

A fonte canônica é `apps/api/src/capability-registry.ts`. O endpoint `GET /v1/capabilities` materializa o grafo para o workspace e informa maturidade, runtime, governança, disponibilidade e quais agentes podem usar cada ferramenta.

## Ownership

| Capability | Motor |
|---|---|
| contexto, CRM, financeiro horizontal, automações e Command Center | NexOffice |
| inteligência financeira empresarial | NexOffice, reutilizando metodologia de interpretação do F-Insight |
| documentos, inteligência e assinatura | DocWallet |
| conversa empresarial | Staff Business Bridge |
| comunicação operacional | SmartBots |
| cobrança e reconciliação | NextGen |
| growth, Demand, Google Ads, campanhas e inteligência de mercado | MODO |
| fiscal | TaxAgent |
| sinais jurídicos agregados | NexJud |
| sinais condominiais agregados | SindCopilot |

## Regras de segurança

- `NEXOFFICE_EXTERNAL_ACTIONS=false` continua sendo o gate global de efeitos externos no staging.
- Capabilities com `approvalRequired=true` não perdem o approval-first por estarem no catálogo.
- NexJud e SindCopilot entregam sinais agregados; seus dados de domínio permanecem no produto de origem.
- Staff recebe somente snapshot empresarial autorizado; memória pessoal não é importada.
- DocWallet permanece system of capability documental; o NexOffice trabalha com referências e metadados necessários.
- NextGen não implica Bank Connect nesta fase.
- MODO pode usar OAuth e métricas reais do Google Ads, mas ativação de campanha/publicação/orçamento não faz parte do rollout atual.

## Maturidade

- `active`: capability implementada no NexOffice; depende apenas de runtime/configuração quando externa.
- `guarded`: implementação existe, mas produz efeito externo e permanece sob gates/aprovação.
- `planned`: o motor de origem possui capacidade relevante, mas o adapter NexOffice ainda não a expõe.

Isso evita declarar como pronta uma integração que existe no ecossistema, mas ainda não está contratualmente disponível ao NexOffice.

## Equipe Digital

A UI da Equipe Digital consulta o grafo e mostra as ferramentas reais disponíveis para cada função. O objetivo é que Sofia, Alex, Clara, Nico, Theo, Dora e Maya deixem de ser apenas personas conversacionais e passem a operar sobre capacidades concretas.

Exemplos:

- Dora -> `documents.analyze` -> DocWallet.
- Maya -> `growth.google_ads.metrics.read` -> MODO.
- Theo -> `finance.interpret` -> NexOffice/F-Insight methodology.
- Clara -> `automation.rule.evaluate` -> NexOffice usando o padrão de regras/execução reaproveitado do NextGen.
- Controller -> `legal.operational_signals.read` -> sinais agregados do NexJud quando o vertical é jurídico.

## Próxima expansão

A próxima fase deve promover capabilities hoje marcadas como `planned`, começando por alto impacto e baixo risco:

1. DocWallet: alertas, obrigações, partes, valores e vencimentos estruturados no Cliente 360/Command Center.
2. MODO: Market Radar, prospecção B2B e criação de conteúdo pelo contrato service-to-service.
3. SmartBots: preparação estruturada de follow-up separada do envio.
4. Staff: voz/captura de intenção empresarial sem compartilhar memória pessoal.
5. NextGen: reconciliação e padrões de regras, mantendo Bank Connect fora do escopo atual.

A promoção de `planned` para `active` deve sempre vir acompanhada de contrato, teste de integração e smoke test no CI.
