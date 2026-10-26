# Nexa Life OS — pré-produção isolada (26/10/2026)

**Não é um deploy nem um ambiente de produção criado.** Esta pasta documenta o contrato obrigatório antes de provisionar o primeiro serviço de produção da plataforma PF Nexa.

## Arquitetura imutável
- `trynexa.com.br`: Nexa Life OS PF e área pública. O futuro aplicativo está reservado para `/meu-espaco/app/`.
- `wallet.trynexa.com.br`: Nexa Wallet cripto, Privy, Pix/USDC, endereços e saldos originais. Nada dessa estrutura é migrado por este trabalho.
- `api-life.trynexa.com.br`: **hostname reservado/proposto, ainda não provisionado**, para a API do Life OS exclusivamente PF.
- PostgreSQL Neon: projeto novo e exclusivo (diferente do projeto de homologação `orange-fog-28021931`); database `nexa_lifeos_prod`, usuário de acesso mínimo.
- Render: serviço web novo e exclusivo para PF. NÃO alterar `nex-personal-preview-api`, `nexa-backend`, NexOffices PJ ou bancos de clientes.

## Contrato implementado (sem conexões)
`node scripts/check-nexa-lifeos-prod-env.mjs` **falha sem as variáveis reais** e apenas examina configuração local, nunca consulta banco/API nem imprime senhas.
`node --test scripts/smoke-nexa-lifeos-prod-env.mjs` valida dados falsos e os casos bloqueados, sem recursos externos.
`node scripts/plan-nexa-lifeos-prod-migrations.mjs` gera um manifesto SHA256 read-only para revisão. **NÃO EXECUTA MIGRAÇÕES**.

Exigências:
- flags `NEXA_LIFEOS_ENV=production`, `NODE_ENV=production`, `NEXA_LIFEOS_PROD_RELEASE_APPROVED=true` após revisão;
- efeitos financeiros/rotinas PJ desabilitados, `AUTO_MIGRATE=false`, signup público inicialmente **false**;
- `ALLOWED_ORIGINS=https://trynexa.com.br` exata, sem wildcard, sem `wallet.*`; `NEXA_LIFEOS_API_ORIGIN` e `VITE_NEXA_LIFEOS_API_URL` iguais a `https://api-life.trynexa.com.br`;
- `DATABASE_URL` de DB separado `nexa_lifeos_prod`, host Neon e TLS `sslmode=verify-full`, sem parâmetros host/ssl alternativos. Projeto Neon de produção deve ser **independentemente verificado pelo painel/API de administração**, pois o ID informado por variável sozinho não prova pertença;
- `SESSION_TTL_DAYS` explícito entre 1 e 14; sem chaves/tokens de prévia nem duplicação de Wallet Privy;
- política final de autorização deve validar cada usuário PF, segregar audiências dos tokens, impedir leitura cruzada e passar testes de login/recuperação/LGPD.

## Migrações: NÃO reaproveitar cegamente o preview
O manifesto lista como **referências de revisão** `infra/personal-preview/001_identity.sql` e migrações `046`–`049` de `nex_personal`. O nome do primeiro arquivo é histórico; revisar DDL, permissões, RLS/ownership, auditoria, índices, consentimentos, rollback e plano de backup antes de criar migrações específicas de produção. Não utilizar `runPersonalPreviewMigrations` ou `AUTO_MIGRATE` no banco definitivo. Uma etapa futura poderá usar tabela de migração **nova**, transações e checksum após revisão.

## O que NÃO foi feito
Não foi criado banco, endpoint público, DNS, chaves, serviço Render ou conta de usuário PF em produção. **A única base Neon identificada pela integração neste workspace foi a de homologação**, que permanece intacta. Nenhum custo novo deve ser contratado implicitamente.

