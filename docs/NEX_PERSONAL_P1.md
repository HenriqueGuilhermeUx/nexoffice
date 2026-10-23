# Nex Personal — P1 without Belvo (isolated development branch)

## What is actually implemented
- Reuses the existing NexOffice users/password hashing/token sessions but creates a distinct PF profile, **without** creating a business workspace or touching existing PJ billing.
- User-scoped database schema and **additive** SQL migrations 046 + 047, with per-user financial snapshots, CSV/manual transactions, budgets, goals, wealth declarations, bill reminders, consent placeholders and audit.
- Standalone \`/personal\` React UI (not released to production): Today, Meu Dinheiro, Gastos, Metas & Contas, Patrimônio, Maya, Privacidade.
- Manual BRL accounts and explicit declaration of account balance, with visible **not bank verified** provenance.
- Manual transactions: optionally adjust declared account balance *only* with the explicit checkbox.
- CSV import: client-side preview of supported \`data;descricao;valor\` or comma-separated headers; max 250 rows per request and 350 KB per file in the UI. Expenses have negative amounts. Imported historic entries **never change** the current declared balance.
- Repeat imports deduplicate by owner, account, date, normalized description, amount and optional provider reference. Identical same-day charges can collide: the user must disambiguate via reference in an enhanced importer (not yet in UI), or add the second charge manually.
- Budget by category/month, manual goals with updates, assets and liabilities declared in BRL, monthly/quarterly/yearly/one-off due-date reminders.
- Maya deterministic questions with source-specific explanations; no external LLM, no paid financial guidance and no Pix.
- CI: Postgres migrations, existing smoke and Personal P0/P1 smoke for auth, cross-user financial privacy, import idempotency, updated balance, planning and Maya.

## Important accuracy boundaries
- \`availableMinor\` in the P0 overview is reserved for **verified connected providers**. Manual balances are returned separately as \`manualAvailableMinor\`, never passed off as verified funds.
- Declared wealth = declared manual cash accounts + assets − liabilities. It is partial, may not be current and must not be advertised as official net worth. Goals are not double-counted.
- \`spentThisMonthMinor\` reflects *only entered/imported expenses*; this is not a complete bank statement.
- The current rule-based Maya can answer spending, manual cash position, upcoming reminders and latest goal with caveats; it does not have autonomous access to external bank data or payment rails.
- Authenticated user-level filtering provides P1 isolation. Database RLS, secure httpOnly-cookie sessions, CSRF review, abuse controls, audit retention policy, account deletion workflow, and external provider secret storage require hardening **before** public release.

## No provider dependencies
- Belvo and Efí adapter types are defined, but not activated or credentialed.
- No user banking tokens, Pix initiations, accounts at financial institutions, credit underwriting, investments trades or external transfers.
- No imported data is shared with advertising partners. Partner offers require granular separate future authorization.
- No production DB change, merge or deployment. This is a **draft PR** feature branch.

## How to verify
1. Use **isolated disposable/staging Postgres** with migrations 046/047 applied, not production.
2. Node 24 + \`npm ci && npm run build\`.
3. Start API with external actions disabled; run \`node scripts/smoke-nex-personal.mjs\` and \`node scripts/smoke-nex-personal-studio.mjs\`.
4. Serve React with VITE_API_URL pointed at the isolated API and open \`/personal\`.
5. Test personal registration, account creation, manual transaction (with and without balance checkbox), CSV preview, budget alert, goal progress, bill reminders, and Maya Q&A.
6. Do not enable financial provider initiation or merge/deploy until complete privacy/security review and explicit release decision.

## Next build increments (without waiting for Belvo)
- Improve CSV mapping (additional Brazilian bank exports, OFX parser, stable transaction IDs, review-before-commit with explicit duplicate overrides).
- Month-over-month spend analytics, category editing bulk actions and data reconciliation.
- Family sharing with explicit delegated permissions, no implicit shared access.
- Planning simulator with income/expense coverage checks, credit details and investment portfolio import by file.
- Open Finance real connection is a later adapter activation, gated on credentials and consent lifecycle.
