// Production Nexa PJ pilot: registers one clearly labelled QA workspace.
// Never moves money, calls wallet APIs, or prints credentials.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const base='https://nexa-pj-erp-api.onrender.com';
const run=randomUUID();
const email='nexa-pj-pilot-'+run.slice(0,8)+'@example.invalid';
const password='Pilot-'+randomUUID()+'-X9';
const company='NEXA PJ QA PILOT — NAO E CLIENTE '+run.slice(0,8);
async function request(path,method='GET',payload,token,workspaceId){
 const response=await fetch(base+path,{
  signal:AbortSignal.timeout(45000),method,
  headers:{...(payload?{'content-type':'application/json'}:{}),...(token?{'authorization':'Bearer '+token}:{}),...(workspaceId?{'x-workspace-id':workspaceId}:{})},
  ...(payload?{body:JSON.stringify(payload)}:{})
 });
 const body=await response.json().catch(()=>({}));
 assert.equal(response.status,200,path+' returned '+response.status+' '+JSON.stringify({code:body?.code,error:body?.error}));
 return body;
}
const register=await request('/v1/auth/register','POST',{name:'Nexa PJ QA Pilot',email,password,businessName:company,vertical:'general'});
assert.ok(register.token&&register.workspace?.id,'signup lacks token/workspace');
const workspaceId=register.workspace.id;
const first=await request('/v1/auth/me','GET',undefined,register.token);
assert.ok(first.workspaces?.some(w=>w.id===workspaceId),'new company not in memberships');
const login=await request('/v1/auth/login','POST',{email,password});
assert.ok(login.token,'login lacks token');
const second=await request('/v1/auth/me','GET',undefined,login.token);
assert.ok(second.workspaces?.some(w=>w.id===workspaceId),'company not persisted after login');
const own=await request('/v1/workspace','GET',undefined,login.token,workspaceId);
assert.equal(own.id,workspaceId,'workspace mismatch');
for(const path of ['/v1/dashboard','/v1/crm/contacts','/v1/ledger','/v1/finance/accounts']){
  await request(path,'GET',undefined,login.token,workspaceId);
}
const unknown=await fetch(base+'/v1/workspace',{signal:AbortSignal.timeout(45000),headers:{authorization:'Bearer '+login.token,'x-workspace-id':randomUUID()}});
assert.equal(unknown.status,403,'cross-company workspace access should return 403');
await request('/v1/auth/logout','POST',{},login.token);
const expired=await fetch(base+'/v1/auth/me',{signal:AbortSignal.timeout(45000),headers:{authorization:'Bearer '+login.token}});
assert.equal(expired.status,401,'logout did not revoke login token');
await request('/v1/auth/logout','POST',{},register.token);
console.log('PASS Nexa PJ production QA pilot: registration, real login, persistence, ERP reads, denied unauthorized workspace, logout.');
console.log('Pilot workspace ID (for later archival): '+workspaceId);
console.log('Pilot email (non-deliverable): '+email);
