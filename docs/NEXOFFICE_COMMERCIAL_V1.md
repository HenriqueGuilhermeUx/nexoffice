# NexOffice Commercial V1

## Objetivo de parada

O Commercial V1 existe para fechar um único fluxo operacional:

`empresa → memória → estratégia → campanha → criativo → Quality Gate → aprovação → mídia autorizada → lead → CRM → oportunidade → cliente → aprendizado`

Quando este fluxo estiver operacional ponta a ponta, a prioridade muda de expansão para hardening, observabilidade e operação com clientes reais.

## O que o NexOffice já reutiliza

- Business Profile / Business Knowledge como memória da empresa;
- CRM, oportunidades e eventos do Business OS;
- bridge MODO `nexoffice-marketing-v1`;
- Demand Projects, landing, funil, leads e outcomes da MODO;
- Ads Copilot para estratégia;
- Content Engine provider-neutral para criativos;
- Google Ads OAuth, seleção de conta e métricas da MODO;
- Market Radar e prospecção já existentes;
- isolamento por workspace, audit log e aprovação humana.

## Entrega Commercial V1

### 1. Contexto automático

`GET /v1/marketing/commercial/context`

Usa nome da empresa, setor, subsetor, modelo de receita, canal comercial e fatos explicitamente registrados em `business_profile.metadata` (`marketing`, `commercial` ou `brand`).

O sistema pergunta somente o que falta para a campanha. Não inventa preço, promoção, prova, depoimento, certificação, garantia ou resultado.

### 2. Criar campanha

`POST /v1/marketing/commercial/campaigns`

Uma ação explícita do cliente cria projeto de demanda, plano, campanha, landing e primeiro draft criativo. Criar a campanha **não ativa mídia nem gasto**.

### 3. Quality Gate

`GET /v1/marketing/commercial/creatives/:id/quality`

Verifica prontidão, presença de conteúdo e alegações comerciais sensíveis contra a memória explícita do cliente.

`POST /v1/marketing/commercial/creatives/:id/approve`

Aprovação é bloqueada se o gate falhar. Aprovação humana continua obrigatória.

### 4. Leads → CRM

`POST /v1/marketing/commercial/projects/:id/sync-crm`

Sincroniza leads capturados para `crm_contacts` e cria oportunidade correspondente em `crm_deals`. A operação é idempotente usando IDs da origem em JSONB. UTM e project ID permanecem ligados ao registro.

### 5. Aprendizado

`GET /v1/marketing/commercial/projects/:id/learning`

Combina funil da MODO com oportunidades/clientes ganhos do NexOffice e, quando disponível, métricas de Google Ads. A recomendação seguinte é baseada no estágio observado e não afirma causalidade.

## Governança

- workspace/tenant isolado;
- secrets somente no backend;
- nenhuma chave/token no frontend;
- aprovação humana antes de ações comerciais relevantes;
- Quality Gate antes da aprovação do criativo Commercial V1;
- nenhum aumento automático de orçamento;
- nenhuma ativação automática de mídia;
- nenhuma geração paga automática em testes;
- nenhuma alegação comercial fabricada;
- operações externas continuam sob o contrato de permissões do provider.

## Bloqueio externo para o marco completo

No contrato MODO atualmente disponível ao NexOffice, Google Ads está em modo `metricsReadOnly` e `externalCampaignActivation=false`. O NexOffice consegue preparar OAuth, selecionar conta, preparar/revisar/aprovar campanha e ler métricas, mas **não possui endpoint autorizado para efetivar veiculação/gasto**.

Portanto, o Commercial V1 só deve ser declarado completamente pronto para operação de mídia quando o provider disponibilizar, dentro do mesmo contrato de governança, uma ação explícita e idempotente de ativação após aprovação e conta autorizada. Isso não deve ser contornado duplicando credenciais Google no NexOffice.

Até lá, o estado correto é: **Commercial V1 funcional até “ready for media”, com captura/CRM/aprendizado prontos; ativação paga bloqueada por desenho do provider.**

## Fora do escopo antes do V1

- novas redes sociais por conveniência;
- automação irrestrita de conteúdo;
- aumento automático de orçamento;
- novos providers sem necessidade operacional;
- modelos complexos de atribuição;
- expansão de features que não feche o funil comercial acima.
