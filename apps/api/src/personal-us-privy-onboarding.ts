/**
 * Nex Personal USA Privy candidate binding — review-only contract.
 *
 * All input MUST originate from a server-side verified response from a
 * dedicated US Privy project after an authenticated US user consents.
 * NEVER accept this structure from browser JSON as provider evidence.
 * No Privy API calls, wallet creation, signing or database writes here.
 */
const ADDRESS=/^0x[0-9a-fA-F]{40}$/;
export type VerifiedUSPrivyWalletEvidence={
 projectId:string;userId:string;walletId:string;address:string;
 linkedToAuthenticatedSubject:string;
 chainType:'ethereum';walletType:'embedded';
 control:'user';recoveryConfigured:true;
 additionalSigners:readonly [];verifiedAt:string
};
export type USPrivyWalletBindingCandidate={
 market:'US';subject:string;privyUserId:string;privyWalletId:string;
 address:string;chainType:'ethereum';controller:'user';
 projectId:string;verifiedAt:string;status:'requires_atomic_owner_binding';
 executionAllowed:false;delegatedAgentSigningAllowed:false
};
export function preparePrivyUSWalletBinding(input:{
 authenticatedUSSubject:string;
 dedicatedUSPrivyProjectId:string;
 verified:VerifiedUSPrivyWalletEvidence;
 now:Date
}):USPrivyWalletBindingCandidate{
 const {authenticatedUSSubject,dedicatedUSPrivyProjectId,verified,now}=input;
 if(!/^[a-zA-Z0-9:_-]{8,150}$/.test(authenticatedUSSubject))throw Error('INVALID_US_IDENTITY');
 if(!dedicatedUSPrivyProjectId||dedicatedUSPrivyProjectId.length>128||verified?.projectId!==dedicatedUSPrivyProjectId)
   throw Error('PRIVY_PROJECT_MISMATCH');
 if(typeof verified.userId!=='string'||!/^did:privy:[a-zA-Z0-9:_-]{3,200}$/.test(verified.userId)||
    typeof verified.walletId!=='string'||verified.walletId.length<3||verified.walletId.length>255||
    verified.linkedToAuthenticatedSubject!==authenticatedUSSubject)
   throw Error('PRIVY_IDENTITY_NOT_LINKED');
 if(!ADDRESS.test(verified.address)||verified.chainType!=='ethereum'||
    verified.walletType!=='embedded'||verified.control!=='user'||verified.recoveryConfigured!==true)
   throw Error('PRIVY_WALLET_NOT_USER_OWNED');
 if(!Array.isArray(verified.additionalSigners)||verified.additionalSigners.length!==0)
   throw Error('PRIVY_DELEGATED_SIGNERS_PRESENT');
 const at=Date.parse(verified.verifiedAt);
 if(!Number.isFinite(at)||!Number.isFinite(now.getTime())||at>now.getTime()||at<now.getTime()-5*60_000)
   throw Error('PRIVY_EVIDENCE_STALE');
 return {
   market:'US',subject:authenticatedUSSubject,
   privyUserId:verified.userId,privyWalletId:verified.walletId,address:verified.address,
   chainType:'ethereum',controller:'user',projectId:verified.projectId,
   verifiedAt:verified.verifiedAt,status:'requires_atomic_owner_binding',
   executionAllowed:false,delegatedAgentSigningAllowed:false
 };
}
