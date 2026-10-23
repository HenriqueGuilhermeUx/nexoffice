// Independent Nex Personal preview API. No business routing, integrations, billing or jobs.
// Only enable for an isolated staging database, never an existing business/production DB.
import 'dotenv/config';
import {createHash,timingSafeEqual} from 'node:crypto';
import Fastify from 'fastify';
import {z} from 'zod';
import {query} from './db.js';
import {ApiError,issueSession,revokeSession,verifyPassword} from './auth.js';
import {runPersonalPreviewMigrations} from './personal-preview-migrations.js';
import {registerNexPersonalRoutes} from './routes-nex-personal.js';
import {registerNexPersonalStudioRoutes} from './routes-nex-personal-studio.js';

if(process.env.NEX_PERSONAL_PREVIEW!=='true')throw new Error('NEX_PERSONAL_PREVIEW=true required for isolated preview');
if(process.env.NEXOFFICE_EXTERNAL_ACTIONS!=='false')throw new Error('External actions must be disabled');
if(process.env.NEXOFFICE_INTELLIGENCE_DAILY_ENGINE!=='false')throw new Error('Business intelligence jobs must be disabled');
const inviteHash=String(process.env.NEX_PERSONAL_PREVIEW_INVITE_SHA256||'').trim().toLowerCase();
if(!/^[0-9a-f]{64}$/.test(inviteHash))throw new Error('NEX_PERSONAL_PREVIEW_INVITE_SHA256 must be a valid SHA256 hex digest.');
const allowedEmails=String(process.env.NEX_PERSONAL_PREVIEW_ALLOWED_EMAILS||'').split(',')
  .map(v=>v.trim().toLowerCase()).filter(Boolean);
if(!allowedEmails.length)throw new Error('A non-empty preview email allowlist is required.');
if(allowedEmails.some(e=>!z.email().safeParse(e).success))throw new Error('Preview email allowlist must contain valid addresses.');
const origin=String(process.env.ALLOWED_ORIGINS||'').trim();
if(!/^https:\/\/[^,\s/]+(?::\d+)?$/.test(origin))throw new Error('Single exact HTTPS ALLOWED_ORIGINS value required.');
const databaseUrl=String(process.env.DATABASE_URL||'');
if(!/^postgres(?:ql)?:\/\//.test(databaseUrl))throw new Error('Dedicated preview PostgreSQL URL required.');
const isolatedCi=process.env.CI==='true'&&process.env.NEX_PERSONAL_PREVIEW_CI==='true';
if(!isolatedCi&&!/nex[-_]?personal/i.test(databaseUrl))throw new Error('Preview database URL must identify Nex Personal, not NexOffices/Nexa.');
if(process.env.NEXOFFICE_DATABASE_SCOPE!=='nex-personal-preview')throw new Error('NEXOFFICE_DATABASE_SCOPE must be nex-personal-preview');
if(process.env.NODE_ENV!=='production')throw new Error('NODE_ENV=production required for public-facing staging');
if(process.env.AUTO_MIGRATE!=='true'&&!isolatedCi)throw new Error('AUTO_MIGRATE=true required for isolated preview bootstrapping.');

if(process.env.AUTO_MIGRATE==='true')await runPersonalPreviewMigrations();
const app=Fastify({logger:{level:'warn'},bodyLimit:512*1024});
const rate=new Map<string,{start:number;count:number}>();
function checkRate(key:string,limit:number,windowMs:number){
 const now=Date.now();const previous=rate.get(key);
 const info=previous&&now-previous.start<windowMs?previous:{start:now,count:0};
 info.count++;
 rate.set(key,info);
 if(rate.size>5000)for(const [k,v] of rate)if(now-v.start>windowMs)rate.delete(k);
 if(info.count>limit)throw new ApiError(429,'too_many_requests','Muitas tentativas. Aguarde e tente novamente.');
}
const emailSchema=z.string().trim().email().transform(v=>v.toLowerCase());
app.addHook('onRequest',async(req,reply)=>{
 reply.header('x-content-type-options','nosniff');
 reply.header('x-frame-options','DENY');
 reply.header('referrer-policy','no-referrer');
 reply.header('cache-control','no-store');
 reply.header('strict-transport-security','max-age=31536000');
 const requestOrigin=String(req.headers.origin||'');
 if(requestOrigin===origin)reply.header('access-control-allow-origin',origin);
 reply.header('vary','Origin');
 reply.header('access-control-allow-headers','authorization,content-type');
 reply.header('access-control-allow-methods','GET,POST,PUT,PATCH,DELETE,OPTIONS');
 // Browser CORS is not authentication; tokens remain required on sensitive reads.
 if(requestOrigin&&requestOrigin!==origin)throw new ApiError(403,'origin_denied','Origem não autorizada.');
});
app.options('*',async(_req,reply)=>reply.code(204).send());
app.addHook('preHandler',async req=>{
 if(req.url==='/v1/auth/login'||req.url==='/v1/personal/auth/register'){
   checkRate('auth:'+req.ip,12,15*60*1000);
   const email=emailSchema.parse((req.body as Record<string,unknown>)?.email);
   if(!allowedEmails.includes(email))throw new ApiError(403,'preview_invitation_required','Esta homologação está disponível apenas para testadores autorizados.');
   if(req.url==='/v1/personal/auth/register'){
     const code=String((req.body as Record<string,unknown>)?.previewInviteCode||'');
     const provided=createHash('sha256').update(code).digest();
     const expected=Buffer.from(inviteHash,'hex');
     if(!code||!timingSafeEqual(provided,expected))
       throw new ApiError(403,'preview_invitation_required','Código de convite inválido.');
   }
 }
});
app.get('/health',async()=>({status:'ok',service:'nex-personal-preview',externalFinancialActions:false,realBankConnections:false}));

app.post('/v1/auth/login',async req=>{
 const input=z.object({email:emailSchema,password:z.string().min(1).max(256)}).strict().parse(req.body);
 const rows=await query<{id:string;name:string;email:string;password_hash:string;status:string}>(
  'select id,name,email,password_hash,status from public.users where lower(email)=$1 limit 1',[input.email]);
 if(!rows.length||rows[0].status!=='active'||!(await verifyPassword(input.password,rows[0].password_hash)))
   throw new ApiError(401,'invalid_credentials','E-mail ou senha incorretos.');
 const session=await issueSession(rows[0].id);
 return {token:session.token,expiresAt:session.expiresAt,user:{id:rows[0].id,name:rows[0].name,email:rows[0].email}};
});
app.post('/v1/auth/logout',async req=>{await revokeSession(req);return {ok:true}});
await registerNexPersonalRoutes(app);
await registerNexPersonalStudioRoutes(app);

app.setErrorHandler((error,req,reply)=>{
 const status=Number((error as any).statusCode||((error as any).issues?400:500));
 // Do not leak raw SQL or PII in public error responses.
 if(status>=500){
  req.log.error({code:(error as any).code||'server_error',name:error.name},'Preview request failed');
  return reply.code(500).send({error:'server_error',message:'Não foi possível concluir a operação.'});
 }
 return reply.code(status).send({error:(error as any).code||'invalid_request',message:error.message});
});
await app.listen({host:'0.0.0.0',port:Number(process.env.PORT||4000)});
