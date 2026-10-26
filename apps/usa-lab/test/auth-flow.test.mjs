import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createUSOIDCLabFlow, newUSLabBrowserBinding } from '../src/auth-flow.mjs';
import { USLabStore } from '../src/store.mjs';

const issuer='https://id.us-fixture.example/oidc';
const authorizationEndpoint='https://id.us-fixture.example/authorize';
const redirectUri='http://127.0.0.1:4777/lab/oidc-callback';
const clientId='nexoffices-us-test';
const keys=generateKeyPairSync('rsa',{modulusLength:2048});
const jwks={keys:[{...keys.publicKey.export({format:'jwk'}),kid:'us-fixture-kid',alg:'RS256',use:'sig'}]};
const enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const signed=(claims)=>{
  const body=enc({alg:'RS256',kid:'us-fixture-kid',typ:'JWT'})+'.'+enc(claims);
  return body+'.'+sign('RSA-SHA256',Buffer.from(body),keys.privateKey).toString('base64url');
};
const options={issuer,authorizationEndpoint,redirectUri,clientId,jwks};

async function withEnabled(operation) {
  const previous=process.env.USA_LAB_ENABLED;
  const previousMode=process.env.NODE_ENV;
  process.env.USA_LAB_ENABLED='1';
  delete process.env.NODE_ENV;
  try { return await operation(); }
  finally {
    if(previous===undefined)delete process.env.USA_LAB_ENABLED;
    else process.env.USA_LAB_ENABLED=previous;
    if(previousMode===undefined)delete process.env.NODE_ENV;
    else process.env.NODE_ENV=previousMode;
  }
}

test('PKCE binds code exchange to one-time state, nonce, and browser proof with explicit tenant membership',()=>withEnabled(async()=>{
  const dir=mkdtempSync(join(tmpdir(),'nexoffices-us-lab-'));
  const store=new USLabStore(join(dir,'us-lab.sqlite'));
  try{
    const orgA=store.provisionOrganization('US Example Alpha');
    const orgB=store.provisionOrganization('US Example Beta');
    const user=store.provisionUser({orgId:orgA.id,email:'alice@alpha.example',password:'Fixtures-Only-Password-2026'});
    store.linkOIDCSubject({issuer,subject:'signed-fixture-person',orgId:orgA.id,userId:user.id});
    const browserBinding=newUSLabBrowserBinding();
    assert.match(browserBinding,/^[A-Za-z0-9_-]{43}$/);
    let nonce='',challenge='',exchanges=0;
    const flow=createUSOIDCLabFlow({
      ...options,
      exchangeCode:async({code,codeVerifier,redirectUri:callback,clientId:aud})=>{
        exchanges++;
        assert.equal(code,'fixture-auth-code');
        assert.equal(callback,redirectUri);
        assert.equal(aud,clientId);
        assert.equal(createHash('sha256').update(codeVerifier).digest('base64url'),challenge);
        return {id_token:signed({
          iss:issuer,sub:'signed-fixture-person',aud:clientId,
          iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,
          nonce,region:'US',org_id:orgB.id,email:'impersonated@beta.example'
        })};
      },
      resolveMember:input=>store.resolveOIDCSubject(input)
    });
    const start=flow.begin({orgId:orgA.id,browserBinding});
    const url=new URL(start.authorizationUrl);
    assert.equal(url.origin,'https://id.us-fixture.example');
    assert.equal(url.searchParams.get('response_type'),'code');
    assert.equal(url.searchParams.get('scope'),'openid');
    assert.equal(url.searchParams.get('code_challenge_method'),'S256');
    assert.equal(url.searchParams.get('client_id'),clientId);
    assert.equal(url.searchParams.get('redirect_uri'),redirectUri);
    assert.equal(url.searchParams.get('state'),start.state);
    assert.ok(!start.authorizationUrl.includes(browserBinding),'Browser cookie proof must not appear in authorization URL');
    nonce=url.searchParams.get('nonce');
    challenge=url.searchParams.get('code_challenge');
    assert.match(challenge,/^[A-Za-z0-9_-]{43}$/);
    const identity=await flow.complete({state:start.state,code:'fixture-auth-code',browserBinding});
    assert.deepEqual(identity,{region:'US',orgId:orgA.id,userId:user.id,subject:'signed-fixture-person'});
    assert.ok(Object.isFrozen(identity));
    assert.equal(exchanges,1);
    await assert.rejects(()=>flow.complete({state:start.state,code:'fixture-auth-code',browserBinding}),/US OIDC lab flow rejected/);
    assert.equal(exchanges,1);
  } finally {store.close();rmSync(dir,{recursive:true,force:true});}
}));

