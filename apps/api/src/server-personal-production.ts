/**
 * Future Nexa PF-only production API. This is intentionally NOT a deploy
 * entrypoint in any existing Render service, and never auto-migrates a DB.
 * Public signup is disabled until identity/consent/rate-limit reviews pass.
 */
import 'dotenv/config';
import Fastify from 'fastify';
import {z} from 'zod';
import {query} from './db.js';
import {ApiError,issueSession,revokeSession,verifyPassword} from './auth.js';
import {requireLifeosProductionSchema} from './nexa-lifeos-prod-schema-ready.js';
import {requireVerifiedLifeosUserContext} from './nexa-lifeos-prod-user-context.js';
import {registerNexPersonalRoutes} from './routes-nex-personal.js';
import {registerNexPersonalStudioRoutes} from './routes-nex-personal-studio.js';
import {registerNexPersonalAgentsRoutes} from './routes-nex-personal-agents.js';
import {registerNexPersonalLifeRoutes} from './routes-nex-personal-life.js';
import {registerNexPersonalPrivacyRoutes} from './routes-nex-personal-privacy.js';
import {registerNexPersonalFInsightRoutes} from './routes-nex-personal-finsight.js';
import {registerNexPersonalBrokerageRoutes} from './routes-nex-personal-brokerage.js';

// A separate preflight must validate DB project identity, TLS and full flags.
// These checks are duplicated here deliberately so running this entrypoint
// directly cannot silently activate preview/PJ/Wallet services.
for(const [key,value] of Object.entries({
 NEXA_LIFEOS_ENV:'production',
 NODE_ENV:'production',
 NEXA_LIFEOS_PROD_RELEASE_APPROVED:'true',
 NEXA_LIFEOS_AUTH_REVIEW_APPROVED:'true',
 NEXA_LIFEOS_PUBLIC_SIGNUP_ENABLED:'false',
 NEXOFFICE_EXTERNAL_ACTIONS:'false',
 NEXOFFICE_INTELLIGENCE_DAILY_ENGINE:'false',
 AUTO_MIGRATE:'false',
 NEXOFFICE_DATABASE_SCOPE:'nexa-lifeos-prod',
 NEXA_LIFEOS_DB_TLS_STRICT:'true',
 NEXA_LIFEOS_ALLOW_WALLET_TOKEN_BRIDGE:'false',
 NEXA_LIFEOS_ALLOW_PRIVY_CREATE_WALLET:'false',
 ALLOWED_ORIGINS:'https://trynexa.com.br'
})){
 if(process.env[key]!==value)throw new Error('Nexa Life OS production startup blocked: '+key);
}
if(process.env.NEX_PERSONAL_PREVIEW||process.env.NEX_PERSONAL_PREVIEW_ALLOWED_EMAILS
  ||process.env.NEX_PERSONAL_PREVIEW_INVITE_SHA256)
 throw new Error('Nexa Life OS production must not receive preview credentials');
// The public env checker contains all DB hostname/Neon/SSL/client flags and
// must be executed before registering any user or financial route.
// @ts-ignore NodeNext imports the source-side .mjs contract from the repo root.
const {inspectLifeosProdEnv}=await import('../../../scripts/check-nexa-lifeos-prod-env.mjs');
inspectLifeosProdEnv(process.env);
if(process.env.NEXA_LIFEOS_API_ORIGIN!=='https://api-life.trynexa.com.br')
 throw new Error('Dedicated Nexa PF production API origin required');
if(!process.env.DATABASE_URL||!process.env.DATABASE_URL.includes('/nexa_lifeos_prod'))
 throw new Error('Dedicated PF production PostgreSQL database required');

