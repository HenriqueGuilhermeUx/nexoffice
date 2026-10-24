import {createHash,randomBytes,randomUUID} from 'node:crypto';

/**
 * Nex Personal USA wallet-ownership candidate only (REVIEW ONLY).
 * It does not verify Ethereum signatures, touch an auth session or bind wallets.
 * A separate trusted EOA/EIP-1271 verifier AND atomic DB nonce consumption
 * must be integrated and independently reviewed before exposing any route.
 */
const EVM_ADDRESS=/^0x[0-9a-fA-F]{40}$/;
export const US_EXTERNAL_WALLET_CHAIN_ID=137 as const;
export const US_EXTERNAL_WALLET_MAX_CHALLENGE_MS=5*60_000;
export type USWalletChallenge={
 id:string;ownerSubject:string;chainId:137;address:string;
 origin:string;nonceHash:string;expectedMessage:string;
 issuedAt:string;expiresAt:string;status:'pending';
};
function validOrigin(value:string):{origin:string;domain:string}{
 let parsed:URL;
 try{parsed=new URL(value);}catch{throw Error('INVALID_TRUSTED_ORIGIN');}
 if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.pathname!=='/'||
    parsed.search||parsed.hash||!parsed.hostname||parsed.hostname==='localhost'||parsed.hostname.endsWith('.localhost'))
   throw Error('INVALID_TRUSTED_ORIGIN');
 return {origin:parsed.origin,domain:parsed.host};
}
export function hashUSWalletChallengeNonce(value:string):string{
 if(!/^[0-9a-f]{64}$/.test(value))throw Error('INVALID_CHALLENGE_NONCE');
 return createHash('sha256').update(value).digest('hex');
}
export function issuePersonalUSWalletChallenge(input:{
 ownerSubject:string;address:string;trustedOrigin:string;now:Date
}):{challenge:USWalletChallenge;message:string}{
 if(!/^[a-zA-Z0-9:_-]{8,150}$/.test(input.ownerSubject))throw Error('INVALID_OWNER_SUBJECT');
 if(!EVM_ADDRESS.test(input.address))throw Error('INVALID_WALLET_ADDRESS');
 if(!Number.isFinite(input.now.getTime()))throw Error('INVALID_ISSUED_AT');
 const {origin,domain}=validOrigin(input.trustedOrigin);
 const nonce=randomBytes(32).toString('hex');
 const id=randomUUID();
 const issuedAt=input.now.toISOString();
 const expiresAt=new Date(input.now.getTime()+US_EXTERNAL_WALLET_MAX_CHALLENGE_MS).toISOString();
 const message=[
  domain+' wants you to sign in with your Ethereum account:',
  input.address,'',
  'Link this wallet to your Nex Personal USA account. This signature does not authorize a transaction.','',
  'URI: '+origin,
  'Version: 1','Chain ID: 137',
  'Nonce: '+nonce,'Issued At: '+issuedAt,'Expiration Time: '+expiresAt,
  'Request ID: '+id
 ].join('\n');
 return {challenge:{id,ownerSubject:input.ownerSubject,chainId:137,address:input.address,
   origin,nonceHash:hashUSWalletChallengeNonce(nonce),expectedMessage:message,
   issuedAt,expiresAt,status:'pending'},message};
}
export type USWalletSignatureVerifier=(input:{
 message:string;signature:string;expectedAddress:string;chainId:137
})=>Promise<{verified:boolean;recoveredAddress:string;verificationType:'eoa'|'erc1271'}>;
export async function assessPersonalUSWalletProof(input:{
 challenge:USWalletChallenge;authenticatedSubject:string;trustedOrigin:string;
 signedMessage:string;signature:string;now:Date;
 verifier?:USWalletSignatureVerifier
}):Promise<{ownerSubject:string;chainId:137;address:string;challengeId:string;verificationType:'eoa'|'erc1271';readyForAtomicConsume:true}>{
 const c=input.challenge;
 if(!c||c.status!=='pending'||c.chainId!==137||!EVM_ADDRESS.test(c.address))throw Error('CHALLENGE_NOT_PENDING');
 if(c.ownerSubject!==input.authenticatedSubject)throw Error('OWNER_SCOPE_DENIED');
 if(validOrigin(input.trustedOrigin).origin!==c.origin)throw Error('ORIGIN_MISMATCH');
 const issued=Date.parse(c.issuedAt),expiry=Date.parse(c.expiresAt),now=input.now.getTime();
 if(!Number.isFinite(issued)||!Number.isFinite(expiry)||!Number.isFinite(now)||
    now<issued||now>=expiry||expiry-issued>US_EXTERNAL_WALLET_MAX_CHALLENGE_MS)
   throw Error('CHALLENGE_EXPIRED');
 if(!/^[0-9a-f]{64}$/.test(c.nonceHash)||typeof c.expectedMessage!=='string')throw Error('MALFORMED_CHALLENGE');
 // Reconstruct server-authoritative SIWE fields. A forged message cannot silently
 // change nonce, origin, chain, account, issue time, expiry or request identifier.
 const nonce=/\\nNonce: ([0-9a-f]{64})\\n/.exec(c.expectedMessage)?.[1];
 if(!nonce||hashUSWalletChallengeNonce(nonce)!==c.nonceHash)throw Error('MALFORMED_CHALLENGE');
 const {domain}=validOrigin(c.origin);
 const expected=[
  domain+' wants you to sign in with your Ethereum account:',
  c.address,'',
  'Link this wallet to your Nex Personal USA account. This signature does not authorize a transaction.','',
  'URI: '+c.origin,
  'Version: 1','Chain ID: 137',
  'Nonce: '+nonce,'Issued At: '+c.issuedAt,'Expiration Time: '+c.expiresAt,
  'Request ID: '+c.id
 ].join('\\n');
 if(expected!==c.expectedMessage)throw Error('MALFORMED_CHALLENGE');
 if(input.signedMessage!==c.expectedMessage)throw Error('CHALLENGE_MESSAGE_MISMATCH');
 if(typeof input.signature!=='string'||!/^0x[0-9a-fA-F]{130,}$/.test(input.signature))throw Error('INVALID_SIGNATURE_FORMAT');
 if(!input.verifier)throw Error('SIGNATURE_VERIFIER_UNAVAILABLE');
 const verified=await input.verifier({message:c.expectedMessage,signature:input.signature,
   expectedAddress:c.address,chainId:c.chainId});
 if(!verified.verified||!EVM_ADDRESS.test(verified.recoveredAddress)||
    verified.recoveredAddress.toLowerCase()!==c.address.toLowerCase()||
    !['eoa','erc1271'].includes(verified.verificationType))
   throw Error('WALLET_SIGNATURE_UNVERIFIED');
 // Not a durable binding: caller MUST atomically consume nonce and enforce global
 // uniqueness across users; otherwise this result must NOT be accepted as linked.
 return {ownerSubject:c.ownerSubject,chainId:137,address:c.address,
   challengeId:c.id,verificationType:verified.verificationType,readyForAtomicConsume:true};
}
