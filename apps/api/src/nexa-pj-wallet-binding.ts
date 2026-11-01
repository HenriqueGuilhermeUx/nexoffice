/**
 * Nexa PJ ↔ Wallet ownership verification boundary.
 * No wallet provisioning, transfers, funds, SSO or external calls occur here.
 * Only a trusted Nexa Wallet backend may produce this evidence.
 */
export type CorporateWalletBindingRequest=Readonly<{
 workspaceId:string;
 representativeUserId:string;
 corporateIdentityRef:string;
 walletAccountRef:string;
 walletAddress:string;
 chainId:number;
}>;
export type TrustedWalletOwnershipEvidence=Readonly<{
 workspaceId:string;
 representativeUserId:string;
 corporateIdentityRef:string;
 walletAccountRef:string;
 walletAddress:string;
 chainId:number;
 holderType:'corporate';
 proofOrigin:'nexa_wallet_backend';
 signatureVerified:true;
 corporateAuthorityVerified:true;
 verifiedAt:string;
}>;
export interface CorporateWalletOwnershipVerifier{
 verifyOwnership(request:CorporateWalletBindingRequest):Promise<TrustedWalletOwnershipEvidence|null>;
}
export class DisabledCorporateWalletOwnershipVerifier implements CorporateWalletOwnershipVerifier{
 async verifyOwnership(_request:CorporateWalletBindingRequest):Promise<null>{return null;}
}
export function evaluateCorporateWalletBinding(
 request:CorporateWalletBindingRequest,
 evidence:TrustedWalletOwnershipEvidence|null,
 now:Date=new Date(),
):'verified_read_only'|'deny'{
 if(!request.workspaceId||!request.representativeUserId||!request.corporateIdentityRef||
 !request.walletAccountRef||!/^0x[a-fA-F0-9]{40}$/.test(request.walletAddress)||
 !Number.isSafeInteger(request.chainId)||request.chainId<=0||!evidence)return 'deny';
 if(evidence.proofOrigin!=='nexa_wallet_backend'||evidence.holderType!=='corporate'||
 evidence.signatureVerified!==true||evidence.corporateAuthorityVerified!==true)return 'deny';
 if(evidence.workspaceId!==request.workspaceId||evidence.representativeUserId!==request.representativeUserId||
 evidence.corporateIdentityRef!==request.corporateIdentityRef||evidence.walletAccountRef!==request.walletAccountRef||
 evidence.walletAddress.toLowerCase()!==request.walletAddress.toLowerCase()||evidence.chainId!==request.chainId)return 'deny';
 const timestamp=Date.parse(evidence.verifiedAt);
 if(!Number.isFinite(timestamp)||timestamp>now.getTime()||now.getTime()-timestamp>5*60_000)return 'deny';
 return 'verified_read_only';
}
export async function verifyCorporateWalletBinding(
 verifier:CorporateWalletOwnershipVerifier,
 request:CorporateWalletBindingRequest,
 now:Date=new Date(),
):Promise<'verified_read_only'|'deny'>{
 if(!request.workspaceId||!request.representativeUserId||!request.corporateIdentityRef||
 !request.walletAccountRef||!/^0x[a-fA-F0-9]{40}$/.test(request.walletAddress)||
 !Number.isSafeInteger(request.chainId)||request.chainId<=0)return 'deny';
 try{return evaluateCorporateWalletBinding(request,await verifier.verifyOwnership(request),now);}
 catch{return 'deny';}
}
