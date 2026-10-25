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

## 2026-10-25 — atomic wallet ownership store (stage 2)
- `apps/api/src/personal-us-wallet-binding-store.ts` implements transactional consumption of a verified challenge and binding insert with owner scope, `SELECT ... FOR UPDATE`, nonce/message digest checks and audit events in one transaction. It includes owner-scoped revocation. No HTTP route or shared/business DB import is permitted.
- `scripts/smoke-nex-personal-us-wallet-binding.mjs` exercises compiled store behavior with a **mock database only**: wrong owner, message tampering, invalid signature, wrong origin, successful binding, replay refusal, revocation and simulated unique-address collision rollback.
- SQL review file checks `current_database()` matches `nex_personal_us` (or `nex_personal_us_...`) before any DDL. Existing Nexa or NexOffices databases must never be used.
- The SQL schema remains **REVIEW ONLY**, not provisioned and not included in migrations. Real PostgreSQL multi-client contention tests, RLS role/policy review, verified EOA/EIP-1271 crypto, stable dedicated US identity and US Privy project are required before any binding endpoint or real wallet creation. No server-facing method is active.
- The separate Nex Personal P0 base PR #86 currently has unrelated DocWallet/NextGen/onboarding/product-discovery smoke checks failing; those should not be "fixed" in the US wallet PR by changing BR/business features.

## October 25, 2026 — dedicated PostgreSQL testing and Privy candidate binding
- Repaired the previously corrupted review-only SQL file (one transaction and one copy of each table). Do **not** apply it to existing NexOffice, Nexa, or Brazil databases.
- CI integration now invokes `scripts/smoke-nex-personal-us-wallet-postgres.mjs` against a disposable local PostgreSQL 16 server. It first attempts the SQL in the CI NexOffice database and must observe rejection with no schema leakage. It then creates `nex_personal_us_ci` and exercises real Postgres DDL, RLS configuration, concurrent challenge consumption, uniqueness, failure rollback, audit trails and revocation.
- `issuePersistedUSWalletChallenge` creates and persists a US EIP-4361-style challenge after locking the authenticated, active US profile, with at most 3 simultaneous unconsumed/unexpired challenges per owner. It also writes an issuance audit event transactionally.
- `bindVerifiedUSPrivyWallet` persists a wallet only after a **trusted server-provided evidence callback** passes dedicated Privy app/project, US subject, user control, recovery and zero delegated-signer gates; it is still a contract only and makes no Privy provider calls. Separate database uniqueness constraints and audit events apply. No public route, integration keys, auth tokens or wallets are activated.
- PostgreSQL tests use a synthetic verifier/evidence callback, not real EOA/EIP-1271 signature verification and not live Privy JWT/provider verification. A valid simulated signature test cannot justify public onboarding.
- Current source is a draft stacked PR, and the latest test results must be inspected per commit. Independent legal/security, identity, provider and staging approvals are required before live US registration or movement of funds.

## October 25 — US server verification boundary and Maya Trust stage 1
- `apps/api/src/personal-us-privy-session.ts` defines the strict, dedicated US Privy app token verification contract. It requires an official **server-side** `verifyAccessToken` SDK implementation injected by the future US service, a configured verification key, matching application ID/issuer, verified session and token expiration. JWT parsing alone is never accepted. No access tokens are persisted or forwarded to Maya.
- `bindPrivyUSAfterServerSession` composes that verified session with a trusted US identity-store lookup and a server-fetched embedded-wallet record; it refuses any cross-user or cross-project binding before calling the atomic wallet-binding store. Tests use **mock official SDK callbacks** and **synthetic** Privy wallet data. Real provider authentication is NOT claimed.
- `apps/api/src/personal-us-agentic-trust.ts` is an isolated read-only policy contract for future Nexa Agentics US adaptation. Requires an authenticated US session, same-owner verified unrevoked wallet binding, explicit short-lived consent (maximum 15 minutes), exact native Polygon USDC token, trusted server-chain provenance and a recent read (maximum 2 minutes). Outputs do **not** combine crypto with cash, operational ledger or net worth. All signing, trading and money movement remain denied.
- This Trust module is a **pure reference policy** and has no routes, persistent consent grant/endpoint, on-chain RPC service or connection to Agentics PR #172. Do not treat arbitrary JSON with `verifiedByUSServer:true` as proof; all facts must originate from trusted backend adapters/database before authorization can be considered. The backend implementation is not released.
- Signature input validation now bounds signature length and permits variable-length ERC-1271 candidate signatures while requiring 65-byte EOA signatures after a trusted verifier establishes the signature kind. **A real EOA/EIP-1271 cryptographic verifier still needs audited software and integration tests.**
- CI includes `scripts/smoke-nex-personal-us-privy-session.mjs` and `scripts/smoke-nex-personal-us-agentic-trust.mjs` plus the already-installed disposable PostgreSQL 16 checks.