test('wrong browser, expired/replayed state and missing membership fail closed',()=>withEnabled(async()=>{
  const orgId='11111111-1111-4111-8111-111111111111';
  const binding=newUSLabBrowserBinding(),other=newUSLabBrowserBinding();
  let clockMs=Date.now(),calls=0;
  const flow=createUSOIDCLabFlow({
    ...options,clock:()=>clockMs,
    exchangeCode:async()=>{calls++;return {id_token:'untrusted'};},
    resolveMember:()=>null
  });
  const first=flow.begin({orgId,browserBinding:binding});
  await assert.rejects(()=>flow.complete({state:first.state,code:'fixture-code',browserBinding:other}),/rejected/);
  await assert.rejects(()=>flow.complete({state:first.state,code:'fixture-code',browserBinding:binding}),/rejected/);
  assert.equal(calls,0);
  const second=flow.begin({orgId,browserBinding:binding});
  clockMs+=5*60_000+1;
  await assert.rejects(()=>flow.complete({state:second.state,code:'fixture-code',browserBinding:binding}),/rejected/);
  assert.equal(calls,0);
  clockMs=Date.now();
  const third=flow.begin({orgId,browserBinding:binding});
  await assert.rejects(()=>flow.complete({state:third.state,code:'fixture-code',browserBinding:binding}),/rejected/);
  assert.equal(calls,1);
  await assert.rejects(()=>flow.complete({state:third.state,code:'fixture-code',browserBinding:binding}),/rejected/);
}));

test('nonce mismatch, invalid claims, and missing tenant membership never create identity',()=>withEnabled(async()=>{
  const orgId='22222222-2222-4222-8222-222222222222';
  const binding=newUSLabBrowserBinding();
  let nonce='',verifier='',memberLookups=0;
  const flow=createUSOIDCLabFlow({
    ...options,
    exchangeCode:async({codeVerifier})=>{
      verifier=codeVerifier;
      return {id_token:signed({
        iss:issuer,sub:'fixture-person',aud:clientId,
        exp:Math.floor(Date.now()/1000)+300,nonce,region:'US'
      })};
    },
    resolveMember:()=>{memberLookups++;return null;}
  });
  const first=flow.begin({orgId,browserBinding:binding});
  nonce=newUSLabBrowserBinding(); // deliberately different from authorization nonce
  await assert.rejects(()=>flow.complete({state:first.state,code:'fixture-code',browserBinding:binding}),/rejected/);
  assert.match(verifier,/^[A-Za-z0-9_-]{43}$/);
  assert.equal(memberLookups,0);
  const second=flow.begin({orgId,browserBinding:binding});
  nonce=new URL(second.authorizationUrl).searchParams.get('nonce');
  await assert.rejects(()=>flow.complete({state:second.state,code:'fixture-code',browserBinding:binding}),/rejected/);
  assert.equal(memberLookups,1);
}));

test('disabled by default and no public or untrusted identity-provider configuration',()=>withEnabled(async()=>{
  const base={...options,exchangeCode:async()=>({}),resolveMember:()=>null};
  assert.throws(()=>createUSOIDCLabFlow({...base,authorizationEndpoint:'https://attacker.example/authorize'}),/rejected/);
  assert.throws(()=>createUSOIDCLabFlow({...base,authorizationEndpoint:'http://id.us-fixture.example/authorize'}),/rejected/);
  assert.throws(()=>createUSOIDCLabFlow({...base,redirectUri:'https://public.example/callback'}),/rejected/);
  assert.throws(()=>createUSOIDCLabFlow({...base,redirectUri:'http://localhost:4777/lab/callback'}),/rejected/);
  assert.throws(()=>createUSOIDCLabFlow({...base,redirectUri:'http://127.0.0.1:4777/brazil/callback'}),/rejected/);
  assert.throws(()=>createUSOIDCLabFlow({...base,clientId:''}),/rejected/);
  let flow=createUSOIDCLabFlow(base);
  assert.throws(()=>flow.begin({orgId:'BR',browserBinding:newUSLabBrowserBinding()}),/rejected/);
  assert.throws(()=>flow.begin({orgId:'11111111-1111-4111-8111-111111111111',browserBinding:'bad'}),/rejected/);
  process.env.NODE_ENV='production';
  assert.throws(()=>createUSOIDCLabFlow(base),/rejected/);
  delete process.env.NODE_ENV;
  delete process.env.USA_LAB_ENABLED;
  assert.throws(()=>createUSOIDCLabFlow(base),/rejected/);
}));
