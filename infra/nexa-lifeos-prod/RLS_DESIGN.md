# Nexa PF — RLS de produção por usuário (proposta, NÃO aplicada)

Data: 26/10/2026. Base: PR #98, banco PF separado. Nenhum banco Neon ou Render foi modificado.

## Por que

O ensaio das cinco migrações do antigo Nex Personal encontrou 12 tabelas sob `nex_personal` e **0 com RLS**. Os filtros por `owner_user_id` na aplicação ajudam, mas não garantem isolamento caso uma consulta omita esse filtro. A Wallet e o NexOffices PJ não devem compartilhar essa base.

## O que foi preparado em código

`infra/nexa-lifeos-prod/001_owner_rls.sql` é uma proposta **somente para um novo banco PF de produção**, para aplicar *após* as cinco migrações-base e revisão jurídica/técnica:
- Habilita `ENABLE ROW LEVEL SECURITY` e `FORCE ROW LEVEL SECURITY` nas 12 tabelas esperadas, recusando tabela extra ou política preexistente inesperada.
- Aplica política por `nex_personal.current_actor_id()`, que lê `current_setting('nexa.actor_id',true)` e retorna `NULL` sem contexto autenticado.
- Restringe `profiles.user_id` e outras dez tabelas pelo `owner_user_id`.
- `audit_events` recebe apenas `SELECT` do proprietário e `INSERT` com `owner_user_id` e `actor_user_id` iguais ao ator autenticado. Sem políticas de `UPDATE` ou `DELETE` — trilha append-only.

`scripts/rehearse-nexa-lifeos-prod-rls-ci.mjs` é executado **exclusivamente no PostgreSQL descartável do GitHub Actions**, após as cinco migrações do ensaio. Confirma RLS e FORCE nas 12 tabelas, 13 políticas, e simula dois atores UUID falsos: seleção isolada, ausência de acesso sem ator, bloqueio de gravação cruzada e falsificação de eventos; faz `ROLLBACK` dos registros fictícios.

## ⚠ Bloqueio essencial: contexto de ator na API

**Ainda não aplicar o SQL em produção nem conectar a API de clientes.** O backend PF atual executa consultas com um Pool PostgreSQL compartilhado e autentica usuários via bearer token; ele **não configura ainda `nexa.actor_id` em uma transação segura por requisição**.

Antes da aplicação, implementar/adotar uma camada robusta que, após autenticar o usuário, execute todas as operações de banco daquele usuário em transações com `SET LOCAL` do ator **derivado exclusivamente da sessão validada**, nunca de headers ou parâmetros manipuláveis; garantir isolamento de conexões concorrentes, rollback e revogação de sessão. Diferenciar a conexão de login (tabelas públicas de identidade) das consultas PF com RLS.

Também são exigidos:
- usuário de aplicação de banco separado do owner de migrations e sem BYPASSRLS/SUPERUSER;
- grants mínimos por tabela, validação de políticas com o papel real da aplicação e testes de concorrência;
- prevenção de SQL injection (uma sessão SQL com capacidade de chamar `set_config` poderia falsificar o ator);
- auditoria de rotas, autorização, LGPD, retenção, logs, consentimentos, backup e recuperação;
- provas de cross-tenant em servidor real de teste contra PostgreSQL **descartável**, incluindo ordens assíncronas;
- nenhuma migração para o banco de preview existente e nenhuma mistura com Privy/Wallet.

**Status:** protótipo de defesa no esquema, não requisito completamente satisfeito. Não é autorização de produção.