### Review-only viem verifier adapter (October 25)
- `apps/api/src/personal-us-wallet-viem-verifier.ts` adds a typed adapter for a future **audited** viem Polygon client: it checks Polygon chain ID before and after verification, rejects malformed/signature-too-long requests, recovers normal EOA signers via audited `recoverMessageAddress`, and handles **deployed** ERC-1271 wallets using viem `publicClient.verifyMessage`. It denies unknown networks and undeployed smart-wallet signatures rather than treating them as EOA.
- The viem dependency/client is **NOT installed or instantiated in the US service**. All tests use synthetic stubs; this is not real production cryptographic verification and it cannot enable wallet linking.
- `scripts/smoke-nex-personal-us-wallet-viem-verifier.mjs` checks correct branch selection, mismatched owners, ERC-1271 refusal, RPC failure and chain drift; real local-chain 1271 contracts and cryptographic EOA test vectors remain a separate acceptance gate.

## 2026-10-25 — persistent, revocable Maya permissions in dedicated USA PostgreSQL
- The new **review-only** `docs/sql/nex-personal-us-agentic-consent-review-only.sql` has an explicit dedicated-US-database preflight and a single FORCE-RLS table `nex_personal_us.wallet_agentic_read_consents`. No RLS policies, broad grants, or automated migrations; all deployments remain disabled.
- `apps/api/src/personal-us-agentic-consent-store.ts` creates a scope-limited `wallet.read.polygon_usdc` authorization after a trusted server-only explicit-gesture verifier confirms the same subject and wallet binding. The approval reference is unique (anti-replay), the permission expires after **10 minutes**, and at most **three** active permissions per linked wallet are allowed. Both authorization and revocation create audit events transactionally.
- `scripts/smoke-nex-personal-us-agentic-consent-postgres.mjs` tests real PostgreSQL 16 in the disposable CI USA database: refuses migration on NexOffice, validates FORCE RLS, wrong-owner refusal, fake/stale approval, evidence reuse rejection, active-consent cap, one-time revocation and read-only Trust denial after revoke.
- No web/mobile consent endpoint is connected. A client-provided boolean or self-asserted evidence is **not** a trusted user authorization. A future verified USA identity session and server-side gesture challenge must be implemented before activation.
- Access grants never include permissions to execute, sign, send, trade, or delegate. Privy verification with locally generated test JWTs is not proof of a live USA Privy account.

## October 25 — real deployed ERC-1271 candidate in local CI (awaiting result)
- `scripts/smoke-nex-personal-us-erc1271-local.mjs` compiles a **minimal local Solidity ERC-1271 test wallet**, deploys it using only disposable Ganache test funds on chain ID 137, checks EIP-191 message hashing and the ERC-1271 **exact** `0x1626ba7e` magic response via read-only `eth_call`, and exercises the existing US viem verifier adapter.
- Tests positive authorized EOA signer, unauthorized EOA signer, message tampering, wrong chain and variable invalid contract-signature lengths. Only throwaway keys and a local RPC at 127.0.0.1 are used.
- `us_wallet_erc1271_local_chain` is a **new separate GitHub Actions job**, installing pinned test dependencies only (viem 2.57.10, solc 0.8.30, Ganache 7.9.2). It does not change app runtime, lockfiles, Privy keys or any production chain.
- A green EOA/Privy CI on earlier commits does **not** make this newly added ERC-1271 case green. Inspect its latest job conclusion. Success on a local toy ERC-1271 is not equivalent to independent audits and compatibility validation across major real wallet implementations, nor does it activate any wallet-binding HTTP endpoint.
- This test intentionally uses an EIP-1271 `readContract` method rather than automatic EIP-6492 counterfactual verification. Support for undeployed wallets, delegated actions and transfer methods remains explicitly excluded.

