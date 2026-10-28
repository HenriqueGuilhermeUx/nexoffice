import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyUSOIDCToken } from '../src/oidc.mjs';
import { USLabStore } from '../src/store.mjs';

const issuer='https://login.us-fixture.example/oidc';
const audience='nexoffices-us-fixture';
const pair=generateKeyPairSync('rsa',{modulusLength:2048});
const key={...pair.publicKey.export({format:'jwk'}),kid:'us-lab-key',alg:'RS256',use:'sig'};
const jwks={keys:[key]};
const now=Date.now(),sec=Math.floor(now/1000);
const claims={iss:issuer,sub:'fixture-person-001',aud:audience,iat:sec,exp:sec+600,region:'US'};
const encode=obj=>Buffer.from(JSON.stringify(obj)).toString('base64url');
function token(payload=claims,header={alg:'RS256',kid:'us-lab-key',typ:'JWT'}) {
 const signed=encode(header)+'.'+encode(payload);
 return signed+'.'+sign('RSA-SHA256',Buffer.from(signed),pair.privateKey).toString('base64url');
}
const config={issuer,audience,jwks,now};

test('pinned offline OIDC identity validates signed issuer, audience, expiry and region',()=>{
 const result=verifyUSOIDCToken(token(),config);
 assert.deepEqual(result,{issuer,subject:claims.sub,expiresAt:claims.exp,region:'US'});
 assert.ok(Object.isFrozen(result));
 for(const changed of [
  {...claims,iss:'https://untrusted.example/oidc'},
  {...claims,aud:'wrong-client'},
  {...claims,exp:sec-1000},
  {...claims,nbf:sec+1000},
  {...claims,iat:sec+1000},
  {...claims,region:'BR'},
  {...claims,region_code:'BR'},
  {...claims,sub:''},
  {...claims,aud:[audience,'other-client']},
  {...claims,aud:[audience,'other-client'],azp:'other-client'},
 ])assert.throws(()=>verifyUSOIDCToken(token(changed),config),/Invalid US identity token/);
});
test('rejects tampering, key references, missing trust, duplicate keys and algorithm confusion',()=>{
 const original=token(),segments=original.split('.');
 assert.throws(()=>verifyUSOIDCToken(segments[0]+'.'+encode({...claims,sub:'attacker'})+'.'+segments[2],config),/Invalid US identity token/);
 for(const header of [
  {alg:'none',kid:'us-lab-key'},
  {alg:'HS256',kid:'us-lab-key'},
  {alg:'RS256',kid:'wrong-key'},
  {alg:'RS256',kid:'us-lab-key',jku:'https://attacker.example/jwks.json'},
  {alg:'RS256',kid:'us-lab-key',jwk:key},
  {alg:'RS256',kid:'us-lab-key',crit:['b64']},
 ]) assert.throws(()=>verifyUSOIDCToken(token(claims,header),config),/Invalid US identity token/);
 assert.throws(()=>verifyUSOIDCToken('abc.def',config),/Invalid US identity token/);
 assert.throws(()=>verifyUSOIDCToken(original,{...config,jwks:{keys:[]}}),/Invalid US identity token/);
 assert.throws(()=>verifyUSOIDCToken(original,{...config,jwks:{keys:[key,key]}}),/Invalid US identity token/);
 assert.throws(()=>verifyUSOIDCToken(original,{...config,issuer:'http://localhost'}),/Invalid US identity token/);
});
test('signed subject cannot claim another tenant without US membership in separate store',()=>{
 const dir=mkdtempSync(join(tmpdir(),'nexoffices-us-lab-'));
 const store=new USLabStore(join(dir,'us-lab.sqlite'));
 try{
  const orgA=store.provisionOrganization('Fictional US One'),orgB=store.provisionOrganization('Fictional US Two');
  const user=store.provisionUser({orgId:orgA.id,email:'alice@one.example',password:'Fixtures-Only-Password-2026'});
  const forged=verifyUSOIDCToken(token({...claims,org_id:orgB.id,email:'admin@another.example'}),config);
  assert.equal(store.resolveOIDCSubject({issuer:forged.issuer,subject:forged.subject,orgId:orgB.id}),null);
  assert.throws(()=>store.linkOIDCSubject({issuer,subject:claims.sub,orgId:orgB.id,userId:user.id}),/requires US membership/);
  store.linkOIDCSubject({issuer,subject:claims.sub,orgId:orgA.id,userId:user.id});
  assert.equal(store.resolveOIDCSubject({issuer,subject:claims.sub,orgId:orgA.id}).userId,user.id);
  assert.equal(store.resolveOIDCSubject({issuer,subject:claims.sub,orgId:orgB.id}),null);
  assert.equal(store.resolveOIDCSubject({issuer:'https://different.example',subject:claims.sub,orgId:orgA.id}),null);
  assert.throws(()=>store.linkOIDCSubject({issuer,subject:claims.sub,orgId:orgA.id,userId:user.id}),/UNIQUE constraint/);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
