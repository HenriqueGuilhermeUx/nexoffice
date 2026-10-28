/**
 * Nexa PJ finance data adapter contract.
 * No live connector or payment authorization is implemented here.
 * Designed for a separately authenticated company-scoped integration.
 */
export type FinanceSourceId='open-finance'|'nexa-privy'|'external-wallet'|'investments'|'liabilities';
export type ReadOnlyConnectionStatus='not_connected'|'pending_consent'|'connected_read_only'|'expired'|'revoked'|'error';
export type FinanceSourceContext=Readonly<{
  workspaceId:string;
  representativeUserId:string;
  verifiedCorporateIdentityRef:string;
  consentRef:string;
  requestedScopes:readonly string[];
}>;
export type FinanceBalanceSnapshot=Readonly<{
  source:FinanceSourceId;
  sourceAccountRef:string;
  currency:string;
  amountMinor:string;
  observedAt:string;
}>;
export interface ReadOnlyFinanceConnector{
  getConnectionStatus(ctx:FinanceSourceContext):Promise<ReadOnlyConnectionStatus>;
  listBalances(ctx:FinanceSourceContext):Promise<readonly FinanceBalanceSnapshot[]>;
}
/** Fail closed until a trusted company consent registry and provider are installed. */
export class DisabledOpenFinanceConnector implements ReadOnlyFinanceConnector{
  async getConnectionStatus(_ctx:FinanceSourceContext):Promise<ReadOnlyConnectionStatus>{
    return 'not_connected';
  }
  async listBalances(_ctx:FinanceSourceContext):Promise<readonly FinanceBalanceSnapshot[]>{
    throw new Error('OPEN_FINANCE_PJ_NOT_AUTHORIZED');
  }
}
export function validateFinanceSnapshot(snapshot:FinanceBalanceSnapshot):boolean{
  // Keep money in integer minor units, without float conversions.
  return snapshot.source==='open-finance' &&
    /^[A-Z]{3}$/.test(snapshot.currency) &&
    /^-?\d+$/.test(snapshot.amountMinor) &&
    snapshot.sourceAccountRef.length>0 &&
    snapshot.observedAt.length>0 &&
    Number.isFinite(Date.parse(snapshot.observedAt));
}

/** Opaque, provider-scoped authorization evidence; never returned to the browser. */
export type CorporateFinanceConsent=Readonly<{
  workspaceId:string;
  representativeUserId:string;
  providerId:string;
  verifiedCorporateIdentityRef:string;
  consentRef:string;
  scopes:readonly string[];
  status:'active'|'revoked'|'expired'|'pending';
  expiresAt:string;
}>;
/**
 * Server-only policy gate. A matching workspace and representative are necessary,
 * but are never sufficient without verified corporate authority and active consent.
 * No authority can be inferred from user-controlled fields.
 */
export function evaluateCorporateReadConsent(
  ctx:FinanceSourceContext,
  evidence:CorporateFinanceConsent|null,
  serverVerifiedCorporateAuthority:boolean,
  now:Date=new Date(),
):'allow_read'|'deny'{
  if(!serverVerifiedCorporateAuthority||!evidence||evidence.status!=='active')return 'deny';
  if(!ctx.workspaceId||!ctx.representativeUserId||!ctx.verifiedCorporateIdentityRef||!ctx.consentRef)return 'deny';
  if(evidence.workspaceId!==ctx.workspaceId||evidence.representativeUserId!==ctx.representativeUserId||
    evidence.verifiedCorporateIdentityRef!==ctx.verifiedCorporateIdentityRef||
    evidence.consentRef!==ctx.consentRef||!evidence.providerId)return 'deny';
  const expiry=Date.parse(evidence.expiresAt);
  if(!Number.isFinite(expiry)||expiry<=now.getTime())return 'deny';
  if(ctx.requestedScopes.length===0||ctx.requestedScopes.some(scope=>!evidence.scopes.includes(scope)))return 'deny';
  return 'allow_read';
}
