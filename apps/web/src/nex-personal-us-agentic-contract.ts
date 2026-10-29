/**
 * Nexa Agentics USA consumer adapter, stage 0.
 * This pure read model borrows the separation principles of Nexa Agentics PR #172:
 * provenance, default-deny Trust and non-additive financial views.
 * It does NOT call the Nexa backend, execute an LLM or establish a Nexa delegation.
 */
export type USOnchainSnapshot={
 chainId:137;symbol:'USDC';rawBalance:string;decimals:6;source:'injected_wallet_eip1193';
 ownerBindingVerified:false;accountScope:'browser_session_only';observedAt:string;
};
export type USAgenticCryptoReview={
 coordinator:'Maya';
 mode:'deterministic_local_preview';
 bankBalanceUsd:null;combinedNetWorthUsd:null;ledgerBalanceUsd:null;
 onchain:USOnchainSnapshot;
 insights:readonly string[];
 canSign:false;canExecute:false;canSpend:false;canTrade:false;externalCall:false;
 approvalGranted:false;authorizationScope:'none';requiresUserConfirmation:true;
};
export function buildReadOnlyCryptoReview(input:{rawBalance:string;address:string;observedAt:string}):USAgenticCryptoReview{
 if(!/^(0|[1-9][0-9]*)$/.test(input.rawBalance)||BigInt(input.rawBalance)>2n**256n-1n)throw Error('Invalid USDC balance');
 if(!/^0x[a-fA-F0-9]{40}$/.test(input.address))throw Error('Unverified wallet address');
 if(!Number.isFinite(Date.parse(input.observedAt)))throw Error('Invalid observation time');
 return {
  coordinator:'Maya',mode:'deterministic_local_preview',
  bankBalanceUsd:null,combinedNetWorthUsd:null,ledgerBalanceUsd:null,
  onchain:{chainId:137,symbol:'USDC',rawBalance:input.rawBalance,decimals:6,
    source:'injected_wallet_eip1193',ownerBindingVerified:false,
    accountScope:'browser_session_only',observedAt:input.observedAt},
  insights:[
   'This is one token balance on Polygon, not a consolidated portfolio or bank deposit.',
   'Wallet control was not proven to the Nex Personal server. A browser connection is not an account link.',
   'Do not assume that USDC is insured, cash-equivalent or free of issuer/network risk.'
  ],
  canSign:false,canExecute:false,canSpend:false,canTrade:false,externalCall:false,
  approvalGranted:false,authorizationScope:'none',requiresUserConfirmation:true
 };
}
