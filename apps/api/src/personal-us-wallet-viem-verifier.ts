import type {USWalletSignatureVerifier} from './personal-us-wallet-ownership.js';

/**
 * Isolated viem VERIFIER ADAPTER CONTRACT, not an installed runtime.
 * A future audited USA service must inject viem's recoverMessageAddress and a
 * Polygon-bound publicClient.verifyMessage/getBytecode/getChainId. No crypto
 * algorithms are reimplemented and no provider secrets are held here.
 *
 * Only deployed ERC-1271 contracts and normal 65-byte EOA signatures qualify.
 * Pre-deployment EIP-6492 is denied until chain/account counterfactual checks
 * are separately reviewed.
 */
export type USAEthereumViemVerificationProvider={
 getChainId:()=>Promise<number>;
 getBytecode:(args:{address:`0x${string}`})=>Promise<`0x${string}`|undefined>;
 recoverMessageAddress:(args:{message:string;signature:`0x${string}`})=>Promise<`0x${string}`>;
 verifyMessage:(args:{address:`0x${string}`;message:string;signature:`0x${string}`})=>Promise<boolean>;
};
const EVM=/^0x[a-fA-F0-9]{40}$/;
const SIGNATURE=/^0x(?:[0-9a-fA-F]{2}){1,4096}$/;
export function createUSPolygonWalletSignatureVerifier(provider:USAEthereumViemVerificationProvider):USWalletSignatureVerifier{
 if(!provider||typeof provider.getChainId!=='function'||typeof provider.getBytecode!=='function'||
    typeof provider.recoverMessageAddress!=='function'||typeof provider.verifyMessage!=='function')
   throw Error('US_VIEM_VERIFIER_UNAVAILABLE');
 return async({message,signature,expectedAddress,chainId})=>{
  if(chainId!==137||!EVM.test(expectedAddress)||typeof message!=='string'||message.length>4096||
     typeof signature!=='string'||signature.length>8194||!SIGNATURE.test(signature))
   throw Error('US_VIEM_PROOF_ARGUMENTS_INVALID');
  const address=expectedAddress as `0x${string}`;
  const sig=signature as `0x${string}`;
  // A network/client outage is a hard rejection, never a fallback to 'valid'.
  if(await provider.getChainId()!==137)throw Error('US_VIEM_WRONG_CHAIN');
  const bytecode=await provider.getBytecode({address});
  if(bytecode!==undefined&&(!/^0x(?:[0-9a-fA-F]{2})*$/.test(bytecode)))
   throw Error('US_VIEM_INVALID_BYTECODE');
  let verified=false;
  let verificationType:'eoa'|'erc1271'='eoa';
  if(bytecode&&bytecode!=='0x'){
   verificationType='erc1271';
   verified=(await provider.verifyMessage({address,message,signature:sig}))===true;
  }else{
   // An EOA signature is exactly 65 bytes; smart-wallet counterfactuals remain denied.
   if(sig.length!==132)throw Error('US_VIEM_INVALID_EOA_SIGNATURE');
   const recovered=await provider.recoverMessageAddress({message,signature:sig});
   verified=typeof recovered==='string'&&EVM.test(recovered)&&recovered.toLowerCase()===address.toLowerCase();
  }
  if(await provider.getChainId()!==137)throw Error('US_VIEM_CHAIN_CHANGED_DURING_PROOF');
  return {verified,recoveredAddress:address,verificationType};
 };
}