## 2026-10-25 — authoritative server-side Maya read authorization (stage 3, review-only)
- `apps/api/src/personal-us-agentic-server-read.ts` was introduced to **load all ownership and consent facts directly from the isolated Nex Personal USA PostgreSQL schema** before invoking any trusted Polygon USDC observer. It does not accept browser-supplied ownership, consent flags, RPC URL or chain observations, and it does not call Nexa Agentics PR #172.
- A single SQL transaction locks US profile, wallet binding and explicit read consent using `FOR SHARE` until the USDC observation is validated. This serializes concurrent wallet/consent revocation with an in-flight read. The SQL transaction has no writes; PostgreSQL cannot combine row-locking `FOR SHARE` with `BEGIN READ ONLY`.
- The resulting read delegates to `evaluatePersonalUSAgenticRead` for native Polygon USDC, trusted origin, timestamp freshness and scope. It returns a raw wallet USDC balance **only when authorized**; all denials return no wallet address or balance and all decisions set execution false. This balance is never combined with bank assets, deposits or ledger totals.
- The PostgreSQL CI smoke has been extended to verify valid same-owner reads, blocked other-user RPC reads, rejection of wrong chain, revocation blocking while a protected read is in flight, and denial after consent or wallet revocation.
- This remains a **review-only module** with injected trusted server adapters: no HTTP route, user-facing Agentics permissions, deployed US database, official Polygon RPC service, Privy user wallet activation or agent signing. Until the newest CI completes successfully, this specific change is not homologated.

## 2026-10-25 — native USDC server reader and bounded RPC timeouts (review-only)
- `apps/api/src/personal-us-polygon-usdc-reader.ts` defines a **strict, server-injected PublicClient** reader: Polygon chain ID 137, Circle-native USDC contract `0x3c499c542cef5e3811e1192ce70d8cc03d5c3359`, `balanceOf(address)` only, six decimal places, fixed observed block, `uint256` validation, chain checked before AND after read. Bridged USDC.e is explicitly excluded. The address is corroborated by Circle's official Polygon support list.
- `apps/api/src/personal-us-agentic-polygon-read.ts` composes this fixed observer with `assessServerUSAgenticRead` so a read can only return a USDC amount after the owner and grant were verified directly in the dedicated USA PostgreSQL transaction. It is an **internal contract**, not a route.
- `assessServerUSAgenticRead` now bounds PostgreSQL lock waits (5 seconds), SQL statement time (8 seconds), and provider read wall-clock time (default 6 seconds; hard maximum 8 seconds), passes an `AbortSignal` to the trusted adapter, releases locks on timeout and never releases a late balance. Completion time is checked again against consent expiry. No signing/transfer/delegation.
- Tests include a pure fake PublicClient to enforce contract/chain/block/uint256 boundaries, plus disposable PostgreSQL compositions checking owner denial before RPC, revocation, consent expiry during slow RPC and abort/timeout.
- The live Polygon RPC client, USA auth and public API are **NOT** configured; this module is not authorization to deploy or interact with customer funds. This latest change must receive a green CI before homologation.

## October 25 — physical USA DB fence on all wallet and Maya mutations
- New `apps/api/src/personal-us-database-scope.ts` centralizes `SELECT current_database()` preflight, permitting only the dedicated Nex Personal USA database naming pattern. The assertion runs inside each transaction **before all wallet owner, challenge, binding, consent and security event queries**. This protects runtime against accidental injection of a Brazil/NexOffices pool independently from the migration guards.
- The wallet transaction wrapper now fences challenge issuance, EOA/ERC-1271 binding, Privy embedded-wallet binding and revocation. The Maya consent transaction wrapper similarly fences authorization/revocation, and the Maya server read uses the same shared check.
- Privy wallet evidence retrieval was moved inside the fenced transaction, **after the physical DB assertion**, ensuring a foreign pool does not trigger even a provider-side wallet-evidence lookup.
- Unit/mock and disposable PostgreSQL tests now deliberately inject the `nexoffice` database and assert refusal, zero nonce consumption, zero bindings/events and zero Privy provider wallet lookups. These are tests only, not changes to operational databases.
- This DB-name defense is additive: US IAM/database-role isolation, RLS, strong auth, provider SDK validation and cryptographic ownership verification remain mandatory before any public route is enabled. Pending newest CI, none of these changes is homologated.