## Gates antes de produção
1. Criar/provisionar projeto Neon PF exclusivo, política de backup, menor privilégio e TLS; confirmar identificador real sem expor senha.
2. Aprovar migrations PF de produção e executar validação em banco DESCARTÁVEL primeiro; backup/rollback e verificação de isolamento de clientes.
3. **Servidor PF separado agora implementado em código:** `apps/api/src/server-personal-production.ts`, sem deploy, importando o contrato de ambiente de produção e a política TLS PF (`db.ts` escolhe o construtor novo somente quando `NEXA_LIFEOS_ENV=production`). Tem `/health/live` sem DB, `/health` com verificação DB, login limitado por IP (defesa local inicial), signup explicitamente 503, CORS de origem única, bloqueio de endpoints PJ, headers seguros e proteção de erros. **Não está pronto para produção pública**: faltam rate limit distribuído no ingress, antifraude, revisão de recuperação de conta, identidade/consentimentos LGPD, teste em DB descartável e observabilidade. O servidor de homologação `server-personal.ts` continua independente e intocado.
4. CSP/CORS e sessão de mesmo domínio PF revisadas; nunca compartilhar token PF com Wallet nem criar carteira Privy redundante.
5. Testar build `release`, novo API server, DB/segurança, 16 salas, Maya e F-Insight, sem operações reais.
6. Só depois publicar `/meu-espaco/app/`, revisar SW PWA raiz da Wallet (PR site #36), configurar redirects e atualizar o CTA principal, com rollback.

Estado: especificações e testes preparatórios; **NO-GO para uso de clientes reais**.

## Smoke do servidor PF ainda sem banco real

Após `npm run build`, execute `node scripts/smoke-nexa-lifeos-prod-server.mjs`. O teste sobe a API **somente em 127.0.0.1 com host Neon fictício** e não conecta ao Postgres; valida health/live, exclusão do handler real de criação de contas e bloqueio de cadastro (503), autenticação obrigatória (401) em rotas privadas, rejeição de login malformado (400), limite local de tentativas (429), CORS bloqueando Wallet, preflight PF autorizado e ausência de rotas PJ. O novo entrypoint não está vinculado ao `npm start` do NexOffices nem a nenhum serviço Render.

**Limitação de segurança:** o rate limit no servidor demonstrativo usa memória local e não serve como controle distribuído para múltiplas instâncias. Antes do primeiro deploy público, implantar limitação confiável no ingresso, avaliar autenticação, antifraude, consentimentos, CSP, sessões e migrações com backup. `NEXA_LIFEOS_AUTH_REVIEW_APPROVED=false` permanece no exemplo de ambiente.

## Ensaio de DDL em PostgreSQL descartável do CI

O workflow de integração executa `scripts/rehearse-nexa-lifeos-prod-ddl-ci.mjs` com `NEXA_LIFEOS_SCHEMA_REHEARSAL=true`. O script exige também `CI=true`, `GITHUB_ACTIONS=true`, `DATABASE_URL` local em `127.0.0.1:5432/nexoffice` e ausência de flags de produção/preview. Cria `nexa_lifeos_schema_rehearsal_ci` **somente no contêiner PostgreSQL efêmero do runner**, aplica as cinco DDLs em transações, comprova a presença de tabelas PF, verifica que o esquema `public` possui apenas `users` e `auth_sessions`, com zero usuários e sessões, e informa quantas tabelas PF usam RLS. O runner descartará esse banco após o job.

Este teste **não é migração autorizada de produção**; caso a contagem de RLS seja insuficiente, a estratégia de menor privilégio/isolamento e as políticas de acesso devem ser projetadas e homologadas antes de qualquer aplicação a um banco real.


## Bloqueio estrutural: Row-Level Security antes de usuários reais (26/10/2026)

**Resultado da revisão do DDL:** as cinco migrações herdadas de homologação ainda não contêm comandos `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY` nem `CREATE POLICY`. Elas **não estão aprovadas para aplicação em produção**. Mesmo uma API que filtre `owner_user_id` em consultas não substitui controle efetivo de acesso no banco.

Foi implementado `scripts/audit-nexa-lifeos-prod-schema.mjs`, que permanece **offline por padrão**. Executar `node --test scripts/smoke-nexa-lifeos-prod-schema-audit.mjs` usa somente metadados fictícios e testa aprovação parcial e 12 bloqueios. Se e somente se houver banco PF realmente dedicado e já revisado, configurar `NEXA_LIFEOS_SCHEMA_AUDIT=true` junto ao contrato de ambiente e executar a auditoria: consulta **somente catálogos PostgreSQL** e nega:
- PF table sem RLS habilitado **e forçado**; ausência de política; política `PUBLIC USING(true)`; `users`/`auth_sessions` sem RLS;
- role da API com `SUPERUSER`, `BYPASSRLS`, `CREATEDB`, `CREATEROLE` ou propriedade de tabela sensível;
- tabelas de NexOffices PJ/Wallet em `public` ou tabelas PF obrigatórias ausentes.

**A auditoria é necessária, não suficiente**: ainda não prova que cada política limita efetivamente registros ao usuário autenticado. Precisaremos implementar contexto de identidade por transação (de modo a não confiar em valores enviados pelo navegador), separar roles administrativas/migração da role da API e testar contas A/B em cada endpoint sob leituras/gravações cruzadas. Políticas de `users`/`auth_sessions` devem permitir autenticação e revogação por serviços legítimos sem abrir leitura a outros usuários.

**Não ligar `api-life.trynexa.com.br`, nem criar cadastros ou migrar contas** antes de aprovar esse modelo, RLS em Postgres descartável, testes de identidade, LGPD, rate limit compartilhado e backups. A PR permanece rascunho e não altera dados reais.


## Bloqueio também em tempo de execução

A futura API de produção usa `apps/api/src/nexa-lifeos-prod-schema-ready.ts`. Ao receber acesso a qualquer rota de dados PF com token, ou um pedido de login válido, ela consulta **somente os metadados do banco com a própria role de aplicação** e chama `evaluateLifeosSchema`. Se faltar RLS forçado, política, role limitada ou estrutura isolada, o pedido falha com HTTP **503** e erro genérico `schema_not_ready`; nenhuma informação de cliente deve ser entregue. `GET /health` exige esse esquema, enquanto `GET /health/live` indica apenas que o processo está executando.

O resultado seguro é armazenado por 60 segundos para não consultar os catálogos a cada requisição; uma alteração de segurança posterior pode, portanto, levar até 60 segundos para ser reavaliada. Essa janela não substitui bloqueios operacionais, controle de alterações e testes. O servidor não inclui bypass específico de CI para o esquema; o smoke local usa somente rotas sem autenticação e credenciais falsas, mantendo o fluxo de banco fechado. Esse controle **não constrói nem substitui políticas de RLS**, e tampouco prova que a sessão autenticada está corretamente ligada ao usuário no contexto de cada transação.

Os testes `scripts/smoke-nexa-lifeos-prod-schema-audit.mjs` exercitam o avaliador de metadados e protegem sua ligação ao servidor. Nenhum token de Wallet é aceito intencionalmente como credencial PF; manter bancos de sessões e permissões inteiramente distintos.

## Proteção final contra vazamento entre usuários (26/10/2026)

**Este ponto prevalece sobre qualquer observação anterior de 'RLS auditado' ou 'API pronta'.** A auditoria de catálogos `audit-nexa-lifeos-prod-schema.mjs` verifica apenas presença de tabelas, roles e políticas. Ela **não demonstra** que cada consulta feita pelo pool `query()` recebe o `app.user_id` autenticado em uma transação exclusiva, nem resolve o bootstrap seguro de `public.users` e `auth_sessions`.

Por isso, o entrypoint `apps/api/src/server-personal-production.ts` passou a exigir `requireVerifiedLifeosUserContext()`, definido em `apps/api/src/nexa-lifeos-prod-user-context.ts`, antes de qualquer login válido, logout, leitura/escrita PF com Bearer e `GET /health`. **Essa função rejeita incondicionalmente com HTTP 503 enquanto o binding RLS efetivo não existir.** Nenhuma variável de ambiente ou modo CI libera o acesso. `GET /health/live` continua HTTP 200 para diagnosticar apenas a execução do processo, não a prontidão.

Testes com API local e host/banco fictícios confirmaram: cadastro público 503; login válido 503 **antes de consultar o banco**; Bearer fictício em `/v1/personal/me` 503 **antes de consultar o banco**; logout 503; `/health` 503; `/health/live` 200; rotas sem token 401; Wallet origin 403; caminhos PJ inexistentes. O CI valida a proteção. Também foram separados textos de privacidade, agente e F-Insight para não descrever erroneamente um serviço de produção como homologação. A experiência de homologação atual preserva as mensagens anteriores.

**Trabalho técnico ainda obrigatório para retirar o bloqueio:**
1. Concluir modelo de identidade PF verificável com papéis distintos para autenticação/bootstrap e dados de titular; não confundir token PF com Privy/Wallet.
2. Associar o `user_id` após autenticação exclusivamente no backend a uma transação PostgreSQL na **mesma conexão** de todas as operações da requisição (por exemplo, `SET LOCAL app.user_id` com `current_setting` nas policies). Nunca aceitar user ID declarado pelo frontend como identidade.
3. Provar em Postgres descartável, com role de aplicação sem `BYPASSRLS`, testes A/B para **todas** as tabelas e operações, incluindo joins, rotas de exportação, transações e efeitos de background, com limitação correta de `USING` e `WITH CHECK`.
4. Garantir que contexto de RLS não vaze após rollback, exceções, pools reaproveitados, troca de contas ou operações concorrentes; validar sessões, revogação, consentimento e rate limit distribuído.
5. Só então substituir o bloqueio por implementação revisada, homologar API/backend PF dedicado com banco produtivo exclusivo e liberar `/health` em ambiente seguro. **Não remover a trava apenas porque o teste de catálogos retornou PASS.**

O objetivo da trava não é concluir o login: é impedir que uma configuração aparentemente válida exponha dados de um usuário a outro antes da homologação de segurança.
