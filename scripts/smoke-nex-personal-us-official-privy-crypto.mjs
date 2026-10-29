import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID,sign} from 'node:crypto';
import {verifyAccessToken} from '@privy-io/node';
import {verifyPrivyUSAccessSession} from '../apps/api/src/personal-us-privy-session.ts';

/**
 * Official Privy SDK verification of real, ephemeral ES256 JWT signatures.
 * Uses an isolated generated test key, NEVER a production US/BR Privy key.
 * No service auth, provider API, customer data or wallet action occurs.
 */
if(process.env.NPU_OFFICIAL_PRIVY_CRYPTO_CI!=='true')
 throw Error('US_PRIVY_REAL_VERIFY_CI_NOT_APPROVED');
const {publicKey,privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const verificationKey=publicKey.export({type:'spki',format:'pem'});
const appId='us-privy-cryptotest-'+randomUUID();
const now=new Date();
const time=Math.floor(now.getTime()/1000);
const claims={sub:'did:privy:us-test',iss:'privy.io',aud:appId,
 sid:'privy-test-session-123',iat:time-20,exp:time+900};
function signJWT(payload){
 const header=Buffer.from(JSON.stringify({alg:'ES256',typ:'JWT'})).toString('base64url');
 const body=Buffer.from(JSON.stringify(payload)).toString('base64url');
 const signingInput=header+'.'+body;
 const signature=sign('sha256',Buffer.from(signingInput),{key:privateKey,dsaEncoding:'ieee-p1363'})
  .toString('base64url');
 return signingInput+'.'+signature;
}
const token=signJWT(claims);
const direct=await verifyAccessToken({access_token:token,app_id:appId,verification_key:verificationKey});
assert.equal(direct.app_id,appId);
assert.equal(direct.user_id,claims.sub);
assert.equal(direct.issuer,'privy.io');
assert.equal(direct.session_id,claims.sid);
const input={bearerToken:token,usaPrivyAppId:appId,verificationKey,expectedIssuer:'privy.io',
 verifyAccessToken,now};
const session=await verifyPrivyUSAccessSession(input);
assert.equal(session.userId,claims.sub);
assert.equal(session.sessionId,claims.sid);
assert.equal(session.verification,'official_privy_server_sdk');
await assert.rejects(verifyPrivyUSAccessSession({
 ...input,usaPrivyAppId:'another-app'
}),/US_PRIVY_ACCESS_TOKEN_UNVERIFIED|US_PRIVY_TOKEN_CLAIMS_INVALID/);
await assert.rejects(verifyPrivyUSAccessSession({
 ...input,bearerToken:signJWT({...claims,iss:'evil.example'})
}),/US_PRIVY_ACCESS_TOKEN_UNVERIFIED|US_PRIVY_TOKEN_CLAIMS_INVALID/);
await assert.rejects(verifyPrivyUSAccessSession({
 ...input,bearerToken:signJWT({...claims,exp:time-2})
}),/US_PRIVY_ACCESS_TOKEN_UNVERIFIED|US_PRIVY_ACCESS_TOKEN_EXPIRED/);
await assert.rejects(verifyPrivyUSAccessSession({
 ...input,bearerToken:signJWT({...claims,iat:time+120})
}),/US_PRIVY_ACCESS_TOKEN_UNVERIFIED|US_PRIVY_ACCESS_TOKEN_EXPIRED/);
const parts=token.split('.');
const damaged=[parts[0],parts[1],parts[2][0]==='a'?'b'+parts[2].slice(1):'a'+parts[2].slice(1)].join('.');
await assert.rejects(verifyPrivyUSAccessSession({...input,bearerToken:damaged}),/US_PRIVY_ACCESS_TOKEN_UNVERIFIED/);
const rogue=generateKeyPairSync('ec',{namedCurve:'prime256v1'}).publicKey.export({type:'spki',format:'pem'});
await assert.rejects(verifyPrivyUSAccessSession({...input,verificationKey:rogue}),/US_PRIVY_ACCESS_TOKEN_UNVERIFIED/);
await assert.rejects(verifyPrivyUSAccessSession({...input,verifyAccessToken:undefined}),
 /US_PRIVY_SDK_VERIFIER_NOT_CONFIGURED/);
console.log('Official Privy SDK: ephemeral ES256 JWT verify, app/issuer/expiry/signature tampering PASS');
