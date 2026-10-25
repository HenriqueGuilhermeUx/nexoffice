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

**Release gate:** no NexOffices USA public staging URL is validated yet. Do not claim the artifact is already deployed. Publishing requires an isolated site configured to serve `dist-usa`, explicit build-source mapping to this US feature branch, no inherited Brazil secrets, external URL verification, and approval after all required US QA. The original NexOffices web build and four preexisting Brazilian copy-assertion failures are distinct from this standalone package. Keep PR #91 draft, and never resolve those failures by relaxing Brazilian tests without a separate root-cause review.
