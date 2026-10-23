/**
 * NexOffices -> Nexa Agentics cross-product adapter (experimental).
 *
 * NexOffices authenticates workspace members before invoking this adapter.
 * Never accept workspaceId/principalId from browser bodies. No raw CRM,
 * legal, health, customer finance, documents, prompts or secrets leave the
 * NexOffices API in this transport. Supports preview-only operations.
 *
 * Production disabled: Nexa Enterprise SSO, hosted authoritative entitlements,
 * KMS, hosted WORM and private pilot authorization are still NO-GO.
 */
import {createHmac,randomUUID} from 'node:crypto';
import type {WorkspaceContext} from './auth.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PURPOSE='nexa.agentics.product.preview.v1';
export const OPERATIONS=['business.pulse.preview','task.plan.preview'] as const;
export type AgenticsOperation=typeof OPERATIONS[number];
export type AgenticsPreview={contract:string;status:'review_only';product:'nexoffice';
 tenantId:string;eventId:string;agent:string;title:string;summary:string;
 synthetic:true;readOnly:true;customerDataAccess:false;financialExecutionAllowed:false;
 externalToolsAllowed:false;medicalDataAccess:false;legalCaseDataAccess:false;
 productionReady:false};
type ProductRequest={version:string;product:string;tenantId:string;
 principalId:string;operation:AgenticsOperation;eventId:string;issuedAt:number;expiresAt:number};
const FIELDS=['version','product','tenantId','principalId','operation','eventId','issuedAt','expiresAt'] as const;
function deny(code:string):never{throw Error('nexoffice_agentics_bridge_denied_'+code)}
function secret(env:NodeJS.ProcessEnv):Buffer{
 const raw=String(env.NEXOFFICE_AGENTICS_PRODUCT_KEY_B64||'');
 if(!/^[A-Za-z0-9_-]{43,4096}$/.test(raw))deny('private_product_key_required');
 const bytes=Buffer.from(raw,'base64url');
 if(bytes.length<32||bytes.length>2048||bytes.toString('base64url')!==raw)
  deny('invalid_product_key');
 return bytes;
}
export function agenticsBridgeConfigured(env:NodeJS.ProcessEnv=process.env):boolean{
 return env.NEXOFFICE_AGENTICS_BRIDGE_ENABLED==='true'&&
  env.NODE_ENV!=='production'&&!env.RENDER&&!env.RENDER_SERVICE_ID&&
  !!env.NEXOFFICE_AGENTICS_BASE_URL&&!!env.NEXOFFICE_AGENTICS_PRODUCT_KEY_B64;
}
function endpoint(env:NodeJS.ProcessEnv){
 if(!agenticsBridgeConfigured(env))deny('feature_disabled');
 let u:URL;
 try{u=new URL(env.NEXOFFICE_AGENTICS_BASE_URL!)}catch{deny('untrusted_gateway_endpoint')}
 // Production rollout requires separate review. For laboratory, only
 // loopback is allowed; never trust arbitrary URL, DNS, redirects or ports.
 if(u.origin!=='http://127.0.0.1:48619'||u.pathname!=='/'||
    u.search||u.hash||u.username||u.password)
  deny('untrusted_gateway_endpoint');
 return new URL('/v1/agentics/preview',u.origin);
}
export function signNexofficeAgenticsPreview(
 ctx:Pick<WorkspaceContext,'workspaceId'|'user'>,operation:AgenticsOperation,
 env:NodeJS.ProcessEnv=process.env, nowMs=Date.now()){
 if(!OPERATIONS.includes(operation))deny('unapproved_operation');
 if(!UUID.test(ctx.workspaceId)||!UUID.test(ctx.user?.id))deny('verified_workspace_required');
 if(!Number.isSafeInteger(nowMs)||nowMs<0)deny('clock_invalid');
 const request:ProductRequest={version:PURPOSE,product:'nexoffice',tenantId:ctx.workspaceId,
  principalId:ctx.user.id,operation,eventId:randomUUID(),
  issuedAt:Math.floor(nowMs/1000),expiresAt:Math.floor(nowMs/1000)+20};
 const key=secret(env);
 const mac=createHmac('sha256',key)
  .update(JSON.stringify(FIELDS.map(f=>request[f])),'utf8').digest('base64url');
 return Object.freeze({request:Object.freeze(request),signature:mac});
}
export async function getNexaAgenticsPreview(
 ctx:Pick<WorkspaceContext,'workspaceId'|'user'>,operation:AgenticsOperation,
 env:NodeJS.ProcessEnv=process.env,
 fetcher:typeof fetch=fetch):Promise<AgenticsPreview>{
 const url=endpoint(env);
 const envelope=signNexofficeAgenticsPreview(ctx,operation,env);
 let res:Response;
 try{
  res=await fetcher(url,{method:'POST',redirect:'error',
   headers:{'content-type':'application/json','accept':'application/json'},
   body:JSON.stringify(envelope),signal:AbortSignal.timeout(3000)});
 }catch{deny('gateway_unavailable')}
 if(!res.ok)deny('gateway_rejected');
 let body:unknown;
 try{body=await res.json();}catch{deny('bad_gateway_response')}
 if(!body||typeof body!=='object'||Array.isArray(body))
  deny('bad_gateway_response');
 const out=body as Record<string,unknown>;
 if(out.contract!==PURPOSE||out.status!=='review_only'||out.product!=='nexoffice'||
    out.tenantId!==ctx.workspaceId||out.eventId!==envelope.request.eventId||
    !['operations','planner'].includes(String(out.agent))||
    typeof out.title!=='string'||out.title.length>100||
    typeof out.summary!=='string'||out.summary.length>400||
    out.synthetic!==true||out.readOnly!==true||out.customerDataAccess!==false||
    out.financialExecutionAllowed!==false||out.externalToolsAllowed!==false||
    out.medicalDataAccess!==false||out.legalCaseDataAccess!==false||
    out.productionReady!==false)
  deny('untrusted_gateway_response');
 // Only allowlisted fields returned to the workspace; no raw provider data.
 return {contract:PURPOSE,status:'review_only',product:'nexoffice',
  tenantId:ctx.workspaceId,eventId:envelope.request.eventId,agent:String(out.agent),
  title:String(out.title),summary:String(out.summary),synthetic:true,readOnly:true,
  customerDataAccess:false,financialExecutionAllowed:false,
  externalToolsAllowed:false,medicalDataAccess:false,legalCaseDataAccess:false,
  productionReady:false};
}
