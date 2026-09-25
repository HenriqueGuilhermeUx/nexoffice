import {createHmac,timingSafeEqual,randomBytes} from 'node:crypto';

const ttlDefault=30*24*60*60;

function secret(){return String(process.env.NEXOFFICE_PAYMENT_LINK_SECRET||'').trim()}
function webBase(){return String(process.env.WEB_APP_URL||'http://localhost:5173').replace(/\/$/,'')}
function b64(value:Buffer|string){return Buffer.from(value).toString('base64url')}
function decode(value:string){return Buffer.from(value,'base64url').toString('utf8')}
function signature(encoded:string){return createHmac('sha256',secret()).update(encoded).digest('base64url')}

export function paymentLinksConfigured(){return Boolean(secret())}

export function createPaymentLink(workspaceId:string,ledgerEntryId:string,ttlSeconds=ttlDefault){
  if(!secret())throw new Error('payment_link_secret_not_configured');
  const now=Math.floor(Date.now()/1000),exp=now+Math.max(300,Math.min(ttlSeconds,90*24*60*60));
  const payload={v:1,workspaceId,ledgerEntryId,iat:now,exp,nonce:randomBytes(12).toString('base64url')};
  const encoded=b64(JSON.stringify(payload)),token=`${encoded}.${signature(encoded)}`;
  return {token,url:`${webBase()}/pagar?c=${encodeURIComponent(token)}`,expiresAt:new Date(exp*1000).toISOString()};
}

export function verifyPaymentLink(token:string){
  if(!secret())return {ok:false as const,error:'payment_link_secret_not_configured'};
  try{
    const [encoded,sig]=String(token||'').split('.',2);if(!encoded||!sig)return {ok:false as const,error:'invalid_payment_link'};
    const expected=Buffer.from(signature(encoded)),received=Buffer.from(sig);if(expected.length!==received.length||!timingSafeEqual(expected,received))return {ok:false as const,error:'invalid_payment_link'};
    const payload=JSON.parse(decode(encoded));
    if(payload?.v!==1||!payload?.workspaceId||!payload?.ledgerEntryId||!Number.isInteger(payload?.exp))return {ok:false as const,error:'invalid_payment_link'};
    if(payload.exp<=Math.floor(Date.now()/1000))return {ok:false as const,error:'expired_payment_link'};
    return {ok:true as const,payload:{workspaceId:String(payload.workspaceId),ledgerEntryId:String(payload.ledgerEntryId),expiresAt:new Date(payload.exp*1000).toISOString()}};
  }catch{return {ok:false as const,error:'invalid_payment_link'}}
}
