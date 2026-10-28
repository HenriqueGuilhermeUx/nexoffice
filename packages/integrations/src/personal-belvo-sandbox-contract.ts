/**
 * Belvo OFDA Banking Brazil SANDBOX-only pre-integration contract.
 * Pure helpers: NO HTTP routes, provider calls, token issuance, DB writes,
 * credential access, or production enablement. Do not import into public UI.
 *
 * Belvo aggregation webhooks use optional Basic/Bearer authorization, NOT HMAC
 * signatures. Configure a distinct high-entropy Bearer secret and IP allowlist
 * before a dedicated endpoint is mounted; never trust webhook data by itself.
 */
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';

export const BELVO_PF_SANDBOX_MOCKBANK='ofmockbank_br_retail';
export const BELVO_PF_SANDBOX_WIDGET='https://widget.belvo.io/';
export type BelvoSandboxEnvironment=Readonly<Record<string,string|undefined>>;

export class BelvoSandboxContractError extends Error{
  readonly code:string;
  constructor(code:string){super(code);this.code=code;this.name='BelvoSandboxContractError';}
}

export function requireBelvoPfSandboxGate(env:BelvoSandboxEnvironment):void{
  if(env.NEX_PERSONAL_PREVIEW!=='true'||env.BELVO_ENV!=='sandbox'
    ||env.BELVO_SANDBOX_ENABLED!=='true'
    ||env.NEXOFFICE_DATABASE_SCOPE!=='nex-personal-preview'
    ||env.NEXOFFICE_EXTERNAL_ACTIONS!=='false')
    throw new BelvoSandboxContractError('SANDBOX_DISABLED');
}

/** Server-generated opaque correlation only. Store its owner mapping under PF RLS. */
export function newBelvoPfSandboxExternalId():string{
  return 'pf_sbx_'+randomBytes(16).toString('hex');
}

function validExternalId(value:string):boolean{
  return /^pf_sbx_[A-Za-z0-9_-]{16,64}$/.test(value);
}

/** A short-lived access token must be issued separately by an authenticated PF server. */
export function buildBelvoPfSandboxWidgetUrl(
  input:Readonly<{accessToken:string;externalId:string}>,
  env:BelvoSandboxEnvironment
):string{
  requireBelvoPfSandboxGate(env);
  if(!validExternalId(input.externalId)
    ||typeof input.accessToken!=='string'
    ||!/^[A-Za-z0-9._-]{12,4096}$/.test(input.accessToken))
    throw new BelvoSandboxContractError('INVALID_WIDGET_INPUT');
  const url=new URL(BELVO_PF_SANDBOX_WIDGET);
  url.searchParams.set('access_token',input.accessToken);
  url.searchParams.set('locale','pt');
  url.searchParams.set('access_mode','single');
  url.searchParams.set('integration_type','openfinance');
  url.searchParams.set('country_codes','BR');
  url.searchParams.set('institutions',BELVO_PF_SANDBOX_MOCKBANK);
  url.searchParams.set('external_id',input.externalId);
  return url.toString(); // Sensitive: NEVER log, cache or include in analytics.
}

/** Belvo's aggregation webhook auth is a configured Bearer token, not a signature. */
export function verifyBelvoPfSandboxWebhookBearer(
  authorization:string|undefined,
  expectedSecret:string|undefined,
  env:BelvoSandboxEnvironment
):boolean{
  try{requireBelvoPfSandboxGate(env);}catch{return false;}
  if(typeof expectedSecret!=='string'||expectedSecret.length<32||expectedSecret.length>4096
    ||typeof authorization!=='string'||!authorization.startsWith('Bearer '))return false;
  const supplied=authorization.slice(7);
  if(supplied.length<32||supplied.length>4096||/\s/.test(supplied))return false;
  const actualHash=createHash('sha256').update(supplied,'utf8').digest();
  const expectedHash=createHash('sha256').update(expectedSecret,'utf8').digest();
  return timingSafeEqual(actualHash,expectedHash);
}

export type BelvoPfSandboxLinkMapping=Readonly<{
  externalId:string;
  linkId:string;
  ownerUserRef:string;
}>;
export type BelvoPfSandboxEvent=Readonly<{
  eventId:string;
  linkId:string;
  ownerUserRef:string;
  resource:'ACCOUNTS'|'TRANSACTIONS'|'OWNERS'|'BILLS'|'INVESTMENTS'|'INVESTMENT_TRANSACTIONS'|'LINK';
  code:string;
}>;

/** Return metadata only after a trusted PF-RLS mapping matches BOTH identifiers. */
export function parseBelvoPfSandboxWebhook(
  payload:unknown,
  mapping:BelvoPfSandboxLinkMapping,
  env:BelvoSandboxEnvironment
):BelvoPfSandboxEvent{
  requireBelvoPfSandboxGate(env);
  const data=payload&&typeof payload==='object'&&!Array.isArray(payload)
    ?payload as Record<string,unknown>:{};
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const resource=data.webhook_type;
  const allowed=['ACCOUNTS','TRANSACTIONS','OWNERS','BILLS','INVESTMENTS','INVESTMENT_TRANSACTIONS','LINK'];
  if(!mapping||!mapping.ownerUserRef||!validExternalId(mapping.externalId)
    ||!uuid.test(mapping.linkId)||data.external_id!==mapping.externalId
    ||data.link_id!==mapping.linkId||typeof data.webhook_id!=='string'
    ||!uuid.test(data.webhook_id)||typeof resource!=='string'||!allowed.includes(resource)
    ||typeof data.webhook_code!=='string'||!/^[a-z_]{3,64}$/.test(data.webhook_code))
    throw new BelvoSandboxContractError('WEBHOOK_UNCORRELATED');
  return Object.freeze({eventId:data.webhook_id,linkId:mapping.linkId,
    ownerUserRef:mapping.ownerUserRef,
    resource:resource as BelvoPfSandboxEvent['resource'],code:data.webhook_code});
}
