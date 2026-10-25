/**
 * Nex Personal USA native Polygon USDC read-only observation adapter.
 * Pure server-side contract for a trusted viem PublicClient; no transport,
 * RPC URL, wallet provider, private key, signing method or HTTP route here.
 * Contract address is pinned to native Circle USDC, never bridged USDC.e.
 */
import type {ServerObservedUSDC} from './personal-us-agentic-server-read.js';

export const US_POLYGON_NATIVE_USDC='0x3c499c542cef5e3811e1192ce70d8cc03d5c3359' as const;
export const US_POLYGON_NATIVE_USDC_ABI=[{
 type:'function',name:'balanceOf',stateMutability:'view',
 inputs:[{name:'account',type:'address'}],
 outputs:[{name:'balance',type:'uint256'}]
}] as const;
const WALLET=/^0x[0-9a-fA-F]{40}$/;
const MAX_BALANCE=2n**256n-1n;
export type USPolygonPublicReadClient={
 getChainId:()=>Promise<number>;
 getBlockNumber:()=>Promise<bigint>;
 readContract:(args:{
  address:typeof US_POLYGON_NATIVE_USDC;
  abi:typeof US_POLYGON_NATIVE_USDC_ABI;
  functionName:'balanceOf';
  args:readonly [`0x${string}`];
  blockNumber:bigint
 })=>Promise<bigint>;
};
export function createUSPolygonNativeUSDCReader(input:{
 client:USPolygonPublicReadClient;clock?:()=>Date
}):(walletAddress:string)=>Promise<ServerObservedUSDC>{
 const client=input?.client,clock=input?.clock??(()=>new Date());
 if(!client||typeof client.getChainId!=='function'||
   typeof client.getBlockNumber!=='function'||typeof client.readContract!=='function'||
   typeof clock!=='function')
  throw Error('US_USDC_TRUSTED_PUBLIC_CLIENT_REQUIRED');
 return async walletAddress=>{
  if(typeof walletAddress!=='string'||!WALLET.test(walletAddress))
   throw Error('US_USDC_INVALID_WALLET_ADDRESS');
  if(await client.getChainId()!==137)
   throw Error('US_USDC_POLYGON_CHAIN_REQUIRED');
  // Pin the balanceOf query to one observed block to avoid an ambiguous
  // latest block read; only the server configures this client.
  const block=await client.getBlockNumber();
  if(typeof block!=='bigint'||block<0n)
   throw Error('US_USDC_INVALID_BLOCK');
  const raw=await client.readContract({
   address:US_POLYGON_NATIVE_USDC,abi:US_POLYGON_NATIVE_USDC_ABI,
   functionName:'balanceOf',args:[walletAddress as `0x${string}`],
   blockNumber:block
  });
  if(typeof raw!=='bigint'||raw<0n||raw>MAX_BALANCE)
   throw Error('US_USDC_INVALID_RPC_BALANCE');
  if(await client.getChainId()!==137)
   throw Error('US_USDC_CHAIN_CHANGED');
  const observedAt=clock();
  if(!(observedAt instanceof Date)||!Number.isFinite(observedAt.getTime()))
   throw Error('US_USDC_INVALID_OBSERVATION_TIME');
  return {chainId:137,tokenAddress:US_POLYGON_NATIVE_USDC,
   walletAddress,rawBalance:raw.toString(10),decimals:6,
   source:'trusted_server_polygon_rpc',observedAt:observedAt.toISOString()};
 };
}
