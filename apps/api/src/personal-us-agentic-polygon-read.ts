import type {USWalletPool} from './personal-us-wallet-binding-store.js';
import {
 assessServerUSAgenticRead,type USServerReadResult
} from './personal-us-agentic-server-read.js';
import {
 createUSPolygonNativeUSDCReader,type USPolygonPublicReadClient
} from './personal-us-polygon-usdc-reader.js';

/**
 * Dedicated Nex Personal USA internal read entry point.
 * The host service must supply an independently verified US identity and a
 * server-configured viem Polygon PublicClient — never a browser RPC/provider.
 * This does NOT expose an endpoint or wire up Nexa Agentics #172.
 */
export async function assessPersonalUSNativeUSDCRead(input:{
 pool:USWalletPool;
 authenticatedUSSubject:string;
 consentId:string;
 polygonClient:USPolygonPublicReadClient;
 now:Date;
}):Promise<USServerReadResult>{
 const reader=createUSPolygonNativeUSDCReader({client:input.polygonClient});
 return assessServerUSAgenticRead({
  pool:input.pool,authenticatedUSSubject:input.authenticatedUSSubject,
  consentId:input.consentId,now:input.now,
  fetchUSDCFromTrustedServer:reader
 });
}
