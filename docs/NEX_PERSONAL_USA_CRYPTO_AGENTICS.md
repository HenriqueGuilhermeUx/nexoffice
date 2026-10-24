# Nex Personal USA — Crypto + Nexa Agentics integration (isolated draft, 2026-10-24)

## Delivery / current state
- New **`/personal/us`** (must set `VITE_NEX_PERSONAL_USA_PREVIEW=true`). Otherwise it shows a disabled message. Never changes the existing `/personal` flow, business apps, Nexa Wallet, Nexa Global, treasury or balances.
- US-first shell with Overview, AI Agents, Crypto Wallets and Marketplace; no fabricated data, no American bank/account service purported to be connected.
- Browser EIP-1193 wallets (official installed MetaMask/Rabby/Coinbase/Trust-compatible providers): direct user-requested account access, Polygon mainnet verification (chain 137), **read-only** native USDC `balanceOf(address)` through the injected provider. Address is visible locally; no database write, cookie, wallet proof or durable account association.
- Native USDC Polygon contract: `0x3c499c542cef5e3811e1192ce70d8cc03d5c3359`, 6 decimals. Never conflate with bridged USDC.e.
- Wallet requests go through a deterministic allowlist which forbids signing, transactions, chain switching, approvals, arbitrary `eth_call` targets, swaps and provider side effects. Errors/unavailable values stay unavailable, not 0.
- A local deterministic Maya review distinguishes token balance from bank deposits, exchange portfolio and ledger. No Nexa Agentics or LLM call occurs at this stage.

## Reuse audits / authorities
- Nexa Agentics source: **HenriqueGuilhermeUx/nexa-backend1 PR #172**, branch `feat/nexa-agentic-core-v1-20261013`, with Trust/policy, simulations, signed approval, read-only portfolio patterns. DO NOT touch PR #172, its deployment, Trust credentials or database.
- Wallet inbound source: backend `feat/nexa-global-walletconnect-inbound-v1` and mobile `feat/walletconnect-inbound-br-global-v1`. Wallet ownership proof uses a single-use signed challenge, origin/chain checks, expiry, owner-scoped unique bindings and audit. Implementation there remains independent.
- Privy/Nexa Wallet: user-specific embedded EVM wallet, independent authorization and verified Privy user/wallet association. Never copy Privy IDs, credentials or customer wallet accounts between Brazilian/Global and US contexts.
- US bank adapter will be **Plaid** (not Belvo) and requires its own consented data/identity space.
- Source product branch **nexoffice PR #86** is the base, but Brazilian flows remain unchanged.

## What this draft DOES NOT implement
- Privy embedded wallet creation, recovery, authenticated user linking, EIP-4361 ownership signature verification, EIP-1271 support or server persistence.
- Reown QR/mobile WalletConnect sessions, smart wallet links, address binding, USDC transfers or inbound transaction observation/reconciliation.
- Genuine US Open Banking connections, live Agentics tools, financial actions, crypto quotes, swaps, fiat on/off ramp or FDIC coverage.
- Any new US bank product, deposit account, custodial custody service, investment advice/trading or regulated financial distribution.

### Safe rollout sequence
1. **US identity and tenancy:** dedicated US environment, US auth and US Postgres, US-specific user terms and privacy/consent, clear regional segregation; delete and revoke workflows, audit/retention review. No US identities in production Brazilian workspace/account data.
2. **Privy embedded creation:** create a dedicated US Privy app/project. Use Privy's supported **client user-owned wallet onboarding** with authenticated user mapping and recovery flow. Server must verify identity token, wallet ownership and wallet ID/address association before storing bindings; idempotent one-wallet-per-owner policy and revocation. Never use an unrestricted server signing key as a substitute for user-owned control. Confirm Privy SDK version, policies and allowed US region.
3. **Verified external wallet link:** port audited SIWE challenge/verify semantics from Nexa inbound into a separate US service; persisted nonce hash, short expiry, atomic consume, chain, origin, EOA and contract-wallet support where approved, unique account binding and user-driven unlink. The current browser connection must never be mistaken for this verified link.
4. **On-chain read adapters:** Polygon native USDC, chain and address validation, RPC fallback, freshness/unknown states, sanctions/risk/KYT as applicable, non-additive balance display. Independent audit of other chains and tokens; protect wallet reputation and privacy.
5. **Agentics read integration:** dedicated signed cross-product adapter with service identity, no cross-database reads, scoped tool registry, US policies, authorization and deny-by-default. Avoid passing Privy secrets, banking tokens, wallet signing capabilities or financial PII into agent prompts. Reuse signed delegation/approval semantics only after the Trust CI is green and externally reviewed.
6. **Financial execution later:** explicit opt-in; KYC/KYT/AML and US federal/state legal evaluation; per-agent limits; user approval, two-person review where needed, immutable audit, idempotent outbox and reconciliation, kill switch, rollback and dispute flows. The current feature must stay read only until those gates are met.

