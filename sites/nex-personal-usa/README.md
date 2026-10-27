# Nex Personal USA — Netlify public preview

This directory is a standalone Vite entry that **reuses** the reviewed US-only
Nex Personal components from `apps/web/src/NexPersonalUSA.tsx`. It does **not**
import the NexOffice Brazil application entry, shared backend routes, browser
auth tokens, banking adapters, or API credentials.

## GitHub → Netlify (one Git-connected site)

Existing empty Netlify project: `nex-personal-usa`, team `henriqueguilhermeux`.
Connect GitHub repository `HenriqueGuilhermeUx/nexoffice` using the Netlify UI
(Project configuration → Build & deploy → Continuous deployment → Link repository).
Use the isolated branch `feature/nex-personal-usa-crypto-agentics-20261024`
as the initial publishing branch, **not `main`**.

For a monorepo, set **base directory blank (repository root)** and **package
directory `sites/nex-personal-usa`**. Netlify then discovers this
`netlify.toml`; it runs `npm ci`, builds this Vite entry only, and publishes
`sites/nex-personal-usa/dist`. If package-directory selection is unavailable,
set the same build command and publish directory explicitly in UI; do not
connect an existing Brazil site to this branch.

Build locally from repository root:
```bash
npm ci
npm exec -- vite build --config sites/nex-personal-usa/vite.config.ts
```
No `.env` or real credentials are necessary for the public preview.

## Backend and economical isolated data architecture

- Stage 1: **Netlify static CDN**, no database and no backend at all. Display
  only the existing browser-local read-only preview. No public financial login.
- Stage 2 (only after dedicated USA auth and security gates): reuse the US-only
  NestJS modules in the existing `nexoffice` repo, but deploy a separate USA
  API runtime and dedicated database `nex_personal_us_*` with a service-only
  PostgreSQL role, RLS and strong server verification of the dedicated US Privy
  project. The USA API has no direct connection to any Brazilian Postgres DB.
- Keep one pooled PG connection pool in the **USA backend**, not in Netlify
  browser code. Use low connection limits, idle suspension where compatible
  with required latency, and no live brokerage/RPC without approval.
- The isolated Neon PF project `orange-fog-28021931` is for Brazilian PF
  homologation and is **not** a shared production database for USA.
- No `DATABASE_URL`, Privy verification keys, service role, or wallet
  private keys may be compiled into Vite `VITE_*` variables.
- The review-only US SQL and authorization modules are deliberately not
  migrated or exposed on this public site.

Do not change the current Netlify Brazilian sites, merge draft USA PR #90,
deploy a Brazilian shared API, or publish banking/crypto transaction endpoints.

## Publishing status

The Netlify project can exist without a deploy. Until GitHub is connected
and a build returns `ready`, do not claim the site is live. The .netlify.app
hostname is temporary and can be renamed after validation.
