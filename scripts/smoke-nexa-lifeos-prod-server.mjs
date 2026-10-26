import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import net from 'node:net';
import {setTimeout as sleep} from 'node:timers/promises';

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
 console.log('Nexa PF production API local-only boot, denied signup, CORS and PJ isolation PASS');
}finally{
 processChild.kill('SIGTERM');
 await sleep(75);
 if(processChild.exitCode===null)processChild.kill('SIGKILL');
}
