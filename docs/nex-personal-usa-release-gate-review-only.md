# NexPersonal USA — release gate (review-only)

This checklist applies only to PR #90 and the USA branch. It does **not** authorize merge, production deployment, financial services, or changes to Brazil.

## Verified in repository (offline evidence only)
- [ ] Confirm the exact PR head SHA and all five principal CI jobs are green on that SHA; never substitute an earlier green run.
- [ ] Run the existing disposable PostgreSQL integration suite, including owner/consent revocation, restricted role, FORCE RLS, and failed cleanup cases.
- [ ] Keep `assessUSReadOnlyRuntimeCandidate` internal, without an HTTP route or public API binding.
- [ ] Confirm every status signal retains `operationalActivationApproved: false`, `externalAccessEnabled: false`, `financialExecutionAllowed: false`, and `agentSigningAllowed: false`.

## Independent deployment prerequisites (not proven by tests)
- [ ] Independently attest that the actual application, database, backups, logs and support subprocessors satisfy the selected US data residency/security requirements; configuration labels are not evidence.
- [ ] Provision a distinct US Privy app; verify live JWT issuer/audience/signature and explicit wallet-to-user linkage on the US backend, not from browser claims.
- [ ] Provision a separate US Postgres database and least-privileged role. Independently audit effective privileges and `ENABLE/FORCE ROW LEVEL SECURITY` under the actual service identity.
- [ ] Review access to credentials, secret rotation, rate limits, CORS, session expiration, revocation propagation, logging redaction and incident response.
- [ ] Test cross-user and cross-tenant denial with real authenticated sessions in a dedicated staging environment.
- [ ] Review US federal/state finance, privacy and consumer protection obligations before presenting any financial service as available; partner approval is separate.
- [ ] Obtain explicit human approval before enabling any read-only public US API. Financial execution requires an entirely separate authorization and review.

## Stop conditions
Do **not** merge, deploy or expand permissions when the current-head CI is pending/failed, a role can bypass RLS, a consent is unverifiable, any cross-user access succeeds, credential provenance is uncertain, or the exact US deployment environment is not independently attested.

Maya remains read-only: no private keys, signing, transfer, trade, borrowing, deposits or payments. No real personal financial data may be used in CI.
