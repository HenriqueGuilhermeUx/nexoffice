# Alternative Ventures USA — nexoffice localization preview

Date: 2026-10-24
Branch: `feature/usa-localized-preview-20261024`
Status: **Preview only — not released, not production-enabled, no US checkout/account activation**.

## Purpose

A safe first step toward the US edition: direct English-language positioning and product discovery, without substituting American currencies, regulatory claims or data providers in existing Brazilian workflows.

## Changes

- `/us` serves a standalone English product preview.
- Files: `apps/web/src/USPreview.tsx`, `apps/web/src/USPreview.css`.
- The existing entry point `apps/web/src/main.tsx` mounts the preview on that exact path only.
- Localized page title, metadata and `html[lang]` with cleanup on unmount.
- No calls to protected APIs, no user accounts, no pricing and no new form submission.
- Existing Brazilian routes, authentication, financial sources, app workflows, mobile screens, database and providers are untouched.

## Legal and regional boundaries

US accounting, sales tax, ACH, finance, banking and billing integrations are deferred. USD must not be substituted into Brazil BRL ledger.

## Verification and release gates

- [ ] Run existing lint, tests, typecheck, build and security checks on this branch.
- [ ] Confirm `/us` loads directly and after page refresh under Netlify or the deployed hosting setup.
- [ ] Smoke-test the existing default Brazilian landing, authenticated app and critical actions.
- [ ] Check mobile width 320–430px, tablet and desktop, keyboard navigation, contrast and screen reader semantics.
- [ ] Confirm US sales terms, privacy disclosure, trademark, support and commercial content with product owner.
- [ ] Enable US activation only after region-scoped auth, infrastructure, data residency and entitlements are validated.

**Do not merge, publish, or redirect Brazilian traffic automatically.**

## Operational browser-only demonstration (2026-10-25)

An English local-only task board was added to `/us`: a fictional action inbox, status changes, task creation and reset. No user, business or payment details are sent to the Brazilian API. This is not US accounting, taxation, billing or financial functionality. Separate preexisting Brazil UX contract test failures must not be silenced by this PR.

## Interactive preview inventory

- `/us` includes a browser-only task command center demo with fictional task creation, assignment, status changes, metrics and reset.
- This demo has no workspace authentication, persistent customer records, billing, banking, US tax handling or API calls.
- A full GitHub web build passes; preexisting smoke tests that assert Brazilian content remain separate work and must not be weakened inside the USA branch.


## Independent, deployable US-only static preview (no Brazil app bundle)

The USA branch now includes a **dedicated Vite entrypoint** at `apps/web/usa-preview/index.html`, with `apps/web/usa-preview/main.tsx` importing only the US interactive components. The standalone Vite config lives at `apps/web/vite.usa.config.ts`; it deliberately excludes the Brazilian application entrypoint and its router.

CI builds the standalone frontend with:

```sh
cd apps/web
npx vite build --config vite.usa.config.ts
```

This creates `apps/web/dist-usa/`. The USA browser workflow then tests the built standalone site in Chromium, examines its output for selected prohibited Brazilian integration strings and archives only `dist-usa/` as the short-lived `nexoffices-usa-standalone-preview` GitHub Actions artifact. The included `_redirects` is intended for a future **separate**, approved preview host; it does not change existing production URLs or deployments.

**Historical note (superseded on 2026-10-25):** no NexOffices USA public staging URL had been validated at this point. Publishing requires an isolated site configured to serve `dist-usa`, explicit build-source mapping to this US feature branch, no inherited Brazil secrets, external URL verification, and approval after all required US QA. The original NexOffices web build and four preexisting Brazilian copy-assertion failures are distinct from this standalone package. Keep PR #91 draft, and never resolve those failures by relaxing Brazilian tests without a separate root-cause review.

## USA staging status and scope — updated 2026-10-25

- **Actual staging service:** [nexoffices-usa-staging.onrender.com/us/](https://nexoffices-usa-staging.onrender.com/us/); Render static-site service `srv-dbf91u67bikc73ckmk4g` in Henrique's existing workspace (not Nexa Global).
- **Repository/branch:** `HenriqueGuilhermeUx/nexoffice` / `feature/usa-localized-preview-20261024`; `autoDeploy=no`. Build command uses `vite.usa.config.ts`, publishing only `apps/web/dist-usa`.
- The site serves a physical `/us/index.html` for Render compatibility; no Brazilian UI bundle, environment variables, accounts, payment providers or API endpoints are needed.
- **Last previously verified external smoke:** mobile 390px and desktop 1280px via the USA portfolio Chromium workflow; fictional tasks and CRM, no persistence or remote API calls.
- **Next demo increment in this PR:** a fictional document review queue with reviewer stages and a temporary activity list. It has no upload field, signature, legally binding approval, legal audit proof or external connection. Confirm exact-head CI and staging again before calling this increment deployed.
- **Not a US commercial release:** the app still lacks region-specific accounts, billing, tax, financial integration, compliance review, legal terms and commercial onboarding.
- **Brazilian CI debt:** [issue #96](https://github.com/HenriqueGuilhermeUx/nexoffice/issues/96) tracks four inherited legacy text assertions; they are deliberately not disabled or patched inside this USA PR.

### Staging update order

1. Build and pass `scripts/usa-preview-check.mjs`, `scripts/usa-browser-smoke.mjs`, and `scripts/usa-standalone-browser.mjs` for the **exact new US feature-branch head**.
2. Manually deploy **only** the isolated Render static staging site because auto deploy is off; confirm deployed commit SHA.
3. Validate `/us/` from outside Render in headless mobile and desktop browsers, including ephemeral document review activity and no external requests.
4. Keep [PR #91](https://github.com/HenriqueGuilhermeUx/nexoffice/pull/91) draft and the Brazil launch/merge entirely separate.
