# Nexa PF · Belvo sandbox-only account & statement read model (2026-10-28)

## Goal
Show fictitious, real-provider-returned account **demo** information in the Nexa PF invite-only Premium command screen. This is not customer banking, production Open Finance, real cash or a claim of production balance accuracy. No auto connection, transaction initiation, asset mixing or database ingestion.

## Gate
- `BELVO_ENV=sandbox`, `NEX_PERSONAL_PREVIEW=true`, `BELVO_SANDBOX_ENABLED=true`, and **explicit** `BELVO_SANDBOX_WIDGET_ENABLED=true` plus all pre-existing widget/fixture/terms/webhook checks.
- Signed-in allowlisted user with an activated PF profile. GET `/v1/personal/belvo-sandbox/demo-data` rate limited to three requests per ten minutes per authenticated user on each preview instance.
- User must have a proof linked to their own PF owner & attempt, `verification_status=verified_authorized`, timestamp within 15 minutes. Even then, request **revalidates link and consent live with Belvo**, requiring the mockbank, exact opaque external ID, `AUTHORISED`, unexpired consent with BOTH ACCOUNTS and TRANSACTIONS permissions.
- A revocation or failure returns `consent_recheck_required` and suspends any prior proof. Provider/network errors fail with sanitized 502 and no bank details.
- Only `GET https://sandbox.belvo.com/api/accounts/?link={linkId}&page_size=100` and `GET .../api/transactions/?link={linkId}&page_size=100` after consent. No POST, PUT, DELETE, refresh, background collection, webhooks as authorization, token exposure, tenant mixing or DB write of financial records.
- Page must be complete (count equals returned rows, next null, at most 100), every account/transaction must have the exact requested link and matching mockbank institution; foreign or incomplete records block the entire response.
- Browser gets only **allowlisted** fields: demo account UUID/category/balance-type/BRL cents and collection date, and transaction UUID/category/linked demo account UUID/BRL cents and booked date. Account number, agency, public ID, user name, transaction description, CPF, secret, refresh token and raw Belvo response never returned.
- Account is represented as **asset, liability or unknown**; never included in Nexa verified bank account holdings, user wealth or Wallet balances. No overall total is supplied. Currency not BRL or values with more than two decimals are not rounded or converted: displayed as unavailable, rather than fabricated.
- UI section is labelled **DEMONSTRAÇÃO, dados fictícios, fora do seu patrimônio** and only offers the read action when consent is recently verified and widget is explicitly enabled. Prior sandbox status labels remain.
- Excludes actual investments: accounts of category `INVESTMENT_ACCOUNT` are labelled as an account type, not proof of investment holdings. Separate investment APIs/provider permissions need a future phase.

## Current release limits
This functionality is **flag-OFF** in the existing Render beta. We have only validated the sandbox API secret pair using a GET institutions probe. No mockbank E2E consent has been executed yet because the approved fictitious identity, terms URL and dedicated webhook bearer remain to be configured in the Belvo dashboard and PF Render preview. Do **not** invent CPF or use a real client's details, do not disclose credentials, do not put `BELVO_SANDBOX_SECRET_*` in front-end variables.

## Support and evidence
- Belvo pagination and `link` filtering: https://developers.belvo.com/pt-br/developer_resources/resources-pagination-and-filtering
- Accounts OFDA Brazil: https://developers.belvo.com/pt-br/apis/belvoopenapispec/accounts
- Transactions OFDA Brazil: https://developers.belvo.com/pt-br/apis/belvoopenapispec/transactions/listtransactions

## Next
When the authorized mockbank fixture + callbacks are available, run E2E widget, webhook, consent and read-model tests in beta. Keep separately auditable demo data source; only after production compliance, validated tenant isolation and an explicit rollout should a separate, production-grade Open Finance adapter feed real holdings.
