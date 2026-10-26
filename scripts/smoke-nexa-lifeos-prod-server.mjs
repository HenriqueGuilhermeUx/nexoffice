import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import net from 'node:net';
import {setTimeout as sleep} from 'node:timers/promises';

const productionSource=readFileSync('apps/api/src/server-personal-production.ts','utf8');
const sharedSource=readFileSync('apps/api/src/routes-nex-personal.ts','utf8');
const contextLock=readFileSync('apps/api/src/nexa-lifeos-prod-user-context.ts','utf8');
assert.match(contextLock,/requireVerifiedLifeosUserContext\(\):never/);
assert.doesNotMatch(contextLock.replace(/\/\*[\s\S]*?\*\//g,''),/process\.env|\bBYPASS\b|\bMOCK\b|return true/i);
assert.match(productionSource,/requireVerifiedLifeosUserContext\(\);/);
const privacySource=readFileSync('apps/api/src/routes-nex-personal-privacy.ts','utf8');
const agentsSource=readFileSync('apps/api/src/routes-nex-personal-agents.ts','utf8');
const finsightSource=readFileSync('apps/api/src/routes-nex-personal-finsight.ts','utf8');
assert.match(privacySource,/NEXA_LIFEOS_ENV==='production'/);
assert.match(privacySource,/Dados da conta Nexa são armazenados no serviço pessoal dedicado/);
assert.match(privacySource,/Dados da conta ficam no servidor isolado da homologação/);
assert.match(agentsSource,/deterministic_read_only/);
assert.match(agentsSource,/Nenhum Pix, boleto ou pagamento real é iniciado por este módulo Nexa/);
assert.match(finsightSource,/O F-Insight ainda não está conectado a esta conta Nexa/);
assert.match(sharedSource,/if\(options\.registrationEnabled!==false\)app\.post\('\/v1\/personal\/auth\/register'/);
assert.match(productionSource,/registerNexPersonalRoutes\(app,\{registrationEnabled:false\}\)/);
assert.doesNotMatch(productionSource,/registerNexPersonalRoutes\(app\);/);
assert.match(productionSource,/app\.post\('\/v1\/personal\/auth\/register',[\s\S]*registration_not_open/);

const dummy={
 NEXA_LIFEOS_ENV:'production',NODE_ENV:'production',
 NEXA_LIFEOS_PROD_RELEASE_APPROVED:'true',
 NEXA_LIFEOS_AUTH_REVIEW_APPROVED:'true',
 NEXA_LIFEOS_PUBLIC_SIGNUP_ENABLED:'false',
 NEXOFFICE_EXTERNAL_ACTIONS:'false',
 NEXOFFICE_INTELLIGENCE_DAILY_ENGINE:'false',
 AUTO_MIGRATE:'false',NEXOFFICE_DATABASE_SCOPE:'nexa-lifeos-prod',
 NEXA_LIFEOS_DB_TLS_STRICT:'true',NEXA_LIFEOS_DISABLE_DEMO_SEED:'true',
 ALLOWED_ORIGINS:'https://trynexa.com.br',
 NEXA_LIFEOS_API_ORIGIN:'https://api-life.trynexa.com.br',
 VITE_NEXA_LIFEOS_API_URL:'https://api-life.trynexa.com.br',
 VITE_NEXA_LIFEOS_PUBLIC:'true',
 VITE_NEXA_LIFEOS_BUILD_PROBE:'false',
 NEXA_LIFEOS_ALLOW_WALLET_TOKEN_BRIDGE:'false',
 NEXA_LIFEOS_ALLOW_PRIVY_CREATE_WALLET:'false',
 NEXA_LIFEOS_DB_HOST:'ep-ci-only-x123.us-east-2.aws.neon.tech',
 NEXA_LIFEOS_NEON_PROJECT_ID:'blue-ci-12345678',
 DATABASE_URL:'postgresql://dummy_ci_user:dummy_ci_password@ep-ci-only-x123.us-east-2.aws.neon.tech/nexa_lifeos_prod?sslmode=verify-full',
 SESSION_TTL_DAYS:'7'
};

function localPort(){
 return new Promise((resolve,reject)=>{
  const server=net.createServer();
  server.once('error',reject);
  server.listen(0,'127.0.0.1',()=>{
   const address=server.address();
   server.close(()=>resolve(address.port));
  });
 });
}
async function probe(url,path,opts={}){
 const r=await fetch(url+path,{...opts,signal:AbortSignal.timeout(3500)});
 const body=await r.json().catch(()=>null);
 return {r,body};
}
const port=await localPort();
const url='http://127.0.0.1:'+port;
const processChild=spawn(process.execPath,['apps/api/dist/server-personal-production.js'],{
 env:{...process.env,...dummy,PORT:String(port)},stdio:['ignore','pipe','pipe']
});
let errors='';
processChild.stderr.on('data',data=>{errors+=String(data).slice(0,800)});
try{
 let ready=false;
 for(let i=0;i<55;i++){
  if(processChild.exitCode!==null)throw Error('Server exited unexpectedly (without database use)');
  try{const v=await probe(url,'/health/live');if(v.r.status===200){ready=true;break;}}catch{}
  await sleep(100);
 }
 assert.ok(ready,'Isolated production API must boot with valid dummy env and without DB queries');
 const live=await probe(url,'/health/live');
 assert.equal(live.r.status,200);
 assert.equal(live.body.service,'nexa-lifeos-prod-api');
 // The API can be live as a process but must NOT claim production readiness
 // while session identity is not yet bound to a PostgreSQL RLS transaction.
 const readyGate=await probe(url,'/health');
 assert.equal(readyGate.r.status,503,'PF production readiness stays closed until tenant E2E');
 assert.equal(readyGate.body.error,'identity_context_not_ready');
 const validLookingLogin=await probe(url,'/v1/auth/login',{
   method:'POST',headers:{origin:'https://trynexa.com.br','content-type':'application/json'},
   body:JSON.stringify({email:'nobody@example.test',password:'dummy-only'})
 });
 assert.equal(validLookingLogin.r.status,503,'Do not query users table without verified RLS identity context');
 assert.equal(validLookingLogin.body.error,'identity_context_not_ready');
 const fakeBearer=await probe(url,'/v1/personal/me',{headers:{authorization:'Bearer dummy-token-never-valid'}});
 assert.equal(fakeBearer.r.status,503,'Auth-bearing PF route must not query pooled DB without per-user context');
 assert.equal(fakeBearer.body.error,'identity_context_not_ready');
 const logoutBlocked=await probe(url,'/v1/auth/logout',{
  method:'POST',headers:{authorization:'Bearer dummy-token-never-valid'}
 });
 assert.equal(logoutBlocked.r.status,503,'Session writes are blocked until RLS-safe identity is designed');
 const register=await probe(url,'/v1/personal/auth/register',{
   method:'POST',headers:{origin:'https://trynexa.com.br','content-type':'application/json'},
   body:JSON.stringify({name:'Dummy',email:'dummy@example.test',password:'fake-ci-password-only'})
 });
 assert.equal(register.r.status,503,'Public PF registration must remain disabled');
 assert.equal(register.body.error,'registration_not_open');
 const denial=await probe(url,'/v1/personal/auth/register',{
   method:'OPTIONS',headers:{origin:'https://wallet.trynexa.com.br'}
 });
 assert.equal(denial.r.status,403,'Wallet origin must not be authorized on Life OS PF API');
 const pj=await probe(url,'/v1/workspaces');
 assert.equal(pj.r.status,404,'PJ business endpoints must not be exposed');
 const browserPreflight=await probe(url,'/v1/personal/me',{
   method:'OPTIONS',headers:{origin:'https://trynexa.com.br',
    'access-control-request-method':'GET'}
 });
 assert.equal(browserPreflight.r.status,204);
 assert.equal(browserPreflight.r.headers.get('access-control-allow-origin'),'https://trynexa.com.br');
 // No session must never access PF financial or private-data routes.
 for(const route of ['/v1/personal/me','/v1/personal/overview','/v1/personal/accounts','/v1/personal/consents']){
   const {r,body}=await probe(url,route);
   assert.equal(r.status,401,'Private Nexa PF endpoint requires separate user session: '+route);
   assert.ok(!String(JSON.stringify(body)).includes('password'),'No private auth material in a 401 response');
 }
 // Authentication validates request shape and throttles attempts before any
 // PostgreSQL query: all 13 payloads are deliberately invalid JSON inputs.
 // This exercises the abuse gate WITHOUT connecting to the dummy Neon host.
 for(let i=0;i<11;i++){
   const invalid=await probe(url,'/v1/auth/login',{
     method:'POST',headers:{'content-type':'application/json',origin:'https://trynexa.com.br'},
     body:JSON.stringify({email:'not-an-email',password:'dummy'})
   });
   assert.equal(invalid.r.status,400,'Malformed sign-in must be rejected before DB query');
 }
 const tooMany=await probe(url,'/v1/auth/login',{
   method:'POST',headers:{'content-type':'application/json',origin:'https://trynexa.com.br'},
   body:JSON.stringify({email:'not-an-email',password:'dummy'})
 });
 assert.equal(tooMany.r.status,429,'Repeated malformed login must be throttled');
 assert.equal(tooMany.body.error,'too_many_requests');
 const fromWallet=await probe(url,'/health/live',{
   headers:{origin:'https://wallet.trynexa.com.br'}
 });
 assert.equal(fromWallet.r.status,403,'Wallet JS cannot access Nexa PF API via CORS');
 assert.equal(fromWallet.r.headers.get('access-control-allow-origin'),null);
 console.log('Nexa PF local API: live, signup gate, private auth, login throttle, Wallet origin and PJ isolation PASS');
}finally{
 processChild.kill('SIGTERM');
 await sleep(75);
 if(processChild.exitCode===null)processChild.kill('SIGKILL');
}
