# NexOffices USA — CI triage (2026-10-26)

Scope: PR #91 `feature/usa-localized-preview-20261024`, head `9200bb66d7a33e424109d0b1732303d27ed78eec`.

## Status

- USA localization guard, isolated browser QA, identity/regional persistence QA and Postgres RLS QA: **PASS**.
- Four shared-product workflow checks: **FAIL**.
- Comparison `main...feature/usa-localized-preview-20261024` does **not** list the BR components or failing smoke scripts below as changed files. This supports treating these findings as shared-product baseline debts rather than USA localization changes, but does not by itself prove their historical cause.

## Verified failures (exact CI assertions)

| Workflow | Assertion | File to inspect |
| --- | --- | --- |
| NextGen Financial Engine V1 | `missing practical UX: Pix conectado ao seu financeiro` | `apps/web/src/FinancialEngineCollectionsCenter.tsx` vs. `scripts/smoke-nextgen-financial-engine-v1.mjs` |
| Receiving Account Onboarding V1 | `missing onboarding copy: Recebimento Pix` | `apps/web/src/ReceivingAccountOnboardingBridge.tsx` vs. `scripts/smoke-receiving-account-onboarding-v1.mjs` |
| DocWallet Workspace Experience V1 | `DocFlow visible` | Inspect the DocWallet workspace contract and rendered UI condition |
| Product Discovery Onboarding V1 | `missing capability tile: Pergunte à empresa` | `apps/web/src/ProductDiscovery.tsx` vs. `scripts/smoke-product-discovery-onboarding-v1.mjs` |

## Release gates

1. Diagnose each shared-product assertion against current BR product UX requirements before editing production-facing copy or disabling any assertion.
2. If a label was intentionally changed, update the documented BR product contract **in a separate approved BR workstream**; if a feature disappeared unintentionally, restore and test it there. Do not mask the failure in USA CI.
3. Preserve USD/en-US modules and preview isolation without changing PIX, provider contracts, login, migrations, or Brazilian clients.
4. Do not merge, deploy, switch payments on, or process real financial actions as part of this USA PR.
5. Recheck the exact head-SHA workflows after any isolated USA changes. Report the four unrelated failures separately until independently resolved.

This file is diagnostic evidence, not a declaration that the shared-product workflows are fixed.
