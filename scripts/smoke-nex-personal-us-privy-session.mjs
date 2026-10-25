import assert from 'node:assert/strict';
import {verifyPrivyUSAccessSession} from '../apps/api/dist/personal-us-privy-session.js';

const token='eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJkaWQ6cHJpdnk6dXNfcHJldmlldyJ9.c2lnbmF0dXJl';
const now=new Date('2026-10-25T19:00:00Z');
const unix=Math.floor(now.getTime()/1000);
const base={bearerToken:token,usaPrivyAppId:'privy-us-dedicated',
 verificationKey:'CI-ONLY-NOT-A-REAL-VERIFICATION-KEY',
 expectedIssuer:'privy-us-expected-issuer',now};
const claims={app_id:base.usaPrivyAppId,user_id:'did:privy:us-preview',
 session_id:'privy-session-123',issuer:base.expectedIssuer,issued_at:unix-120,expiration:unix+600};
let trustedInvocations=0;
const fakeSDK=async args=>{trustedInvocations++;assert.equal(args.app_id,base.usaPrivyAppId);
 assert.equal(args.verification_key,base.verificationKey);return claims;};
const session=await verifyPrivyUSAccessSession({...base,verifyAccessToken:fakeSDK});
assert.equal(session.appId,base.usaPrivyAppId);
assert.equal(session.userId,claims.user_id);
assert.equal(session.verification,'official_privy_server_sdk');
assert.equal(trustedInvocations,1);
await assert.rejects(verifyPrivyUSAccessSession(base),/US_PRIVY_SDK_VERIFIER_NOT_CONFIGURED/);
await assert.rejects(verifyPrivyUSAccessSession({...base,bearerToken:'not-a-jwt',verifyAccessToken:fakeSDK}),/MALFORMED/);
await assert.rejects(verifyPrivyUSAccessSession({...base,usaPrivyAppId:'br-project',verifyAccessToken:fakeSDK}),/CLAIMS_INVALID/);
await assert.rejects(verifyPrivyUSAccessSession({...base,expectedIssuer:'attacker-issuer',verifyAccessToken:fakeSDK}),/CLAIMS_INVALID/);
await assert.rejects(verifyPrivyUSAccessSession({...base,verifyAccessToken:async()=>({...claims,expiration:unix})}),/EXPIRED/);
await assert.rejects(verifyPrivyUSAccessSession({...base,verifyAccessToken:async()=>({...claims,issued_at:unix+360})}),/EXPIRED/);
await assert.rejects(verifyPrivyUSAccessSession({...base,verifyAccessToken:async()=>({...claims,user_id:'invalid user'})}),/CLAIMS_INVALID/);
await assert.rejects(verifyPrivyUSAccessSession({...base,verifyAccessToken:async()=>{throw Error('SECRET-DO-NOT-LOG')}}),/US_PRIVY_ACCESS_TOKEN_UNVERIFIED/);
console.log('US Privy access-token verifier seam: PASS (mock SDK; no tokens accepted without official verifier)');
