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
  expectedProviderId:string,
  now:Date=new Date(),
):'allow_read'|'deny'{
  if(!serverVerifiedCorporateAuthority||!evidence||evidence.status!=='active')return 'deny';
  if(!ctx.workspaceId||!ctx.representativeUserId||!ctx.verifiedCorporateIdentityRef||!ctx.consentRef)return 'deny';
  if(evidence.workspaceId!==ctx.workspaceId||evidence.representativeUserId!==ctx.representativeUserId||
    evidence.verifiedCorporateIdentityRef!==ctx.verifiedCorporateIdentityRef||
    evidence.consentRef!==ctx.consentRef||!expectedProviderId||evidence.providerId!==expectedProviderId)return 'deny';
  const expiry=Date.parse(evidence.expiresAt);
  if(!Number.isFinite(expiry)||expiry<=now.getTime())return 'deny';
  // This adapter must never authorize write, payment or transfer scopes, even if a provider record claims them.
  const readScopes=new Set(['accounts.read','balances.read','transactions.read','investments.read','liabilities.read']);
  if(ctx.requestedScopes.length===0||ctx.requestedScopes.some(scope=>!readScopes.has(scope)||!evidence.scopes.includes(scope)))return 'deny';
  return 'allow_read';
}

/** Consent proof is accepted only from a trusted, server-side provider verifier. */
export type VerifiedProviderConsentEvidence=Readonly<{
  consent:CorporateFinanceConsent;
  verifiedBy:'trusted_provider_backchannel';
  verifiedAt:string;
  providerSignatureValidated:boolean;
  revocationChecked:boolean;
}>;
export function evaluateVerifiedCorporateReadConsent(
  ctx:FinanceSourceContext,
  verified:VerifiedProviderConsentEvidence|null,
  serverVerifiedCorporateAuthority:boolean,
  expectedProviderId:string,
  now:Date=new Date(),
):'allow_read'|'deny'{
  if(!verified||verified.verifiedBy!=='trusted_provider_backchannel'||
     verified.providerSignatureValidated!==true||verified.revocationChecked!==true)return 'deny';
  const checkTime=Date.parse(verified.verifiedAt);
  if(!Number.isFinite(checkTime)||checkTime>now.getTime()||
     now.getTime()-checkTime>5*60_000)return 'deny';
  return evaluateCorporateReadConsent(ctx,verified.consent,serverVerifiedCorporateAuthority,expectedProviderId,now);
}

/**
 * Provider verification is a server-side capability, not a browser assertion.
 * This default verifier never manufactures consent evidence.
 */
export interface CorporateConsentVerifier {
  verify(ctx:FinanceSourceContext,providerId:string):Promise<VerifiedProviderConsentEvidence|null>;
}
export class DisabledCorporateConsentVerifier implements CorporateConsentVerifier {
  async verify(_ctx:FinanceSourceContext,_providerId:string):Promise<null> {
    return null;
  }
}
export async function authorizeCorporateRead(
  verifier:CorporateConsentVerifier,
  ctx:FinanceSourceContext,
  providerId:string,
  corporateAuthorityVerified:boolean,
  now:Date=new Date(),
):Promise<'allow_read'|'deny'> {
  // Reject invalid or write scopes BEFORE reaching a third-party verifier.
  const permitted=new Set(['accounts.read','balances.read','transactions.read','investments.read','liabilities.read']);
  if(!providerId||!corporateAuthorityVerified||!ctx.workspaceId||!ctx.representativeUserId||
    !ctx.verifiedCorporateIdentityRef||!ctx.consentRef||ctx.requestedScopes.length===0||
    ctx.requestedScopes.some(scope=>!permitted.has(scope)))return 'deny';
  try {
    const proof=await verifier.verify(ctx,providerId);
    return evaluateVerifiedCorporateReadConsent(ctx,proof,corporateAuthorityVerified,providerId,now);
  }catch {
    return 'deny'; // Provider error, timeout, or missing evidence must never allow access.
  }
}

/**
 * Defensive provider-call bound. The caller supplies a server-owned verifier;
 * an unresolved verification must never stall a request indefinitely.
 */
export async function authorizeCorporateReadWithinDeadline(
  verifier:CorporateConsentVerifier,
  ctx:FinanceSourceContext,
  providerId:string,
  corporateAuthorityVerified:boolean,
  deadlineMs=3000,
  now:Date=new Date(),
):Promise<'allow_read'|'deny'>{
  if(!Number.isSafeInteger(deadlineMs)||deadlineMs<1||deadlineMs>10000)return 'deny';
  const permitted=new Set(['accounts.read','balances.read','transactions.read','investments.read','liabilities.read']);
  if(!providerId||!corporateAuthorityVerified||!ctx.workspaceId||!ctx.representativeUserId||
    !ctx.verifiedCorporateIdentityRef||!ctx.consentRef||ctx.requestedScopes.length===0||
    ctx.requestedScopes.some(s=>!permitted.has(s)))return 'deny';
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
    const timeout=new Promise<null>(resolve=>{timer=setTimeout(()=>resolve(null),deadlineMs)});
    const proof=await Promise.race([verifier.verify(ctx,providerId),timeout]);
    return evaluateVerifiedCorporateReadConsent(ctx,proof,corporateAuthorityVerified,providerId,now);
  }catch{return 'deny'}
  finally{if(timer)clearTimeout(timer)}
}