## Safety / launch gates
- Separate environment: `VITE_NEX_PERSONAL_USA_PREVIEW=true` AND `VITE_NEX_PERSONAL_USA_PREVIEW_ORIGIN=https://<dedicated-usa-staging-host>` **only on dedicated staging**. Both values and the browser's actual origin must match. Do not set either on NexOffices or Brazilian production.
- This branch is based on PR #86, intended to become a **draft PR stacked on the Nex Personal feature branch**, with NO merge/deploy or production data migration.
- Run `node --experimental-strip-types scripts/smoke-nex-personal-us-crypto.mjs` (Node 24 per repository), `npm ci`, `npm run typecheck -w @nexoffice/web`, `npm run build`; review GitHub CI and independent manual browser test on Polygon. No real transfers during QA.
- Confirm FinCEN/state regulatory classification, non-custodial control model, issuer/USDC disclosures, taxes, financial/privacy notices, privacy-preserving wallet linking and risks before any public USA marketing or live wallet onboarding.
- Inbound fee proposal **0%** for supported wallet-to-wallet USDC transfers in Nexa Brasil/Global. US fee policy has not been authorized; do not advertise a live free US transfer. Network gas always separate.

## 2026-10-24 — implementation follow-up (draft only)
- The browser EIP-1193 USDC snapshot can now be explicitly shared with Maya as **historical, in-session, local data only**. No automatic background data transmission to agents or persistence occurs. A revoke action clears the shared snapshot; a new connection/refresh invalidates it.
- Async wallet reads re-check the address and chain after a network response; account/chain changes invalidate pending reads. Raw RPC `eth_call` is restricted to native Polygon USDC `balanceOf` with no additional transaction parameters.
- `apps/api/src/personal-us-wallet-ownership.ts` prepares EIP-4361 challenge construction and fail-closed assessment. **No route**; real secp256k1/EIP-1271 verifier and atomic nonce consumption are still REQUIRED.
- `apps/api/src/personal-us-privy-onboarding.ts` validates candidate evidence from a dedicated US Privy project (authenticated subject, embedded EVM wallet, user control, recovery, no delegated signers). **No Privy SDK calls or wallet creation**; authoritative provider-side evidence and account binding remain REQUIRED.
- `docs/sql/nex-personal-us-wallet-identity-review-only.sql` describes a physically isolated US identity/wallet schema with RLS FORCE and no grants/policies. **It has not been executed** and is deliberately not part of automatic migrations.
- `scripts/smoke-nex-personal-us-wallet-ownership.mjs` tests forgery, replay window, wrong identity/origin, missing signer verification and Privy cross-project evidence; the mocked signature verifier in these tests is explicitly NOT an EOA verifier.

### Required for Privy USA activation
1. Create a **dedicated US Privy app/project**, configure allowed origins, recovery and user-controlled authorization keys/policy in the Privy dashboard. Do not reuse the Brazil/Global application's keys or customer identities.
2. Establish a separate US identity provider and database environment. Verify Privy auth tokens **server side**, associating the Privy user and wallet only with an authenticated US subject.
3. Integrate the vetted current Privy React SDK using `useCreateWallet` under explicit user action, and only after matching an existing wallet to avoid duplicate onboarding. Confirm recovery policy and SDK version against official documentation.
4. Build EOA `personal_sign`/EIP-4361 or EIP-1271 verifiers in a dedicated server module. Transactional nonce consumption and a globally unique wallet-binding constraint must succeed before showing an external wallet as linked.
5. Obtain US legal/compliance/security signoff prior to public onboarding or deposit services.

## Multi-wallet UX / latest isolation
- Supports EIP-6963 discovery with explicit wallet selection and EIP-1193 legacy fallback. Wallet extension names/RDNS are unverified self-reported labels. The app does not render externally supplied wallet icons or silently choose the first extension.
- CI checks include `scripts/smoke-nex-personal-us-wallet-discovery.mjs` to reject untrusted announcement data and duplicate provider UUID replacement.
- The US preview remains frontend-only until independent US identity and server verification are ready. The exact-origin flag is a deployment gate, **not a substitute for authentication**.
- Failure in unrelated Nex Personal P0/F-Insight code can prevent CI; any branch-local fix must be reconciled with PR #86 after review without altering Brazilian production.
