import assert from 'node:assert/strict';
import {verifyPrivyUSAccessSession} from '../apps/api/dist/personal-us-privy-session.js';

const token='eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJkaWQ6cHJpdnk6dXNfcHJldmlldyJ9.c2lnbmF0dXJl';
const now=new Date('2026-10-25T19:00:00Z');
const unix=Math.floor(now.getTime()/1000);
const base={bearerToken:token,usaPrivyAppId:'privy-us-dedicated',
 verificationKey:'CI-ONLY-NOT-A-REAL-VERIFICATION-KEY',
 expectedIssuer:'privy.io',now};
const claims={app_id:base.usaPrivyAppId,user_id:'did:privy:us-preview',
 session_id:'privy-session-123',issuer:base.expectedIssuer,issued_at:unix-120,expiration:unix+600};
let trustedInvocations=0;
let actualSDKArguments=null;
const fakeSDK=async args=>{trustedInvocations++;actualSDKArguments=args;return claims;};
const session=await verifyPrivyUSAccessSession({...base,verifyAccessToken:fakeSDK});
assert.equal(session.appId,base.usaPrivyAppId);
assert.equal(session.userId,claims.user_id);
assert.equal(session.verification,'official_privy_server_sdk');
assert.equal(trustedInvocations,1);
assert.equal(actualSDKArguments.app_id,base.usaPrivyAppId);
assert.equal(actualSDKArguments.verification_key,base.verificationKey);
await assert.rejects(verifyPrivyUSAccessSession(base),/US_PRIVY_SDK_VERIFIER_NOT_CONFIGURED/);
await assert.rejects(verifyPrivyUSAccessSession({...base,bearerToken:'not-a-jwt',verifyAccessToken:fakeSDK}),/MALFORMED/);
await assert.rejects(verifyPrivyUSAccessSession({...base,usaPrivyAppId:'br-project',verifyAccessToken:fakeSDK}),/CLAIMS_INVALID/);
await assert.rejects(verifyPrivyUSAccessSession({...base,expectedIssuer:'attacker-issuer',verifyAccessToken:fakeSDK}),/US_PRIVY_ISSUER_CONFIGURATION_INVALID/);
await assert.rejects(verifyPrivyUSAccessSession({...base,verifyAccessToken:async()=>({...claims,expiration:unix})}),/EXPIRED/);
await assert.rejects(verifyPrivyUSAccessSession({...base,verifyAccessToken:async()=>({...claims,issued_at:unix+360})}),/EXPIRED/);
await assert.rejects(verifyPrivyUSAccessSession({...base,verifyAccessToken:async()=>({...claims,user_id:'invalid user'})}),/CLAIMS_INVALID/);
await assert.rejects(verifyPrivyUSAccessSession({...base,verifyAccessToken:async()=>{throw Error('SECRET-DO-NOT-LOG')}}),/US_PRIVY_ACCESS_TOKEN_UNVERIFIED/);
console.log('US Privy access-token verifier seam: PASS (mock SDK; no tokens accepted without official verifier)');

// Keep the newer read-only Privy DID -> Maya contract smoke in the existing
// CI build gate without changing protected GitHub Actions workflow files.
await import('./smoke-nex-personal-us-privy-agentic-read.mjs');
// Same existing CI build job also compiles the dedicated Netlify USA entry.
await import('./smoke-nex-personal-usa-site.mjs');
