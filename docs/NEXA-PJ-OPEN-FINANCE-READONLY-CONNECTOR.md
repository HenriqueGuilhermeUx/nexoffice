# Nexa PJ — primeiro conector Open Finance empresarial (contrato de engenharia)

**Estado:** especificação de implementação; nenhum provedor conectado; nenhuma credencial ou consentimento registrado.
**Escopo:** somente Nexa PJ ERP-only na branch isolada. Não usar conexão PF, carteira Privy PF ou dados do NexOffice original.

## Separação de identidade e consentimento
- `workspaceId` vem exclusivamente da sessão autenticada ERP; nunca confiar no workspace informado no corpo de uma requisição.
- CNPJ validado, titularidade da conexão PJ e poderes do representante devem ter provas externas verificadas antes de qualquer consulta.
- Criar consentimento por provedor, conjunto de escopos, finalidade, data de expiração e revogação; guardar apenas referências opacas no ERP. Tokens de conexão não devem chegar ao navegador.
- Consentimento não é equivalente a aprovação de KYB nem a autorização de pagamento.
- Exigir rotas de revogação, expiração e reconciliação de duplicatas e trilha auditável de alterações.

## Interface de adapter de leitura (planejada)
```ts
type FinanceSourceId = 'open-finance' | 'nexa-privy' | 'external-wallet' | 'investments' | 'liabilities';
type ConnectionStatus = 'not_connected' | 'pending_consent' | 'connected_read_only' | 'expired' | 'revoked' | 'error';
type SourceContext = {
  workspaceId: string; // derived server-side from session
  representativeUserId: string; // active workspace membership
  verifiedCorporateIdentityRef: string; // opaque verified reference
  consentRef: string; // opaque, provider-scoped, active and revocable
  requestedScopes: readonly string[];
};
type FinanceSnapshot = {
  source: FinanceSourceId;
  observedAt: string;
  currency: string;
  sourceAccountRef: string; // opaque
  amountMinor: string; // decimal text; never floating point
};
interface ReadOnlyFinanceConnector {
  getConnectionStatus(ctx: SourceContext): Promise<ConnectionStatus>;
  listBalances(ctx: SourceContext): Promise<readonly FinanceSnapshot[]>;
}
```

## Read-only initial release gates
1. Validate workspace authorization, KYB, representative authority, active consent and requested scopes server-side on **every call**.
2. No provider access when any verification is unknown, stale, revoked or missing; explicit `deny` outcome.
3. Normalize balances, liabilities and investments by institution, source account, currency and snapshot timestamp; distinguish credit from assets and avoid double counting.
4. Audit authorized reads without logging tokens, account numbers, CPF/CNPJ or full financial payloads.
5. Exercise tests for anonymous access, tenant A to B, revoked membership, revoked consent, expired token, provider timeout, duplicate source and mismatched legal entity.
6. Keep all payment initiation, Pix, swaps, transfers, wallet creation and Agentics execution in separate disabled capabilities with explicit human authorization gates.

## Partner setup — required before real integration
Confirm the partner's supported **PJ** products and sandbox scopes, consent lifecycle, callback validation, webhook signatures, authorized redirect origins, rate limits and data coverage. Existing sandbox keys alone do not mean corporate Open Finance is enabled. Do not move keys into GitHub or frontend.

## Current working API
`GET /v1/platform/nexa-pj/finance-hub/readiness` is a fail-closed diagnostic. It returns no bank data and no real consent state. This document does not claim that real source connectors or financial actions exist.
