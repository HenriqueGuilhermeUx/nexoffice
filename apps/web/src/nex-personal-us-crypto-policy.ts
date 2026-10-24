/**
 * Nex Personal USA: wallet read boundary.
 * No signing, approval, send, swap, private-key export, smart account funding,
 * direct Privy API use, or cross-product trust delegation is allowed.
 */
export const US_CRYPTO_CHAIN_ID='0x89' as const;
export const US_CRYPTO_USDC_POLYGON='0x3c499c542cef5e3811e1192ce70d8cc03d5c3359' as const;
export const US_CRYPTO_CAPABILITIES=Object.freeze({
 market:'US' as const,chainId:137,token:'USDC',tokenDecimals:6,
 privyEmbeddedCreateEnabled:false,privyAccountLinked:false,
 externalWalletBrowserReadEnabled:true,externalWalletAccountBindingEnabled:false,
 reownQrEnabled:false,agenticExecutionEnabled:false,
 depositEnabled:false,withdrawalEnabled:false,swapEnabled:false,
 feeBpsProposal:0,ledgerCreditEnabled:false
});
export type WalletReadMethod='eth_requestAccounts'|'eth_accounts'|'eth_chainId'|'eth_call';
type Eip1193Provider={request:(args:{method:string;params?:unknown[]})=>Promise<unknown>};
const ADDRESS=/^0x[0-9a-fA-F]{40}$/;
export function assertValidWalletAddress(address:unknown):asserts address is string{
 if(typeof address!=='string'||!ADDRESS.test(address))throw Error('Invalid EVM address');
}
export function balanceOfCallData(address:string){
 assertValidWalletAddress(address);
 return '0x70a08231'+address.slice(2).toLowerCase().padStart(64,'0');
}
export function decodeNativePolygonUsdcBalance(payload:unknown):bigint{
 if(typeof payload!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(payload))throw Error('Unverified USDC RPC response');
 return BigInt(payload);
}
export async function walletReadRequest(provider:Eip1193Provider,method:WalletReadMethod,params?:unknown[]):Promise<unknown>{
 if(!['eth_requestAccounts','eth_accounts','eth_chainId','eth_call'].includes(method))throw Error('US wallet method forbidden');
 if(method==='eth_call'){
  if(!Array.isArray(params)||params.length!==2||params[1]!=='latest')throw Error('Invalid read-only RPC call');
  const call=params[0] as {to?:unknown;data?:unknown}|null;
  if(!call||typeof call!=='object'||typeof call.to!=='string'||call.to.toLowerCase()!==US_CRYPTO_USDC_POLYGON||
   typeof call.data!=='string'||!/^0x70a08231[0-9a-f]{64}$/.test(call.data))
     throw Error('Only native Polygon USDC balanceOf is permitted');
 }else if(params?.length)throw Error('No parameters permitted for this wallet method');
 return provider.request(params?{method,params}:{method});
}
