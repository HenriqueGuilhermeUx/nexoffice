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
