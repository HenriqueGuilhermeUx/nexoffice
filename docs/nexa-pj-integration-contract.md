# Nexa PJ integration contract — isolated first increment

Tracking: [#83](https://github.com/HenriqueGuilhermeUx/nexoffice/issues/83)

## Separation of concerns
- NexOffice stays the system of record for CRM, ERP, tasks, documents and other office modules.
- Nexa stays the system of record for balances, wallet/Privy, Pix, USDC, payment execution and transaction history.
- Brand configuration only changes display. It **must not** modify API hosts, session storage, permissions, workspace membership, or authorization.
- The `resolveBrand` helper is not wired to `main.tsx` or `App.tsx` in this increment; both NexOffice standalone and Nexa production UI are unchanged.

## Deployment facts verified on 20 October 2026
- Render staging web `nexoffice-staging`: main, last observed live commit `ac1621a`.
- Render staging API `nexoffice-staging-api`: main, last observed live commit `ac1621a`.
- Staging Postgres `nexoffice-staging-db` exists, but real persistence has **not** been verified.
- Frontend `apps/web/src/api.ts` stores the existing session under `nexoffice.token` and `nexoffice.workspace`; never treat these as Nexa credentials.
- The main app is selected with `?app=1` or a platform handoff; root landing is public.
- API `/v1/workspace` PATCH persists business workspace metadata; business profile code uses `getBusinessProfile`/`upsertBusinessProfile`. Verify both after reload before enabling Nexa PJ.
- Live GitHub/Render status does not prove all business modules are functional or deployment safe.

## Future authenticated handoff — required before routing real users
1. Nexa backend validates existing Nexa session and verified enterprise entitlement.
2. User deliberately selects a company; backend resolves tenant mapping `nexa_company_id -> nexoffice_workspace_id`.
3. NexOffice backend validates server-to-server signed assertion with audience, issuer, short expiry, one-use nonce and workspace membership.
4. Exchange that assertion over a same-site POST/code redemption flow, never in a URL. Establish HttpOnly Secure SameSite session cookie (or another equally protected scoped session).
5. Backend always authorizes every request against current workspace membership; never trust `x-workspace-id` without this check.
6. Explicit logout, expiry, session revocation, company-switch invalidation, idempotency, audit log and cross-tenant negative tests.
7. No wallet or payment signing privileges travel with the NexOffice session.

## Acceptance gates before wider changes
- Determine the canonical NexOffice 6.0 public, app and API endpoints, database mapping and live release commit.
- Reproduce business profile create/edit/reload/relogin on test workspaces; compare database record before and after each step.
- Verify profile fields do not get replaced by empty or stale browser state.
- Test all existing NexOffice modules, cross-tenant read/write denial and Nexa /pj existing flows.
- Add Nexa visual assets and shell only to separately verified Nexa branded route.
- Never auto-deploy or merge this branch; PR review + green smoke tests precede deployment.
