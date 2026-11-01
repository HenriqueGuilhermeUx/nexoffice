import {createHmac,timingSafeEqual} from 'node:crypto';
import {deniedPjBalance,validateWalletPjProjection,type PjBalanceProjection} from './nexa-pj-wallet-balance-bridge.js';

/**
 * Disabled-by-default server-to-server transport. No browser or PF bearer
 * token is forwarded. The Wallet endpoint must independently authenticate
 * signed identity claims and resolve the corporate binding server-side.
 */
export async function fetchNexaCorporateWalletBalance(
 context:Readonly<{workspaceId:string;representativeUserId:string}>,
 config:Readonly<{enabled:boolean;endpoint:string;sharedSecret:string}>,
 now:number=Date.now(),
):Promise<PjBalanceProjection>{
 if(!config.enabled||!/^https:\/\//.test(config.endpoint)||
 config.sharedSecret.length<32||
 !/^[0-9a-f-]{36}$/i.test(context.workspaceId)||
 !/^[0-9a-f-]{36}$/i.test(context.representativeUserId))return deniedPjBalance();
 const timestamp=String(now);
 const nonce=createHmac('sha256',config.sharedSecret).update(context.workspaceId+':'+context.representativeUserId+':'+timestamp).digest('hex');
 const message=[context.workspaceId,context.representativeUserId,timestamp,nonce].join('\n');
 const signature=createHmac('sha256',config.sharedSecret).update(message).digest('hex');
 const abort=new AbortController();
 const timeout=setTimeout(()=>abort.abort(),2500);
 try{
  const response=await fetch(config.endpoint,{method:'POST',headers:{
   'content-type':'application/json','x-nexa-pj-timestamp':timestamp,
   'x-nexa-pj-signature':signature,
  },body:JSON.stringify({...context,timestamp,nonce}),signal:abort.signal,redirect:'error',cache:'no-store'});
  if(!response.ok||response.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json')return deniedPjBalance();
  return validateWalletPjProjection(await response.json());
 }catch{return deniedPjBalance();}
 finally{clearTimeout(timeout);}
}
