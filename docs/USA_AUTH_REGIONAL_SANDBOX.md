# NexOffices USA — identity and regional persistence QA laboratory

**Status: test-only, disabled by default, NOT deployed.** Separate from the live US marketing preview and all Brazilian NexOffices systems. Development branch: `feature/usa-localized-preview-20261024`, PR #91.

## Implemented and verified boundaries

- Local-only Node.js laboratory in `apps/usa-lab`, outside root production npm workspaces.
- US-only organizations, users and tasks in a **dedicated temporary SQLite file** using `node:sqlite`; SQL `CHECK(region_code='US')`, foreign keys, parameter binding and organization-scoped reads/updates.
- Fixtures provisioned directly by test code only. **No public registration, invite, password-reset or user-creation endpoint**.
- Hashed fixture passwords via scrypt with unique random salts; random opaque 256-bit session tokens stored in SQLite as SHA-256 digests only.
- `HttpOnly; SameSite=Strict` session cookie scoped to `/lab`, 30-minute expiry, no CORS, local Origin/Host checks, and simple failed-login throttling.
- Real **local sandbox persistence across service restarts**, but no persistence beyond the disposable QA SQLite file. Tests also prove cross-tenant data isolation, sign-out, attempted BR region and tenant forgery rejection, and public-bind refusal.

## Fail-closed execution

This module does not expose a normal launch script. `startUSLab` can run only when `enabled:true` **and** `USA_LAB_ENABLED=1`, on IPv4 loopback `127.0.0.1`, with an explicit absolute `.sqlite` filename under the operating system temporary directory; it refuses `NODE_ENV=production`. Tests provision all accounts with synthetic `.example` addresses and remove the database afterward.

Run with Node 24:

```sh
node scripts/usa-identity-lab-guard.mjs
node --test apps/usa-lab/test/isolation.test.mjs
```

The dedicated `usa-identity-lab.yml` workflow runs in the draft PR. Nothing is added to the regular web build, Brazil API, Render service, database, secrets, deployment or the public USA staging. That existing preview explicitly has CSP `connect-src 'none'` and remains **offline-only**.

## Not production-ready

The lab deliberately stops before real US accounts. Before enabling actual US onboarding or persistence, require a dedicated cloud tenancy and DB, migrations/RLS review, identity provider/OIDC, email verification, MFA, password recovery, secure HTTPS cookie and CSRF design, encryption/key management, monitoring, backup/recovery, rate limiting, privacy/legal disclosures, data export/deletion and human approval flows. Banking, accounting, tax, billing and financial agent actions are **not enabled**.

Four unrelated Brazilian legacy smoke-check failures remain tracked in [issue #96](https://github.com/HenriqueGuilhermeUx/nexoffice/issues/96). **No merge, no Brazil production changes, no service activation.**


## Contrato de verificação OIDC (sem conexão real)

O módulo de testes `apps/usa-lab/src/oidc.mjs` valida assinatura RS256 com chave pública JWKS fixada pelo chamador, emissor HTTPS exato, audiência, prazo de validade, identificação de chave e declaração regional. Rejeita assinatura adulterada, algoritmo `none`/HS256, referências remotas de chaves, emissor não confiável e região BR.

A identidade externa somente ganha acesso quando estiver explicitamente vinculada a um usuário e organização US no SQLite de testes, via `linkOIDCSubject`; campos de e-mail ou organização dentro do JWT **não** autorizam acesso. Os testes de falsificação e isolamento rodam em `apps/usa-lab/test/oidc.test.mjs`.

**Isto não constitui integração OIDC operacional.** Ainda não há provedor contratado, endpoint de login, fluxo PKCE, obtenção/rotação de JWKS, MFA, emissão de sessão de produção ou banco americano em nuvem. O verificador recebe apenas chaves públicas sintéticas dos testes e não acessa a internet. Não importar no app brasileiro, nem conectar à prévia estática USA, que mantém `connect-src 'none'`.


## Fluxo OAuth/OIDC PKCE — contrato em laboratório (2026-10-26)

O arquivo `apps/usa-lab/src/auth-flow.mjs` agora modela a parte sensível do fluxo **Authorization Code + PKCE S256** sem se conectar a um provedor. Ele gera `state`, `nonce` e `code_verifier` aleatórios, usa `code_challenge` SHA-256, exige uma prova de navegador independente do URL (destinada a um cookie HttpOnly num futuro BFF), limita cada tentativa a cinco minutos e consome o `state` antes de qualquer troca de código.

A troca do código por um `id_token` é **simulada por uma função injetada nos testes**, não é uma chamada de rede. O token precisa ter assinatura RS256, issuer e audience aprovados, `nonce` exato e região US. Em seguida, a identidade somente resolve se existir vínculo US explícito na camada de membros, sem aceitar permissões derivadas de e-mail ou `org_id` declarados no JWT.

A autorização de teste não cria conta real, não emite cookie real, não armazena credenciais externas e não acessa o Render. A execução depende de `USA_LAB_ENABLED=1`, é bloqueada sob `NODE_ENV=production`, exige redirect de loopback e não aparece em nenhum endpoint público. Os testes estão em `apps/usa-lab/test/auth-flow.test.mjs` e no workflow `usa-identity-lab.yml`.

**Pendências necessárias antes de produção:** provedor de identidade escolhido, descoberta OIDC confiável, HTTPS callback real, distribuição e rotação de JWKS, autenticação de cliente e troca de códigos com timeout, cookie de sessão e proteção CSRF no BFF, expiração/revogação, MFA, confirmação de e-mail, auditoria, backups e provisionamento do banco US. Nenhuma dessas partes foi ativada.


## Servidor HTTP BFF local — contrato ponta a ponta

Foi acrescentado `apps/usa-lab/src/bff.mjs`, que executa exclusivamente em `127.0.0.1` e somente com `USA_LAB_ENABLED=1` fora de `NODE_ENV=production`. O próprio código limita o emissor a domínios de identidade **sintéticos terminados em .example**.

No laboratório, o início de login é protegido por verificação da origem HTTP e gera prova aleatória vinculada ao navegador. Um cookie temporário `HttpOnly; SameSite=Lax` permite o retorno de navegação do provedor simulado; a resposta ao callback consome o `state`, valida PKCE e `nonce`, exige vínculo com uma empresa americana e cria uma sessão de teste separada `HttpOnly; SameSite=Strict`. O retorno HTTP redireciona para um caminho interno sem expor código ou token na URL. Logout revoga a sessão.

O servidor não implementa cadastro público nem faz qualquer requisição externa. `apps/usa-lab/test/bff.test.mjs` verifica dois tenants com dados fictícios, cookies, sessão, replay, prova de navegador trocada, origem falsa, Host/proxy e restrição de acesso entre organizações.

**Importante:** em produção seria obrigatório rodar HTTPS com cookies `Secure`, gestão distribuída de sessão e `state`, provedor OIDC real, descoberta/JWKS de origem autenticada e rotativa, revogação e monitoramento, proteção anti-CSRF aprovada para o fluxo, recuperação de conta e revisão de ameaças. Nada disso está ativado; o staging público do Render permanece estático e **não carrega este servidor**.
