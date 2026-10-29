/**
 * Nexa PF premium aggregation contracts.
 *
 * Types-only integration boundary for the FUTURE audited server-side workers.
 * Nothing here performs network calls, authorizes Wallet sessions, creates
 * wallets, connects browser EIP-1193 providers or initiates payments.
 *
 * Reuse OpenFinanceProvider from nex-finance-core.ts once partner approval and
 * consent are independently verified. Never share business workspace grants.
 */
export type PersonalSource='open_finance'|'user_declared'|'nexa_wallet'|'external_wallet';
export type PersonalAssetKind='bank_account'|'fixed_income'|'equity'|'fund'|'crypto'|'other_asset'|'credit_card'|'loan'|'financing';
export type ReadScope='balances.read'|'transactions.read'|'investments.read'|'liabilities.read'|'wallet.read';
export type LinkState='unlinked'|'pending_consent'|'active'|'expired'|'revoked'|'failed';

export type PersonalSourceLink={
 readonly linkRef:string;
 readonly ownerUserRef:string; // derived from a VERIFIED PF server session only
 readonly source:PersonalSource;
 readonly providerRef:string;
 readonly status:LinkState;
 readonly scopes:ReadonlyArray<ReadScope>;
 readonly expiresAt:string|null;
 readonly verifiedAt:string|null;
 readonly consentRef:string|null;
};
export type PersonalHoldingSnapshot={
 readonly source:PersonalSource;
 readonly linkRef:string;
 readonly instrumentRef:string;
 readonly kind:PersonalAssetKind;
 readonly name:string;
 readonly currency:string;
 readonly balanceMinor:string|null; // null means unknown, NOT zero
 readonly asOf:string|null;
 readonly provenance:'provider_verified'|'user_declared';
 readonly coverage:'complete'|'partial'|'stale';
};
export type PersonalLiabilitySnapshot=PersonalHoldingSnapshot&{
 readonly kind:'credit_card'|'loan'|'financing';
 readonly paymentDueOn:string|null;
 readonly outstandingMinor:string|null;
 readonly annualRateBasisPoints:number|null;
};
export type PersonalPortfolioSnapshot={
 readonly sourceLink:PersonalSourceLink;
 readonly holdings:ReadonlyArray<PersonalHoldingSnapshot>;
 readonly liabilities:ReadonlyArray<PersonalLiabilitySnapshot>;
 readonly readOnly:true;
 readonly generatedAt:string;
};

export class PersonalLinkNotAuthorizedError extends Error{
 constructor(){super('Conexão ou escopo não autorizado para consulta financeira.');this.name='PersonalLinkNotAuthorizedError';}
}
/**
 * Enforce a server-owned PF principal and consent scope before future workers
 * read connected provider data. This is not enough on its own: the server
 * must validate the source link under FORCE RLS and audit partner credentials.
 */
export function requirePersonalReadScope(
 link:PersonalSourceLink,
 serverActorUserRef:string,
 scope:ReadScope,
 now=new Date()
):void{
 if(!serverActorUserRef||link.ownerUserRef!==serverActorUserRef
   ||link.status!=='active'||!link.scopes.includes(scope)
   ||!link.verifiedAt||!link.consentRef||!link.providerRef||!link.linkRef
   ||!link.expiresAt||!Number.isFinite(Date.parse(link.expiresAt))
   ||new Date(link.expiresAt).getTime()<=now.getTime())
  throw new PersonalLinkNotAuthorizedError();
}
/** Prevent non-like currencies (e.g. BRL and USDC) being summed as a single balance. */
export function sameCurrencyMinorTotal(snapshots:ReadonlyArray<PersonalHoldingSnapshot>,currency:string):string|null{
 if(!snapshots.length||snapshots.some(s=>s.currency!==currency
  ||s.coverage!=='complete'||s.balanceMinor===null
  ||!/^-?\d{1,20}$/.test(String(s.balanceMinor))))
  return null;
 return snapshots.reduce((sum,s)=>sum+BigInt(s.balanceMinor!),0n).toString();
}
