# NexOffices USA — baseline CI separation (2026-10-25)

This note records **verified** failing checks for the isolated USA preview PR #91. The new US route is **not** released and is kept in a draft PR.

## What passed on the earlier USA head

The web build, USA localization guard, integration and most existing runtime checks passed on commit `ce5e82fab9de473322480f2d24707da755ae830f`.

## Four failing inherited Brazilian copy checks

| GitHub job ID | Script | Required legacy copy | Observed result |
| --- | --- | --- | --- |
| 121297437038 | `scripts/smoke-docwallet-workspace-experience-v1.mjs` | `DocFlow` visible | Missing |
| 121297436596 | `scripts/smoke-product-discovery-onboarding-v1.mjs` | `Pergunte à empresa` | Missing |
| 121297436779 | `scripts/smoke-nextgen-financial-engine-v1.mjs` | `Pix conectado ao seu financeiro` | Missing |
| 121297437181 | `scripts/smoke-receiving-account-onboarding-v1.mjs` | `Recebimento Pix` | Missing |

The assertion scripts have **identical blob SHAs in `main` and in this USA branch**, as verified through GitHub. The inspected Brazilian component files were also identical on both refs and lack the corresponding asserted strings:

- `apps/web/src/DocumentWorkspaceBridge.tsx`: `78d847c5f44adc85ee8ea6f82f4e42efed55d6bb`
- `apps/web/src/ProductDiscovery.tsx`: `19bcf5026774bac41036cf62850ae2709b045866`
- `apps/web/src/FinancialEngineCollectionsCenter.tsx`: `ee5e6ce2d928836f0c41ccbfff7545cc445cd4e1`
- `apps/web/src/ReceivingAccountOnboardingBridge.tsx`: `3555904e88eeb9960a115b17b2c518d6fa4a5a77`

The PR file list includes only the isolated USA pages, assets, routing gate, static checks and documentation. It does **not** modify the four Brazilian components or the four failing scripts. This is strong evidence of **baseline copy drift**, not evidence that the USA page caused these particular failures. However, the exact `main` workflow was **not executed** as part of this inspection; do not claim a new green baseline run.

## Safe resolution

1. Open a **separate Brazilian quality/UX issue or PR** for each mismatch, deciding whether current product labels or old assertions are authoritative; do not silently amend Brazilian copy or disable tests in PR #91.
2. Keep USA PR #91 draft and prevent merge while mandatory checks remain red.
3. Validate the USA route with real-browser QA, ensure it never calls Brazilian APIs or opens payment/login flows, and obtain a separate staging URL before public US launch.
4. Require exact-head CI green and manual preview review before any release.

No Brazilian production database, auth flow, customer account, payment rail or API is changed by this note.
