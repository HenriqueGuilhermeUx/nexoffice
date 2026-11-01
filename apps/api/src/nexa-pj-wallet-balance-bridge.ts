/**
 * Internal Nexa Wallet PJ balance bridge. Disabled until a separately
 * authenticated service-to-service endpoint and corporate KYB registry exist.
 * NEVER forward browser/PF tokens to the Wallet.
 */
export type PjBalanceProjection=Readonly<{
 schemaVersion:1;mode:'read_only';
 status:'connected'|'requires_corporate_verification';
 corporateWalletVerified:boolean;balancesVisible:boolean;transfersEnabled:false;
 walletAddress:string|null;balanceUsdc:string|null;asOf:string|null;
}>;
export const deniedPjBalance=():PjBalanceProjection=>({
 schemaVersion:1,mode:'read_only',status:'requires_corporate_verification',
 corporateWalletVerified:false,balancesVisible:false,transfersEnabled:false,
 walletAddress:null,balanceUsdc:null,asOf:null,
});
export function validateWalletPjProjection(value:unknown):PjBalanceProjection{
 if(!value||typeof value!=='object')return deniedPjBalance();
 const v=value as Record<string,unknown>;
 if(v.schemaVersion!==1||v.mode!=='read_only'||v.transfersEnabled!==false)return deniedPjBalance();
 if(v.status!=='connected'||v.corporateWalletVerified!==true||v.balancesVisible!==true)return deniedPjBalance();
 if(typeof v.walletAddress!=='string'||!/^0x[0-9a-fA-F]{40}$/.test(v.walletAddress)||
 typeof v.balanceUsdc!=='string'||!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(v.balanceUsdc)||
 typeof v.asOf!=='string')return deniedPjBalance();
 const t=Date.parse(v.asOf),now=Date.now();
 if(!Number.isFinite(t)||t>now||now-t>60000)return deniedPjBalance();
 return {schemaVersion:1,mode:'read_only',status:'connected',corporateWalletVerified:true,balancesVisible:true,transfersEnabled:false,walletAddress:v.walletAddress,balanceUsdc:v.balanceUsdc,asOf:v.asOf};
}
