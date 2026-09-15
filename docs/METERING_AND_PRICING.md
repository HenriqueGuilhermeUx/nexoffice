# Metering e preparação para Pricing

Pricing não será fixado antes de observar custo real por workspace. O NexOffice registra consumo desde a V1.

## Unidade canônica

Cada operação gera `usage_event` com:

- `workspace_id`
- `capability`
- `operation`
- `units`
- `unit_name`
- `provider`
- `cost_minor_estimate`
- `currency`
- `metadata`
- `occurred_at`

## Capabilities iniciais

| Capability | Exemplos de unidade |
|---|---|
| ai | input/output tokens, runs |
| smartbots | mensagens, conversas |
| staff | minutos de voz, transcrições, comandos |
| docwallet | páginas OCR, envelopes, assinaturas |
| nextgen | cobranças, Pix, conciliações |
| modo | gerações, campanhas, mídia administrada |
| taxagent | documentos fiscais |
| storage | GB-mês |
| automation | execuções de workflow |

## Perfis que mediremos

- **Uso leve:** baixa automação, poucos contatos/documentos/mensagens.
- **Uso médio:** CRM e agenda diários, atendimento e cobranças recorrentes.
- **Uso intenso:** vários usuários, alto volume conversacional/documental e automações contínuas.

## Princípios de monetização a testar

1. Mensalidade base deve cobrir infraestrutura fixa e valor do Core.
2. Add-ons podem ativar capabilities com custo marginal relevante.
3. Overage deve existir onde o custo é diretamente proporcional ao uso.
4. Planos AV podem compartilhar entitlement sem ocultar custo interno.
5. Não repassar complexidade técnica ao cliente: preferir franquias compreensíveis.
6. Margem deve ser analisada por workspace, capability e cohort.

## Dados necessários antes de preço final

- custo mensal Postgres/hosting por workspace;
- tokens por agente e tarefa;
- mensagens por cliente ativo;
- minutos de voz;
- OCR/assinaturas;
- cobranças/transações;
- storage;
- custo de mídia não entra na mensalidade SaaS, salvo taxa de gestão explícita;
- suporte e onboarding.

Com esses dados podemos construir preços standalone e add-on sem risco de subsidiar uso pesado inadvertidamente.
