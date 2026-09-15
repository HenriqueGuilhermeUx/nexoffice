# Auditoria de Capabilities AV para NexOffice

Auditoria inicial dos repositórios acessíveis em 2026-09-15. Objetivo: reaproveitar engines reais sem transformar NexOffice em um acoplamento de frontends.

## DocWallet

Repositórios encontrados:

- `HenriqueGuilhermeUx/docwallet`
- `HenriqueGuilhermeUx/docwallet-native`
- `HenriqueGuilhermeUx/docwallet-backend`

O backend standalone é Flask e declara APIs de login, documentos, contratos, certificados e validação blockchain. O código também contém módulos separados de docflow, assinatura ICP, inteligência documental, links e pagamentos.

### Papel no NexOffice

**System of capability para documentos empresariais.**

Responsabilidades desejadas:

- upload/arquivo seguro;
- leitura e extração;
- resumo;
- fluxo documental;
- assinatura;
- aprovação/aceite;
- evidência/integridade;
- status e webhooks.

### Ajuste necessário

Expor um contrato server-to-server estável, independente da UI do DocWallet:

- `POST /v1/envelopes`
- `POST /v1/documents/:id/extract`
- `POST /v1/documents/:id/approval`
- `GET /v1/documents/:id/status`
- webhook de `document.*`

O NexOffice guarda referência/status/metadados necessários, não uma cópia indiscriminada do documento bruto.

---

## Staff

Repositório encontrado: `HenriqueGuilhermeUx/smart-bot-staff`.

O Staff já possui autenticação Supabase, Storage privado, memória, tarefas, agenda, notificações, assistente IA, bridge mobile, voz e Smart Inbox. O Smart Inbox já classifica/extrai documentos, possui revisão obrigatória, dedupe, ledger financeiro simples, vínculos e telemetria agregada. Existe endpoint server-side `staff-document-analyze` e o chat V2 reutiliza memória/documentos confirmados.

### Papel no NexOffice

**Interface cognitiva e executiva.**

Responsabilidades:

- entender ordens em linguagem natural;
- voz/transcrição;
- agenda e lembretes;
- memória contextual autorizada;
- interpretação de intenção;
- experiência de conversar com agentes.

### Fronteira com DocWallet

Staff já sabe extrair documentos, mas NexOffice não deve manter dois sistemas concorrentes como fonte oficial de documentos empresariais. O padrão recomendado:

- **DocWallet:** system of record/capability documental do NexOffice;
- **Staff:** captura, voz, entendimento e UX de ação sobre documentos;
- extração leve de recibos pode continuar como provider do Staff quando fizer sentido, mas documentos empresariais, assinatura e aprovação convergem para DocWallet.

---

## NextGen Assets

Repositório encontrado: `HenriqueGuilhermeUx/nextgenassets`.

A plataforma já possui API em `https://api.nextgenassets.com.br`, autenticação por `X-API-Key`, integração Woovi, cobrança Pix, QR Code/link de pagamento, webhooks de pagamento, subcontas, split e SDK JavaScript. A documentação também descreve OpenAPI e fluxos de webhook/reconciliação.

### Papel no NexOffice

**Payments & Collections Engine.**

Responsabilidades:

- criar cobrança;
- Pix/link/boleto quando suportado;
- consultar status;
- receber confirmação;
- conciliar;
- futuramente split quando o caso exigir.

### Ajuste necessário

Não acoplar NexOffice a endpoints administrativos/de teste. Criar superfície partner/service dedicada, por exemplo:

- `POST /v1/partners/nexoffice/charges`
- `GET /v1/partners/nexoffice/charges/:ref`
- webhook autenticado NexOffice ← NextGen

Eventos normalizados:

- `payment.charge_created`
- `payment.received`
- `payment.expired`
- `payment.failed`
- `payment.refunded`

---

## MODO

Repositório encontrado: `HenriqueGuilhermeUx/modo`.

MODO já é monorepo React/Fastify/Postgres e possui diagnóstico, memória de marca, planejamento, conteúdo, Studio, campanhas, inteligência de mercado, Apify, leads, LinkedIn, Instagram Business, publicação assistida e SmartBots Assistido. A API de produção documentada é `https://modo-api-3m10.onrender.com`.

### Papel no NexOffice

**Growth Engine.**

Responsabilidades:

- memória de marca;
- conteúdo;
- campanha/brief;
- publicação;
- inteligência;
- performance;
- prospecção/lead sources quando apropriado;
- remarketing/reactivation com consentimento e regras do vertical.

### Ajuste necessário

Criar uma API service-to-service pequena em cima do core MODO em vez de reproduzir a UI:

- `POST /v1/platform/campaign-brief`
- `POST /v1/platform/content`
- `POST /v1/platform/campaigns`
- `GET /v1/platform/campaigns/:id/performance`

Campanhas/publicações que gastem orçamento ou publiquem externamente continuam sujeitas ao Approval Engine do NexOffice.

---

## SmartBots

Não foi encontrado um repositório standalone acessível com nome SmartBots nesta auditoria. MODO declara integração **SmartBots Assistido** e o ecossistema já possui trabalho de API SmartBots em andamento.

### Papel no NexOffice

**Communication & CRM Automation Engine.**

Responsabilidades contratuais já definidas no NexOffice:

- envio por canais;
- respostas sugeridas;
- qualificação;
- follow-up;
- conhecimento de atendimento.

### Próximo passo

Apontar o adapter para a API SmartBots existente quando confirmarmos base URL, autenticação e contratos efetivos; não inventar outra implementação dentro do NexOffice.

---

## TaxAgent

Repositório encontrado: `HenriqueGuilhermeUx/TaxAgent`.

No estado observado, o repositório contém apenas a definição do produto: infraestrutura fiscal API-first, NFS-e Nacional, IBS/CBS, motor fiscal, ledger e eventos. O backend é prioridade, mas ainda não existe superfície de API versionada no repositório atual.

### Papel futuro no NexOffice

**Fiscal Engine.**

Contrato esperado:

- emitir NFS-e;
- consultar documento fiscal;
- cancelar/substituir quando permitido;
- retornar eventos fiscais.

O adapter já existe como contrato no NexOffice, mas fica sem provider real até o TaxAgent expor o motor.

---

## Decisão de ownership

| Domínio | Owner principal |
|---|---|
| Workspace / tenant | NexOffice |
| CRM horizontal | NexOffice |
| ERP Lite / Business Ledger | NexOffice |
| Action Inbox / Approval | NexOffice |
| Orquestração de agentes | NexOffice |
| Metering | NexOffice |
| Documento empresarial/assinatura | DocWallet |
| Voz/comando/agenda cognitiva | Staff |
| Atendimento/canais/CRM automation | SmartBots |
| Cobrança/Pix/conciliação | NextGen |
| Growth/campanhas/conteúdo | MODO |
| Fiscal | TaxAgent |
| Jurídico | NexJud |
| Clínico | MyDataMed |
| Condomínio | SindCopilot |

## Conclusão técnica

NexOffice não precisa reconstruir o portfólio. O trabalho novo de maior valor está em **Workspace + CRM + ERP Lite + Event Bus + Approval Engine + Agent Orchestrator + Command Center + metering**, enquanto as capabilities especializadas entram via adapters com contratos estreitos e eventos normalizados.
