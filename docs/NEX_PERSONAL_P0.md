# Nex Personal — P0 technical foundation (isolated branch)

## Confirmed code reuse
- Backend: existing Fastify API, \`authenticate\`, token sessions and \`users\`. PF registration does **not** create a NexOffice business workspace.
- Persistence: existing versioned Postgres migration runner; additive migration \`046_nex_personal_foundation.sql\`.
- Interfaces: shared \`@nexoffice/integrations\` package for provider-neutral contracts; concrete Belvo/Efí classes are deliberately unconfigured.
- Frontend: existing React/Vite deployment, separate \`/personal\` entry with standalone styles. Existing Business shell, billing and marketing site are left alone.
- CI: PR build, Postgres migration, personal financial isolation test and existing operational smoke tests.

## Boundaries
\`\`\`
users + auth_sessions (shared human identity only)
    |                         |
workspaces (business)        nex_personal.profiles
business ledger             nex_personal.connections / consents
business finance            nex_personal.accounts / transactions
    |                         |
    +--- shared contracts, audit patterns and infrastructure ---+
\`\`\`

Financial records must always be accessed with the authenticated \`owner_user_id\`.
Neither a business workspace ID nor a business membership grants Personal data access.
A user can own a business workspace without Personal being activated, and vice versa.
No PF records are copied to or from company ledgers.
The per-user profile is the household groundwork; invitations and delegated household access are not yet enabled.

## Read-only API
- \`POST /v1/personal/auth/register\`: personal registration using existing auth primitives.
- \`GET /v1/personal/me\`: personal activation status.
- \`POST /v1/personal/activate\`: opt-in for existing human identities.
- \`GET /v1/personal/providers\`: explicit pending provider status; **no connect action**.
- \`GET /v1/personal/overview\`: aggregates only fresh connected BRL accounts; no synthetic balances. Incomplete snapshots return \`null\`.
- \`GET /v1/personal/accounts\`, \`GET /v1/personal/transactions\`, \`GET /v1/personal/consents\`: per-owner data only.

No payment initiation, brokerage, credit origination, consent grant or external bank call exists in this phase.
Provider status must not be interpreted as a real institution connection.

## Next steps (not completed)
1. Provider credentials/contract approval and sandbox connectivity; no browser-side tokens. Perform redirect/callback verification and validate actual scope coverage from Belvo.
2. Consent capture from real Open Finance authorization, provenance, expiration, revocation and deletion workflow; partner offers require a distinct later opt-in.
3. Reliable ingestion worker for sync, dedupe, consent enforcement, rate limits and stale-data marking; encrypt any provider secrets with a separate key store.
4. Payments through Efí only when permitted for PF, with preflight, strong user approval, idempotency, reconciliation, dry-run and kill switch. Never route personal funds through NexOffice accounts.
5. Investment/credit and wealth views only with confirmed provider data and regulated partners where needed.
6. Threat modeling, scoped service credentials, MFA/step-up for transfers, data-retention/deletion, production-grade browser session security, privacy/legal review and end-to-end mobile UX.

## Isolation and release gates
- Do not reuse or migrate business finance tables to PF.
- The read models in \`nex_personal\` have strict composite foreign keys for owner/connection and owner/account.
- No PF consumer endpoints run a \`workspaceContext\` or charge Business billing.
- DB access is application-scoped via \`authenticate\` + owner filters. Database-side row-level policies are **not yet enforced** and must be reviewed before broad production use or direct client-side DB access.
- Never seed sample balances in production or describe \`null\` as R$ 0.
- \`/personal\` is reachable only when this branch is built. No main merge or production deploy in this phase.
- CI verifies independent registration, unauthorized access denial, no hidden payment route and cross-user isolation using disposable Postgres rows.

## Local validation
Use Node 24, \`npm ci\`, \`npm run build\`, then apply existing migrations through 046 to a **disposable** local Postgres database, start the API and run \`node scripts/smoke-nex-personal.mjs\`.
Do not point test variables at production.
