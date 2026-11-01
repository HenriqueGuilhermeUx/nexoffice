// CI-only ERP-only signup and tenant isolation. Never target production.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const expected='postgresql://nexoffice:nexoffice@127.0.0.1:5432/nexoffice';
if (process.env.DATABASE_URL!==expected || process.env.NEXOFFICE_EXTERNAL_ACTIONS!=='false' || process.env.PORT!=='4000') throw new Error('Refusing to run outside disposable local CI');
const base='http://127.0.0.1:4000';
async function call(path,method='GET',body,token,workspace){
 const response=await fetch(base+path,{method,headers:{...(body?{'content-type':'application/json'}:{}),...(token?{authorization:'Bearer '+token}:{}),...(workspace?{'x-workspace-id':workspace}:{})},...(body?{body:JSON.stringify(body)}:{})});
 let value;try{value=await response.json()}catch{value={}};
 return {status:response.status,data:value};
}
function expectStatus(result,status,label){assert.equal(result.status,status,label+': '+JSON.stringify(result.data));return result.data}
const suffix=randomUUID().slice(0,8);
const password='Local-CI-Test-'+randomUUID();
async function register(n){
 const email='nexa-pj-'+suffix+'-'+n+'@example.invalid';
 const payload={name:'Empresa teste '+n,email,password,businessName:'PJ Empresa '+n,vertical:'general'};
 const data=expectStatus(await call('/v1/auth/register','POST',payload),200,'register '+n);
 assert.ok(data.token&&data.workspace?.id,'registration should return session and workspace');
 return {email,token:data.token,workspace:data.workspace.id};
}
const alpha=await register('alpha');
const beta=await register('beta');
const meA=expectStatus(await call('/v1/auth/me','GET',undefined,alpha.token),200,'auth/me alpha');
assert.ok(meA.workspaces?.some(w=>w.id===alpha.workspace),'alpha owns its workspace');
assert.ok(!meA.workspaces?.some(w=>w.id===beta.workspace),'alpha cannot list beta');
expectStatus(await call('/v1/workspace','GET',undefined,alpha.token,beta.workspace),403,'alpha denied beta');
expectStatus(await call('/v1/crm/contacts','GET',undefined,alpha.token,beta.workspace),403,'alpha CRM denied beta');
const login=expectStatus(await call('/v1/auth/login','POST',{email:alpha.email,password}),200,'alpha login');
assert.ok(login.token,'login returns token');
const meAgain=expectStatus(await call('/v1/auth/me','GET',undefined,login.token),200,'auth/me after login');
assert.ok(meAgain.workspaces?.some(w=>w.id===alpha.workspace),'workspace persists across login');
expectStatus(await call('/v1/workspace','GET',undefined,login.token,alpha.workspace),200,'own workspace');
expectStatus(await call('/v1/auth/logout','POST',{},login.token),200,'logout');
expectStatus(await call('/v1/auth/me','GET',undefined,login.token),401,'revoked session denied');
console.log('PASS Nexa PJ CI signup/login/workspace persistence/cross-tenant denial/logout.');
