/**
 * Fail-closed PRODUCTION ENV CONTRACT for Nexa Life OS (PF).
 *
 * Validation only: no connection, migration, creation, credentials in logs,
 * service deployment or production rollout. The preview API is deliberately
 * incompatible with this contract.
 */
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const EXPECTED_DB='nexa_lifeos_prod';
const EXPECTED_SITE_ORIGIN='https://trynexa.com.br';
const EXPECTED_API_ORIGIN='https://api-life.trynexa.com.br';
const PREVIEW_NEON_PROJECT='orange-fog-28021931';

function required(env,key,value){
 if(String(env[key]||'')!==value)
  throw new Error(key+' must equal '+value+' for Nexa PF production readiness');
}
function requireBlank(env,key){
 if(String(env[key]||'').trim())throw new Error(key+' cannot be set for Nexa PF production');
}
function safeUrl(value,protocol,key){
 let url;
 try{url=new URL(value||'');}
 catch{throw new Error(key+' must be a valid '+protocol+' URL');}
 if(url.protocol!==protocol||url.username&&protocol==='https:'||url.password&&protocol==='https:'
   ||url.hash||url.search||!url.hostname)
  throw new Error(key+' must be an exact origin or database URL with the required scheme');
 return url;
}
export function inspectLifeosProdEnv(env){
 required(env,'NEXA_LIFEOS_ENV','production');
 required(env,'NODE_ENV','production');
 required(env,'NEXA_LIFEOS_PROD_RELEASE_APPROVED','true');
 required(env,'NEXA_LIFEOS_PUBLIC_SIGNUP_ENABLED','false');
 required(env,'NEXOFFICE_EXTERNAL_ACTIONS','false');
 required(env,'NEXOFFICE_INTELLIGENCE_DAILY_ENGINE','false');
 required(env,'AUTO_MIGRATE','false');
 required(env,'NEXOFFICE_DATABASE_SCOPE','nexa-lifeos-prod');
 required(env,'NEXA_LIFEOS_DB_TLS_STRICT','true');
 required(env,'NEXA_LIFEOS_DISABLE_DEMO_SEED','true');
 requireBlank(env,'NEX_PERSONAL_PREVIEW');
 requireBlank(env,'NEX_PERSONAL_PREVIEW_CI');
 requireBlank(env,'NEX_PERSONAL_PREVIEW_INVITE_SHA256');
 requireBlank(env,'NEX_PERSONAL_PREVIEW_ALLOWED_EMAILS');
 requireBlank(env,'NEX_PERSONAL_PREVIEW_SELF_ORIGIN');
 required(env,'ALLOWED_ORIGINS',EXPECTED_SITE_ORIGIN);
 required(env,'NEXA_LIFEOS_API_ORIGIN',EXPECTED_API_ORIGIN);
 required(env,'VITE_NEXA_LIFEOS_API_URL',EXPECTED_API_ORIGIN);
 required(env,'VITE_NEXA_LIFEOS_PUBLIC','true');
 required(env,'VITE_NEXA_LIFEOS_BUILD_PROBE','false');
 // These flags explicitly prohibit accidental use of Wallet/preview identity.
 required(env,'NEXA_LIFEOS_ALLOW_WALLET_TOKEN_BRIDGE','false');
 required(env,'NEXA_LIFEOS_ALLOW_PRIVY_CREATE_WALLET','false');
 const database=safeUrl(env.DATABASE_URL,'postgresql:','DATABASE_URL');
 const expectedHost=String(env.NEXA_LIFEOS_DB_HOST||'').trim().toLowerCase();
 const project=String(env.NEXA_LIFEOS_NEON_PROJECT_ID||'').trim();
 if(!expectedHost||!expectedHost.includes('.')||expectedHost!==database.hostname)
  throw new Error('DATABASE_URL hostname differs from explicitly reviewed dedicated PF DB hostname');
 if(!/^[a-z0-9-]{8,60}$/.test(project)||project===PREVIEW_NEON_PROJECT)
  throw new Error('NEXA_LIFEOS_NEON_PROJECT_ID must be an independently created production Neon project');
 if(database.pathname!==('/'+EXPECTED_DB)||database.username.length===0||database.password.length===0)
  throw new Error('DATABASE_URL must name the dedicated nexa_lifeos_prod DB and use its own credentials');
 if(/(?:localhost|127\.0\.0\.1|preview|staging|wallet|nexa-backend|nexoffice)/i.test(database.hostname)
   ||/(?:preview|staging|wallet|nexoffice)/i.test(database.username))
  throw new Error('Production DB hostname/user must not identify any existing product or preview');
 if(!database.hostname.endsWith('.neon.tech'))
  throw new Error('Nexa PF production DB must be a dedicated Neon PostgreSQL host');
 if(String(env.PGSSLMODE||'').toLowerCase()==='disable')
  throw new Error('PG TLS cannot be disabled');
 const days=Number(env.SESSION_TTL_DAYS);
 if(!Number.isInteger(days)||days<1||days>14)
  throw new Error('SESSION_TTL_DAYS must be explicitly set between 1 and 14');
 return Object.freeze({
   readyForInfrastructureReview:true,
   productionApiOrigin:EXPECTED_API_ORIGIN,
   publicOrigin:EXPECTED_SITE_ORIGIN,
   databaseName:EXPECTED_DB,
   application:'nexa-lifeos',
   externalFinancialActions:false,
   publicSignup:false,
   walletTokenBridge:false
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const r=inspectLifeosProdEnv(process.env);
  console.log('NEXA_LIFEOS_PROD_ENV_CONTRACT_PASS: '+JSON.stringify(r));
  console.log('NOT A DEPLOY APPROVAL: dedicated Neon project, DB migrations, server, login security and public routing still need separate reviews.');
 }catch(err){
  console.error('NEXA_LIFEOS_PROD_ENV_CONTRACT_BLOCKED: '+(err instanceof Error?err.message:'Invalid environment'));
  process.exitCode=2;
 }
}