/**
 * Belvo sandbox consent notice policy.
 * Webhooks are authenticated at ingress but are NOT authority to grant access.
 * An expiration/revocation notice may only RESTRICT a previously checked
 * mockbank consent until the user explicitly reconfirms with Belvo.
 */
const NOTICE_CODES=new Set([
 'consent_rejected',
 'openfinance_consent_expired',
 'openfinance_consent_about_to_expire',
 'openfinance_consent_with_unrecoverable_resources',
 'openfinance_consent_with_temporarily_unavailable_resources',
 'openfinance_consent_expiration_changed',
 'invalid_credentials'
]);
export function requiresSandboxConsentRecheck(resource:string,code:string):boolean{
 return (resource==='CONSENT'||resource==='LINKS'||resource==='LINK')
  &&NOTICE_CODES.has(code);
}
export type SandboxConsentReadStatus='not_verified'|'verified_recent'
 |'review_required'|'verification_stale';
export function getSandboxConsentReadStatus(
 row:{verification_status:string;verified_at:string|Date}|null,
 now=new Date()
):SandboxConsentReadStatus{
 if(!row)return 'not_verified';
 if(row.verification_status!=='verified_authorized')return 'review_required';
 const at=new Date(row.verified_at).getTime();
 if(!Number.isFinite(at)||!Number.isFinite(now.getTime())
  ||at>now.getTime()||now.getTime()-at>15*60*1000)
  return 'verification_stale';
 return 'verified_recent';
}
