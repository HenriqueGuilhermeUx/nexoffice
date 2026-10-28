# Nexa PJ — ERP-only pilot release gates

## User acceptance evidence
On 2026-10-28, the project owner reported: "testado, abriu ok". This confirms that the application opened in the owner's own browser. It does **not** independently establish that registration, login, re-login, persistence, or module workflows were completed.

## Verified technical evidence
- Netlify Nexa PJ landing deployed on `trynexa.com.br/pj`, commit `bde54064b4c8a2d248bcc63b8f109864728bace7`.
- Render dedicated ERP frontend deployment `dep-dbgiojegekts73ep0t10` is live; opens at command center.
- Dedicated ERP API deployment `dep-dbghk9gu01pc73eae36g` is live.
- GitHub Actions CI run `40598651207` passed (build, integration, public-endpoints jobs).
- Production preflight `scripts/smoke-nexa-pj-live.mjs` is intentionally read-only.
- Isolated registration, login and cross-workspace isolation were tested in CI with ephemeral PostgreSQL, not with a live commercial account.

## Commercial rollout
1. ERP-only, limited pilot; position CRM, agenda, ERP, documents, operations and command center as available.
2. Display banking/Conta Nexa as under habilitation; no real BRL/USDC balances, Pix, swaps, trades or financial capabilities in this ERP until partner, KYB, user binding, SSO and authorization are validated.
3. Keep `/merchant` and original Nexa Wallet/PF/Global/legacy customer data untouched.
4. Collect feedback from an authorized pilot user with their own account, without handling or recording passwords.
5. Verify *after explicit pilot consent*: registration, first login, workspace creation, logout, fresh login, membership persistence, cross-tenant negative permissions, one CRUD path within ERP. Do not run synthetic production registrations without an approved retention/cleanup plan.
6. Do not mark end-to-end production authentication as complete until these real-user checks are observed and documented.

## Rollback
- Frontend only: redeploy last known-good Render commit. Backend and database do not need to change.
- Landing only: revert the targeted Nexa PJ `pj.html` commit on `nexa-site` if required.
- Do not revert shared NexOffice, wallet or merchant services, and never replay financial events.
