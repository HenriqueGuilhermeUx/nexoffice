/** Nexa PF/BELVO: sandbox only. No production endpoints or real customer data. */
import {randomUUID, timingSafeEqual} from 'node:crypto';

export const BELVO_SANDBOX_HOST='https://sandbox.belvo.com';
export const BELVO_HOSTED_WIDGET='https://widget.belvo.io/';
export const BELVO_MOCKBANK='ofmockbank_br_retail';
const WIDGET_SCOPES='read_institutions,write_links,read_consents,write_consents,write_consent_callback,delete_consents';
const CONSENT_PERMISSIONS=['REGISTER','ACCOUNTS','CREDIT_CARDS','CREDIT_OPERATIONS'] as const;
const SANDBOX_RESOURCES=['ACCOUNTS','TRANSACTIONS','OWNERS'] as const;

export class BelvoSandboxError extends Error{
 constructor(public readonly code:'disabled'|'missing_config'|'invalid_fixture'|'provider_unavailable'|'provider_rejected'|'invalid_response'){
  super(code);this.name='BelvoSandboxError';
 }
}
export type SandboxConfig={
 NEX_PERSONAL_PREVIEW?:string; BELVO_ENV?:string;
 BELVO_SANDBOX_ENABLED?:string; BELVO_SANDBOX_WIDGET_ENABLED?:string;
 BELVO_SANDBOX_SECRET_ID?:string; BELVO_SANDBOX_SECRET_PASSWORD?:string;
 BELVO_SANDBOX_MOCK_CPF?:string;BELVO_SANDBOX_MOCK_NAME?:string;
 BELVO_SANDBOX_TERMS_URL?:string; NEX_PERSONAL_PREVIEW_SELF_ORIGIN?:string;
 BELVO_SANDBOX_WEBHOOK_BEARER?:string
};
export function sandboxReady(env:SandboxConfig):boolean{
 return env.NEX_PERSONAL_PREVIEW==='true'&&env.BELVO_ENV==='sandbox'
  &&env.BELVO_SANDBOX_ENABLED==='true';
}
export function widgetReady(env:SandboxConfig):boolean{
 return sandboxReady(env)&&env.BELVO_SANDBOX_WIDGET_ENABLED==='true'
  &&typeof env.BELVO_SANDBOX_SECRET_ID==='string'&&env.BELVO_SANDBOX_SECRET_ID.length>0
  &&typeof env.BELVO_SANDBOX_SECRET_PASSWORD==='string'&&env.BELVO_SANDBOX_SECRET_PASSWORD.length>0
  &&/^[0-9]{11}$/.test(env.BELVO_SANDBOX_MOCK_CPF||'')
  &&typeof env.BELVO_SANDBOX_MOCK_NAME==='string'
  &&env.BELVO_SANDBOX_MOCK_NAME.trim().length>=2
  &&env.BELVO_SANDBOX_MOCK_NAME.length<=120
  &&safeHttpsOrigin(env.NEX_PERSONAL_PREVIEW_SELF_ORIGIN)
  &&safeHttpsPage(env.BELVO_SANDBOX_TERMS_URL)
  &&typeof env.BELVO_SANDBOX_WEBHOOK_BEARER==='string'
  &&env.BELVO_SANDBOX_WEBHOOK_BEARER.length>=32;
}
function safeHttpsOrigin(input:unknown):boolean{
 if(typeof input!=='string')return false;
 try{const u=new URL(input);return u.protocol==='https:'&&!u.username&&!u.password
  &&u.pathname==='/'&&!u.search&&!u.hash&&!/[^a-z0-9.\-:]/i.test(u.host);
 }catch{return false;}
}
function safeHttpsPage(input:unknown):boolean{
 if(typeof input!=='string')return false;
 try{const u=new URL(input);return u.protocol==='https:'&&!u.username&&!u.password
  &&u.hostname.length>2&&!u.hash;
 }catch{return false;}
}
export function newSandboxExternalId():string{
 // No CPF, email, person name, internal owner UUID or card details.
 return 'nexa_pf_sb_'+randomUUID().replace(/-/g,'');
}
export function buildSandboxTokenPayload(env:SandboxConfig,externalId:string):Record<string,unknown>{
 if(!widgetReady(env))throw new BelvoSandboxError('disabled');
 if(!/^nexa_pf_sb_[a-f0-9]{32}$/.test(externalId))throw new BelvoSandboxError('invalid_fixture');
 const self=env.NEX_PERSONAL_PREVIEW_SELF_ORIGIN!;
 const callback=(state:'success'|'exit'|'event')=>self+'/?belvo_sandbox_result='+state;
 return {
  id:env.BELVO_SANDBOX_SECRET_ID,
  password:env.BELVO_SANDBOX_SECRET_PASSWORD,
  scopes:WIDGET_SCOPES,
  stale_in:'42d',
  fetch_resources:[...SANDBOX_RESOURCES],
  widget:{
   openfinance_feature:'consent_link_creation',
   callback_urls:{success:callback('success'),exit:callback('exit'),event:callback('event')},
   consent:{
    purpose:'Autorizar o uso de dados financeiros FICTÍCIOS em homologação para testar a organização de contas, gastos e patrimônio na Nexa PF. Nenhum pagamento será iniciado.',
    terms_and_conditions_url:env.BELVO_SANDBOX_TERMS_URL,
    permissions:[...CONSENT_PERMISSIONS],
    identification_info:[{type:'CPF',number:env.BELVO_SANDBOX_MOCK_CPF,name:env.BELVO_SANDBOX_MOCK_NAME}]
   }
  }
 };
}
export function buildSandboxWidgetUrl(accessToken:string,externalId:string):string{
 if(!/^[A-Za-z0-9._\-]{16,6000}$/.test(accessToken)
  ||!/^nexa_pf_sb_[a-f0-9]{32}$/.test(externalId))
  throw new BelvoSandboxError('invalid_response');
 const url=new URL(BELVO_HOSTED_WIDGET);
 url.searchParams.set('access_token',accessToken);
 url.searchParams.set('locale','pt');
 url.searchParams.set('country_codes','BR');
 url.searchParams.set('institutions',BELVO_MOCKBANK);
 url.searchParams.set('integration_type','openfinance');
 url.searchParams.set('access_mode','single');
 url.searchParams.set('external_id',externalId);
 return url.toString();
}
export async function createSandboxWidgetAccess(
 env:SandboxConfig, externalId:string,
 http:typeof fetch=fetch
):Promise<string>{
 const payload=buildSandboxTokenPayload(env,externalId);
 const id=env.BELVO_SANDBOX_SECRET_ID!,password=env.BELVO_SANDBOX_SECRET_PASSWORD!;
 let response:Response;
 try{
  response=await http(BELVO_SANDBOX_HOST+'/api/token/',{
   method:'POST',
   headers:{'content-type':'application/json','accept':'application/json',
    authorization:'Basic '+Buffer.from(id+':'+password).toString('base64')},
   body:JSON.stringify(payload),signal:AbortSignal.timeout(10000),redirect:'error'
  });
 }catch{throw new BelvoSandboxError('provider_unavailable');}
 if(response.status!==200)throw new BelvoSandboxError('provider_rejected');
 let data:unknown;
 try{data=await response.json();}catch{throw new BelvoSandboxError('invalid_response');}
 const access=(data as {access?:unknown})?.access;
 if(typeof access!=='string')throw new BelvoSandboxError('invalid_response');
 // Never return or log refresh token; only short-lived access embedded in URL.
 return buildSandboxWidgetUrl(access,externalId);
}
/**
 * Belvo aggregation webhooks are NOT HMAC signed. A configured Bearer token is
 * mandatory in this integration. IP filtering at ingress is complementary.
 */
