import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { USLabStore } from '../src/store.mjs';
import { startUSOIDCBFF } from '../src/bff.mjs';

const issuer='https://login.us-example.example/oidc';
const authorizationEndpoint='https://login.us-example.example/authorize';
const clientId='nexoffices-usa-bff-fixture';
const pair=generateKeyPairSync('rsa',{modulusLength:2048});
const jwks={keys:[{...pair.publicKey.export({format:'jwk'}),kid:'bff-fixture-key',alg:'RS256',use:'sig'}]};
const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
function signed(claims) {
  const data=enc({alg:'RS256',typ:'JWT',kid:'bff-fixture-key'})+'.'+enc(claims);
  return data+'.'+sign('RSA-SHA256',Buffer.from(data),pair.privateKey).toString('base64url');
}
async function runFixture(callback) {
  const previous=process.env.USA_LAB_ENABLED,mode=process.env.NODE_ENV;
  process.env.USA_LAB_ENABLED='1';delete process.env.NODE_ENV;
  const dir=mkdtempSync(join(tmpdir(),'nexoffices-us-lab-'));
  const store=new USLabStore(join(dir,'us-lab.sqlite'));
  let bff;
  try {
    const orgA=store.provisionOrganization('US Sample Alpha');
    const orgB=store.provisionOrganization('US Sample Beta');
    const userA=store.provisionUser({orgId:orgA.id,email:'alice@alpha.example',password:'Fixtures-Only-Password-2026'});
    const userB=store.provisionUser({orgId:orgB.id,email:'bob@beta.example',password:'Fixtures-Only-Password-2026'});
    store.linkOIDCSubject({issuer,subject:'alpha-subject',orgId:orgA.id,userId:userA.id});
    store.linkOIDCSubject({issuer,subject:'beta-subject',orgId:orgB.id,userId:userB.id});
    const promises=new Map();
    let exchangeCount=0;
    bff=await startUSOIDCBFF({
      enabled:true,store,issuer,authorizationEndpoint,clientId,jwks,
      exchangeCode:async({code,codeVerifier,redirectUri,clientId:actualClient})=>{
        exchangeCount++;
        const fixture=promises.get(code);
        assert.ok(fixture,'Unknown fixture auth code');
        assert.equal(redirectUri,bff.origin+'/lab/oidc/callback');
        assert.equal(actualClient,clientId);
        assert.equal(createHash('sha256').update(codeVerifier).digest('base64url'),fixture.challenge);
        return {id_token:signed({
          iss:issuer,sub:fixture.subject,aud:clientId,
          exp:Math.floor(Date.now()/1000)+600,iat:Math.floor(Date.now()/1000),
          nonce:fixture.nonce,region:'US',
          // These forged claims must NOT grant cross-tenant access.
          org_id:fixture.forgedOrg??orgB.id,email:'admin@wrong.example'
        })};
      }
    });
    await callback({bff,store,orgA,orgB,userA,userB,promises,exchanges:()=>exchangeCount});
  }finally{
    if(bff)await bff.close();
    store.close();rmSync(dir,{recursive:true,force:true});
    if(previous===undefined)delete process.env.USA_LAB_ENABLED;else process.env.USA_LAB_ENABLED=previous;
    if(mode===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=mode;
  }
}
async function request(origin,path,method='GET',body,cookie,options={}) {
  const headers={
    ...(method==='POST'?{Origin:origin,'Content-Type':'application/json'}:{}),
    ...(cookie?{Cookie:cookie}:{}),
    ...(options.headers??{})
  };
  const response=await fetch(origin+path,{
    method,headers,
    body:method==='POST'?JSON.stringify(body??{}):undefined,
    redirect:'manual'
  });
  const raw=await response.text();
  const data=raw?JSON.parse(raw):null;
  return {status:response.status,data,headers:response.headers,cookies:response.headers.getSetCookie()};
}
const cookie=(cookies,name)=>{
  const item=cookies.find(value=>value.startsWith(name+'='));
  assert.ok(item,'Expected cookie '+name);
  return item.split(';')[0];
};
async function begin({bff,promises},orgId,code,subject) {
  const r=await request(bff.origin,'/lab/oidc/begin','POST',{orgId});
  assert.equal(r.status,200);
  const binding=cookie(r.cookies,'us_lab_oidc_binding');
  assert.match(r.cookies.join(';'),/HttpOnly/);
  assert.match(r.cookies.join(';'),/SameSite=Lax/);
  assert.match(r.cookies.join(';'),/Max-Age=300/);
  const u=new URL(r.data.authorizationUrl);
  assert.equal(u.origin,'https://login.us-example.example');
  assert.equal(u.searchParams.get('redirect_uri'),bff.origin+'/lab/oidc/callback');
  assert.equal(u.searchParams.get('code_challenge_method'),'S256');
  promises.set(code,{
    subject,nonce:u.searchParams.get('nonce'),
    challenge:u.searchParams.get('code_challenge')
  });
  return {state:u.searchParams.get('state'),binding};
}
async function callback(bff,started,code,binding=started.binding){
  return request(bff.origin,'/lab/oidc/callback?state='+started.state+'&code='+code,'GET',undefined,binding);
}

test('synthetic OIDC BFF completes one-time callback, HttpOnly session, org-scoped tasks and logout',()=>{
  return runFixture(async({bff,orgA,orgB,userA,promises,exchanges})=>{
    const a=await begin({bff,promises},orgA.id,'alpha-code','alpha-subject');
    const done=await callback(bff,a,'alpha-code');
    assert.equal(done.status,303);
    assert.equal(done.headers.get('location'),'/lab/oidc/result');
    assert.equal(done.headers.get('cache-control'),'no-store, max-age=0');
    assert.equal(done.headers.get('referrer-policy'),'no-referrer');
    assert.ok(!done.headers.get('location').includes('code'));
    const session=cookie(done.cookies,'us_lab_oidc_session');
    assert.match(done.cookies.join(' '),/SameSite=Strict/);
    assert.match(done.cookies.join(' '),/HttpOnly/);
    assert.equal(exchanges(),1);
    const me=await request(bff.origin,'/lab/oidc/result','GET',undefined,session);
    assert.equal(me.status,200);assert.deepEqual(me.data,{
      authenticated:true,region:'US',orgId:orgA.id,userId:userA.id
    });
    const created=await request(bff.origin,'/lab/oidc/tasks','POST',{title:'Example US sales follow-up'},session);
    assert.equal(created.status,201);
    assert.equal((await request(bff.origin,'/lab/oidc/tasks','GET',undefined,session)).data.tasks.length,1);
    assert.equal((await request(bff.origin,'/lab/oidc/tasks?orgId='+orgB.id,'GET',undefined,session)).status,400);
    assert.equal((await request(bff.origin,'/lab/oidc/tasks','POST',{title:'Forged',orgId:orgB.id},session)).status,400);
    assert.equal((await request(bff.origin,'/lab/oidc/tasks','POST',{title:'Forged',region:'BR'},session)).status,400);
    assert.equal((await request(bff.origin,'/lab/oidc/logout','POST',{},session)).status,200);
    assert.equal((await request(bff.origin,'/lab/oidc/result','GET',undefined,session)).status,401);
    assert.equal((await callback(bff,a,'alpha-code')).status,401);
    assert.equal(exchanges(),1);
  });
});
test('another US organization cannot read or create data in the first tenant',()=>{
  return runFixture(async({bff,orgA,orgB,promises})=>{
    const first=await begin({bff,promises},orgA.id,'code-alpha','alpha-subject');
    const firstCallback=await callback(bff,first,'code-alpha');
    const firstSession=cookie(firstCallback.cookies,'us_lab_oidc_session');
    const second=await begin({bff,promises},orgB.id,'code-beta','beta-subject');
    const secondCallback=await callback(bff,second,'code-beta');
    const secondSession=cookie(secondCallback.cookies,'us_lab_oidc_session');
    assert.equal((await request(bff.origin,'/lab/oidc/tasks','POST',{title:'Alpha secret sample'},firstSession)).status,201);
    const tasksB=await request(bff.origin,'/lab/oidc/tasks','GET',undefined,secondSession);
    assert.equal(tasksB.status,200);assert.deepEqual(tasksB.data.tasks,[]);
    assert.equal((await request(bff.origin,'/lab/oidc/tasks','POST',{orgId:orgA.id,title:'Steal alpha'},secondSession)).status,400);
    assert.equal((await request(bff.origin,'/lab/oidc/tasks','GET',undefined,firstSession)).data.tasks.length,1);
  });
});
test('wrong browser proof consumes state and prevents a later valid callback',()=>{
  return runFixture(async({bff,orgA,promises,exchanges})=>{
    const start=await begin({bff,promises},orgA.id,'stolen-code','alpha-subject');
    const other=await begin({bff,promises},orgA.id,'other-code','alpha-subject');
    const hijack=await callback(bff,start,'stolen-code',other.binding);
    assert.equal(hijack.status,401);
    assert.equal((await callback(bff,start,'stolen-code')).status,401);
    assert.equal(exchanges(),0);
    assert.equal((await request(bff.origin,'/lab/oidc/result','GET')).status,401);
  });
});
test('no network bind, no external origin, no open registration or permissive CORS',()=>{
  return runFixture(async({bff,store,orgA})=>{
    const bad=await request(bff.origin,'/lab/oidc/begin','POST',{orgId:orgA.id},null,{headers:{Origin:'https://attacker.example'}});
    assert.equal(bad.status,403);
    assert.equal((await request(bff.origin,'/lab/oidc/register','POST',{email:'x@fixture.example'})).status,401);
    assert.equal((await request(bff.origin,'/lab/oidc/result','GET',null,null,{headers:{Host:'evil.example'}})).status,403);
    assert.equal((await request(bff.origin,'/lab/oidc/result','GET',null,null,{headers:{'X-Forwarded-Host':'other.example'}})).status,403);
    const res=await request(bff.origin,'/lab/oidc/result');
    assert.equal(res.headers.get('access-control-allow-origin'),null);
    assert.equal(res.headers.get('content-security-policy').includes("default-src 'none'"),true);
    assert.equal((await request(bff.origin,'/api/v1/user/me')).status,404);
    await assert.rejects(()=>startUSOIDCBFF({enabled:true,host:'0.0.0.0',store}),/loopback/);
    await assert.rejects(()=>startUSOIDCBFF({enabled:true,store,issuer:'https://login.real-provider.com',authorizationEndpoint}),/synthetic/);
    await assert.rejects(()=>startUSOIDCBFF({enabled:true,store,nodeEnv:'production'}),/disabled/);
  });
});
