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

## Gate efetivo de isolamento multiusuário — 26/10/2026

**NO-GO adicional:** o código herdado de homologação usa `query()` sobre um pool PostgreSQL compartilhado. Embora cada endpoint use `owner_user_id` nas queries, **não existe atualmente um contexto de usuário PostgreSQL vinculado à mesma transação** (`SET LOCAL app.user_id`). Portanto, criar uma política RLS que mencione `current_setting('app.user_id', true)` e contar políticas no catálogo NÃO demonstra isolamento real.

- A rotina `requireLifeosProductionSchema` agora tem um **bloqueio incondicional explícito** (`tenant_context_binding_not_implemented`) depois da auditoria do catálogo. Assim, mesmo que um banco pareça possuir tabelas e RLS corretos, `/health`, login e endpoints PF protegidos permanecem bloqueados até que seja implementada e comprovada a amarração de identidade.
- A auditoria de catálogo rejeita políticas PF amplas, papéis `PUBLIC` ou múltiplos papéis, ausência de predicado ligado a `app.user_id` e tentativas de bypass por `OR`. Isso é apenas um filtro conservador, **não substitui teste transacional ou revisão humana do SQL**.
- `/health/live` pode responder para monitoramento de processo, mas isso **não significa prontidão de dados**. Um serviço com `/health` indisponível não pode receber tráfego de clientes.
- Antes de remover o bloqueio, implementar `queryAsPersonalUser(userId, fn)` em transação exclusiva: autenticar o bearer com caminho de bootstrap cuidadosamente revisado, definir `SET LOCAL app.user_id` somente depois da identidade validada, executar todas as consultas/escritas dentro do mesmo cliente/transaction, limpar o contexto no commit/rollback e impedir reutilização cruzada de conexões.
- Exigir ensaio E2E com **dois usuários distintos** e tabelas PF reais em PostgreSQL descartável: usuário A não lê/edita B; troca de token não herda `app.user_id`; queries fora de transação não acessam registros; **auth_sessions** e **users** têm regras próprias de bootstrap, hash de token e acesso mínimo; privilégios `GRANT` e `FORCE ROW LEVEL SECURITY` explicitamente aprovados.
- Após isso, testar expiração/revogação de sessão, negação de prévia, rate limit distribuído e política LGPD. Nenhum desses testes foi executado em dados reais.

O servidor de produção continua **deliberadamente não liberável** enquanto esses gates permanecerem abertos. Esse bloqueio não afeta o Render de homologação, NexOffices PJ nem a Nexa Wallet.

## Protótipo da transação PF autenticada — somente código, não ligado à API

O helper `apps/api/src/nexa-lifeos-tenant-tx.ts` implementa **apenas a mecânica transacional** para a próxima revisão:
1. Recebe token opaco, envia **somente SHA-256** ao resolver de sessão `nex_personal.resolve_api_session($1::text)`.
2. Usa **um único cliente PostgreSQL** para `BEGIN`, resolução da identidade, `set_config('app.user_id', userId, true)`, callback SQL e `COMMIT`. Em falha, `ROLLBACK` e liberação da conexão.
3. Rejeita token inválido, preview e sessão ausente, sem executar consultas privadas.

**Não está conectado às rotas públicas** e a função `nex_personal.resolve_api_session` **ainda não existe em produção nem foi implantada em nenhum banco**. Sua futura implementação deverá ser revisada quanto a `SECURITY DEFINER`, dono, `search_path`, `GRANT EXECUTE`, vazamento de identidade e privacidade. O helper não prova segurança sozinho.

`scripts/smoke-nexa-lifeos-tenant-tx.mjs` executa **5 testes com pool fictício**, incluindo transação única, hash, rollback, separação entre duas conexões e bloqueio de preview; eles **não usam Neon nem substituem o teste E2E A/B real com políticas RLS**.

Consequentemente, o bloqueio incondicional `tenant_context_binding_not_implemented` continua obrigatório na API definitiva até migrarmos todas as rotas relevantes para a identidade transacional e validarmos autenticação, login, leitura, escrita, revogação e isolamento efetivo com dois usuários no PostgreSQL descartável.