const app=Fastify({logger:{level:'warn',redact:['req.headers.authorization','req.headers.cookie']},bodyLimit:512*1024});
const SITE='https://trynexa.com.br';
// Single-instance defense in depth only. Go-live requires an audited shared
// limiter at ingress, antifraud telemetry and reset/recovery safeguards.
const attempts=new Map<string,{start:number;count:number}>();
function limitLogin(address:string){
 const now=Date.now(),key=address||'unknown';
 const existing=attempts.get(key);
 const next=existing&&now-existing.start<15*60_000?existing:{start:now,count:0};
 next.count++;attempts.set(key,next);
 if(attempts.size>5000){
  for(const [ip,entry] of attempts)
   if(now-entry.start>15*60_000)attempts.delete(ip);
 }
 if(next.count>12)throw new ApiError(429,'too_many_requests','Muitas tentativas de entrada.');
}
app.addHook('onRequest',async(req,reply)=>{
 reply.header('x-content-type-options','nosniff');
 reply.header('x-frame-options','DENY');
 reply.header('referrer-policy','no-referrer');
 reply.header('cache-control','no-store');
 reply.header('strict-transport-security','max-age=31536000; includeSubDomains');
 reply.header('permissions-policy','camera=(), microphone=(), geolocation=(), payment=()');
 reply.header('content-security-policy',"default-src 'none'; frame-ancestors 'none'; form-action 'none'; base-uri 'none'");
 const origin=String(req.headers.origin||'');
 if(origin===SITE)reply.header('access-control-allow-origin',SITE);
 reply.header('vary','Origin');
 reply.header('access-control-allow-headers','authorization,content-type');
 reply.header('access-control-allow-methods','GET,POST,PUT,PATCH,DELETE,OPTIONS');
 if(origin&&origin!==SITE)throw new ApiError(403,'origin_denied','Origem não autorizada.');
 // Open registration is blocked even if someone calls the underlying route
 // directly. Registration remains a separate future legal/security release.
 if(req.method==='POST'&&req.url.split('?')[0]==='/v1/personal/auth/register')
  throw new ApiError(503,'registration_not_open','Cadastro Nexa em preparação.');
 if(req.method==='POST'&&req.url.split('?')[0]==='/v1/auth/login')
  limitLogin(req.ip);
 // Do not expose any PF user data to a request before confirming the LIVE
 // database's RLS and least-privilege role. No test/preview bypass exists.
 const route=req.url.split('?')[0];
 if(req.method!=='OPTIONS'&&route.startsWith('/v1/personal/')
   &&route!=='/v1/personal/auth/register'){
   const bearer=String(req.headers.authorization||'');
   if(!bearer.startsWith('Bearer '))throw new ApiError(401,'unauthorized','Sessão necessária.');
   requireVerifiedLifeosUserContext();
   await requireLifeosProductionSchema();
 }
 if(req.method==='POST'&&route==='/v1/auth/logout'){
   requireVerifiedLifeosUserContext();
   await requireLifeosProductionSchema();
 }
});
app.options('*',async(_req,reply)=>reply.code(204).send());
const email=z.string().trim().email().transform(v=>v.toLowerCase());
app.get('/health/live',async()=>({status:'ok',service:'nexa-lifeos-prod-api'}));
app.get('/health',async()=>{
 // Until every request has verified transaction-bound user identity and
 // effective RLS E2E, readiness must NEVER report production healthy.
 requireVerifiedLifeosUserContext();
 // A reachable database alone is insufficient: every expected PF table
 // must have enforced RLS, reviewed policies and a least-privilege DB role.
 await requireLifeosProductionSchema();
 return {status:'ok',service:'nexa-lifeos-prod-api',
  externalFinancialActions:false,walletTokenBridge:false,publicSignup:false};
});
app.post('/v1/auth/login',async req=>{
 const input=z.object({email,password:z.string().min(1).max(256)}).strict().parse(req.body);
 // Login also requires RLS-safe access to public.users/auth_sessions.
 requireVerifiedLifeosUserContext();
 await requireLifeosProductionSchema();
 const rows=await query<{id:string;name:string;email:string;password_hash:string;status:string}>(
  'select id,name,email,password_hash,status from public.users where lower(email)=$1 limit 1',
  [input.email]
 );
 if(!rows.length||rows[0].status!=='active'||!(await verifyPassword(input.password,rows[0].password_hash)))
   throw new ApiError(401,'invalid_credentials','E-mail ou senha incorretos.');
 const session=await issueSession(rows[0].id);
 return {token:session.token,expiresAt:session.expiresAt,
   user:{id:rows[0].id,name:rows[0].name,email:rows[0].email}};
});
app.post('/v1/auth/logout',async req=>{
 await revokeSession(req);return {ok:true};
});
// PF production must not even mount the real preview sign-up write handler.
// Preserve only a deliberate 503 placeholder; request guard also denies it.
await registerNexPersonalRoutes(app,{registrationEnabled:false});
app.post('/v1/personal/auth/register',async(_req,reply)=>
 reply.code(503).send({error:'registration_not_open',message:'Cadastro Nexa em preparação.'})
);
await registerNexPersonalStudioRoutes(app);
await registerNexPersonalAgentsRoutes(app);
await registerNexPersonalLifeRoutes(app);
await registerNexPersonalPrivacyRoutes(app);
await registerNexPersonalFInsightRoutes(app);
await registerNexPersonalBrokerageRoutes(app);
app.setErrorHandler((error,req,reply)=>{
 const status=Number((error as any).statusCode||((error as any).issues?400:500));
 // A deliberate registration_not_open 503 is a safe business response;
 // do not mask it as a server_error 500. Unexpected 5xx still hide internals.
 if(status>=500 && !(error instanceof ApiError)){
  req.log.error({code:(error as any).code||'server_error'},'Nexa PF API request failed');
  return reply.code(500).send({error:'server_error',message:'Não foi possível concluir a operação.'});
 }
 return reply.code(status).send({error:(error as any).code||'invalid_request',
  message:error instanceof Error?error.message:'Requisição inválida.'});
});
await app.listen({host:'0.0.0.0',port:Number(process.env.PORT||4000)});
