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
