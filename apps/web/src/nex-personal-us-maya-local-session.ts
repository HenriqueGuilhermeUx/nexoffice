/**
 * Browser-memory preview ONLY, not an authenticated Privy or PostgreSQL grant.
 * Never persist wallet observations or share them with a remote agent here.
 */
export const MAYA_LOCAL_PREVIEW_TTL_MS=10*60*1000;
export const MAYA_LOCAL_OBSERVATION_MAX_AGE_MS=5*60*1000;
export type MayaLocalObservation={
 address:string;chainId:137;rawBalance:string;observedAt:string
};
export type MayaLocalPreviewGrant=MayaLocalObservation&{
 sharedAt:string;expiresAt:string;scope:'browser_memory_read_only'
};
const ACCOUNT=/^0x[0-9a-fA-F]{40}$/;
const DECIMAL=/^(?:0|[1-9][0-9]{0,77})$/;
const MAX_USDC=2n**256n-1n;
function checkedTime(value:string):number{
 if(typeof value!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T/.test(value))
  throw Error('MAYA_LOCAL_PREVIEW_INVALID_TIME');
 const t=Date.parse(value);
 if(!Number.isFinite(t)||new Date(t).toISOString()!==value)
  throw Error('MAYA_LOCAL_PREVIEW_INVALID_TIME');
 return t;
}
/** Requires a fresh browser-observed Polygon native USDC snapshot. */
export function createMayaLocalPreviewGrant(
 observation:MayaLocalObservation,now:Date=new Date()
):MayaLocalPreviewGrant{
 const stamp=now instanceof Date?now.getTime():NaN;
 if(!Number.isFinite(stamp)||!observation||observation.chainId!==137||
  typeof observation.address!=='string'||!ACCOUNT.test(observation.address)||
  typeof observation.rawBalance!=='string'||!DECIMAL.test(observation.rawBalance)||
  BigInt(observation.rawBalance)>MAX_USDC)
  throw Error('MAYA_LOCAL_PREVIEW_OBSERVATION_INVALID');
 const seen=checkedTime(observation.observedAt);
 if(seen>stamp||stamp-seen>MAYA_LOCAL_OBSERVATION_MAX_AGE_MS)
  throw Error('MAYA_LOCAL_PREVIEW_SNAPSHOT_STALE');
 return {
  ...observation,sharedAt:now.toISOString(),
  expiresAt:new Date(stamp+MAYA_LOCAL_PREVIEW_TTL_MS).toISOString(),
  scope:'browser_memory_read_only'
 };
}
/** Fail closed on malformed, expired, or tampered in-memory preview grants. */
export function activeMayaLocalPreviewGrant(
 value:MayaLocalPreviewGrant|null,now:Date=new Date()
):MayaLocalPreviewGrant|null{
 if(!value||!Number.isFinite(now instanceof Date?now.getTime():NaN)||
  value.scope!=='browser_memory_read_only'||value.chainId!==137||
  typeof value.address!=='string'||!ACCOUNT.test(value.address)||
  typeof value.rawBalance!=='string'||!DECIMAL.test(value.rawBalance))
  return null;
 try{
  if(BigInt(value.rawBalance)>MAX_USDC)return null;
  const seen=checkedTime(value.observedAt);
  const shared=checkedTime(value.sharedAt);
  const expires=checkedTime(value.expiresAt);
  if(expires-shared!==MAYA_LOCAL_PREVIEW_TTL_MS||
    seen>shared||shared-seen>MAYA_LOCAL_OBSERVATION_MAX_AGE_MS||
    now.getTime()<shared||now.getTime()>=expires)return null;
  return value;
 }catch{return null;}
}
