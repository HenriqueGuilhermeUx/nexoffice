# Nexa PF — compatibilidade de identidade transacional e RLS (NO-GO)

**Data:** 26/10/2026. **Alcance:** pré-produção. Não é uma migração e não autoriza ativar acesso ao Life OS.

## Incompatibilidade encontrada nas propostas isoladas

- [PR #100](https://github.com/HenriqueGuilhermeUx/nexoffice/pull/100): o DDL `001_owner_rls.sql` usa `nexa.actor_id` dentro de `nex_personal.current_actor_id()`. As políticas `CREATE POLICY` não declaram `TO nexa_lifeos_app`; por padrão, aplicam-se a `PUBLIC`.
- [PR #102](https://github.com/HenriqueGuilhermeUx/nexoffice/pull/102): a transação protótipo escreve `app.user_id` via `set_config(...,true)` na mesma conexão. A auditoria exige referência explícita a `app.user_id` e `roles=['nexa_lifeos_app']`.
- Logo, **passar nos CIs independentes não prova que a composição dos dois rascunhos funcione ou seja segura**. A auditoria pode rejeitar o DDL; a política pode não ver o usuário autenticado.

## Contrato de integração proposto

1. Padronizar o marcador de ator como `app.user_id` em SQL, transação e auditoria, definido exclusivamente após validação de sessão. Não aceitar `nexa.actor_id` como alias silencioso.
2. Aplicar políticas RLS explicitamente restritas à role `nexa_lifeos_app`, com `USING` e `WITH CHECK` adequados à operação. Aprovar separadamente políticas de identidade `public.users` e `public.auth_sessions` para autenticação, revogação e bootstrap.
3. Implementar e revisar a função `nex_personal.resolve_api_session` com privilégios mínimos, hash de token, `SECURITY DEFINER` endurecido e revogação. Ela **ainda não existe** nas migrações atuais.
4. Fazer ensaio com duas contas fictícias, pool PostgreSQL real, role sem `BYPASSRLS`, sessões concorrentes, troca de conexões e tentativa de acesso cruzado. Testar leitura e escrita, `WITH CHECK`, função de autenticação, expiração e rollback.
5. Só revisar a remoção da trava `tenant_context_binding_not_implemented` após os testes completos e análise de LGPD, acesso mínimo, CSRF/CSP, backups e rollback.

## Teste introduzido

`node --test scripts/smoke-nexa-lifeos-actor-contract.mjs` é **offline** e falha em caso de divergência textual das convenções. Quando o SQL ainda não pertence à branch, reporta explicitamente `NEXA_PF_NO_GO` e exige que a trava 503 continue.

Esse smoke **não valida SQL, políticas efetivas, funções, dados ou segurança de produção**. A compatibilidade real depende da execução contra PostgreSQL efêmero e da revisão do SQL completo.

**Proibido:** merge em `main` PJ, deploy, alteração de saldos, Wallet/Privy/Pix, banco de homologação ou banco de clientes apenas com base nesta verificação.