export function authorizedSandboxWebhook(env:SandboxConfig,header:unknown):boolean{
 if(!sandboxReady(env)||typeof env.BELVO_SANDBOX_WEBHOOK_BEARER!=='string'
  ||env.BELVO_SANDBOX_WEBHOOK_BEARER.length<32
  ||typeof header!=='string'||!header.startsWith('Bearer '))return false;
 const received=Buffer.from(header.slice(7));const expected=Buffer.from(env.BELVO_SANDBOX_WEBHOOK_BEARER);
 return received.length===expected.length&&timingSafeEqual(received,expected);
}
export type SandboxWebhookMetadata={
 webhookId:string;externalId:string|null;linkId:string|null;
 resource:string;event:string;processType:string|null;
};
export function parseSandboxWebhook(input:unknown):SandboxWebhookMetadata{
 if(!input||typeof input!=='object'||Array.isArray(input))
  throw new BelvoSandboxError('invalid_response');
 const o=input as Record<string,unknown>;
 const validString=(v:unknown)=>typeof v==='string'&&v.length>0&&v.length<=128;
 if(!validString(o.webhook_id)||!validString(o.webhook_type)
  ||!validString(o.webhook_code)||o.webhook_type==='PAYMENTS'
  ||(o.external_id!=null&&!/^nexa_pf_sb_[a-f0-9]{32}$/.test(String(o.external_id)))
  ||(o.link_id!=null&&!validString(o.link_id)))
  throw new BelvoSandboxError('invalid_response');
 return {
  webhookId:String(o.webhook_id),externalId:o.external_id==null?null:String(o.external_id),
  linkId:o.link_id==null?null:String(o.link_id),
  resource:String(o.webhook_type),event:String(o.webhook_code),
  processType:typeof o.process_type==='string'?o.process_type:null
 };
}
