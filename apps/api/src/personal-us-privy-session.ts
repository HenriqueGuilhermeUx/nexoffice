/**
 * US Privy access-token authentication seam — OFFLINE CONTRACT ONLY.
 * The injected verifier MUST be Privy's official server-side verifyAccessToken
 * with the dedicated USA project's verification key/JWKS. NEVER decode an
 * unverified JWT to establish identity, and never pass credentials to agents.
 * This module cannot authenticate anyone until a trusted verifier is supplied.
 */
export type PrivyUSSDKTokenClaims={
 app_id:string;issuer:string;issued_at:number;expiration:number;
 session_id:string;user_id:string;
};
export type OfficialPrivyUSVerifyAccessToken=(args:{
 access_token:string;app_id:string;verification_key:string
})=>Promise<PrivyUSSDKTokenClaims>;
export type VerifiedPrivyUSSession={
 appId:string;userId:string;sessionId:string;issuer:string;
 issuedAt:string;expiresAt:string;verification:'official_privy_server_sdk';
};
const SUBJECT=/^[a-zA-Z0-9:_-]{8,150}$/;
export async function verifyPrivyUSAccessSession(input:{
 bearerToken:string;usaPrivyAppId:string;
 verificationKey:string;expectedIssuer:string;
 verifyAccessToken?:OfficialPrivyUSVerifyAccessToken;
 now:Date
}):Promise<VerifiedPrivyUSSession>{
 if(!input.usaPrivyAppId?.trim()||input.usaPrivyAppId.length>128||
    !input.verificationKey?.trim()||input.verificationKey.length>8000||
    !input.expectedIssuer?.trim()||input.expectedIssuer.length>250)
   throw Error('US_PRIVY_CONFIGURATION_MISSING');
 if(!Number.isFinite(input.now?.getTime()))throw Error('US_PRIVY_CLOCK_INVALID');
 // Tokens never enter logs, errors, audit, LLM or customer-facing responses.
 if(typeof input.bearerToken!=='string'||input.bearerToken.length>8192||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(input.bearerToken))
   throw Error('US_PRIVY_ACCESS_TOKEN_MALFORMED');
 if(typeof input.verifyAccessToken!=='function')
   throw Error('US_PRIVY_SDK_VERIFIER_NOT_CONFIGURED');
 // Only this trusted injected SDK handles cryptographic validation.
 let claims:PrivyUSSDKTokenClaims;
 try{
  claims=await input.verifyAccessToken({
   access_token:input.bearerToken,app_id:input.usaPrivyAppId,
   verification_key:input.verificationKey
  });
 }catch{throw Error('US_PRIVY_ACCESS_TOKEN_UNVERIFIED');}
 if(!claims||claims.app_id!==input.usaPrivyAppId||
    claims.issuer!==input.expectedIssuer||
    !SUBJECT.test(claims.user_id)||typeof claims.session_id!=='string'||
    claims.session_id.length<8||claims.session_id.length>256||
    !Number.isSafeInteger(claims.issued_at)||!Number.isSafeInteger(claims.expiration))
   throw Error('US_PRIVY_TOKEN_CLAIMS_INVALID');
 const now=Math.floor(input.now.getTime()/1000);
 if(claims.issued_at>now+30||claims.expiration<=now||
    claims.expiration<=claims.issued_at||
    claims.expiration-claims.issued_at>86_400)
   throw Error('US_PRIVY_ACCESS_TOKEN_EXPIRED');
 return {appId:claims.app_id,userId:claims.user_id,sessionId:claims.session_id,
  issuer:claims.issuer,issuedAt:new Date(claims.issued_at*1000).toISOString(),
  expiresAt:new Date(claims.expiration*1000).toISOString(),
  verification:'official_privy_server_sdk'};
}
