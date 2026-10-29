# Nexa PJ desktop pilot: executable acceptance boundary

Status: **NOT AUTHORIZED FOR RELEASE**. Scope: isolated branch / draft PR #85. No production deploy, no real money, and no modification of PF users or standalone NexOffice.

## Current verified reality
- In the PJ-branded build, `main.tsx` renders `NexaPjAccessGate`, not the authenticated ERP tree.
- Generic `/v1/platform/handoff/consume` belongs to NexOffice and does not establish legal authority over a Nexa merchant.
- Browser token/workspace keys are namespaced separately for the PJ variant.
- Nexa backend PR #183 offers a **read-only** `GET /api/v1/merchant/pj-handoff-preflight`, not SSO or financial authorization.

## Pilot acceptance tests (must be evidence-backed)
1. A verified PF representative and approved PJ must be bound to precisely one approved merchant, legal authority proof and active NexOffice workspace membership.
2. Nexa's trusted backend generates an opaque code with issuer, audience, purpose, merchant/representative/workspace binding, expiry and durable hash. No signed-in URL parameter or generic NexOffice token substitutes for this.
3. NexOffice redeems that code **server-to-server**, one time only, with atomic replay protection. Reject missing/mismatched company, wrong recipient, revoked membership, expired/reused code and unknown issuer.
4. After a successful exchange, issue only a workspace-scoped **nonfinancial** ERP session. Revalidate membership at sensitive API boundaries and after a switch.
5. Browser A→B→A rapid workspace switching must not render stale A/B ERP response data.
6. Negative scenarios (anonymous, revoked user, foreign workspace, wrong representative, replay, expiry, malformed data, backend unavailable) must fail closed.
7. Verify the actual desktop with a synthetic or specifically authorized pilot tenant: command, CRM, finance ERP, documents, seven agent directory and office 2D work without real financial credentials.
8. BRL/USDC balances, Pix, on-chain sends, wallet provisioning and treasury must remain disabled until distinct bank and provider controls pass; never infer authorization from UI preflight flags.
9. Automated checks must pass on the exact release HEAD; record the GitHub run and manual browser evidence before converting a draft PR to release.
10. Original NexOffice, Nexa PF and Nexa Global must pass regression checks without merged config or session keys.

## Release decision
Do **not** change `main.tsx` to mount the PJ ERP from `appRequested`, a generic handoff, the presence of a local token, a client flag or a direct URL. Only replace the current gate after the dedicated backend-authenticated handoff and negative E2E tests have landed in both repositories.

Maintain zero production deploys and zero real financial side effects until approved evidence exists.
