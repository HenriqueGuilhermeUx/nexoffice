import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';

const envSecret=()=>String(process.env.NEXOFFICE_PAYMENT_DATA_KEY||'').trim();

function key(){
  const secret=envSecret();
  if(secret.length<24)throw new Error('payment_data_key_not_configured');
  return createHash('sha256').update(secret,'utf8').digest();
}

export function paymentDataEncryptionConfigured(){return envSecret().length>=24}

export function encryptPaymentValue(value:string){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);
  const ciphertext=Buffer.concat([cipher.update(String(value),'utf8'),cipher.final()]);
  return {ciphertext:ciphertext.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64')};
}

export function decryptPaymentValue(input:{ciphertext:string;iv:string;tag:string}){
  const decipher=createDecipheriv('aes-256-gcm',key(),Buffer.from(input.iv,'base64'));
  decipher.setAuthTag(Buffer.from(input.tag,'base64'));
  return Buffer.concat([decipher.update(Buffer.from(input.ciphertext,'base64')),decipher.final()]).toString('utf8');
}

export function maskPixKey(value:string,type:string){
  const raw=String(value||'').trim();
  if(!raw)return '';
  if(type==='email'){
    const [name,domain]=raw.split('@');
    if(!domain)return '••••';
    return `${(name||'').slice(0,2)}••••@${domain}`;
  }
  const compact=raw.replace(/\s+/g,'');
  if(compact.length<=6)return '••••';
  return `${compact.slice(0,3)}••••${compact.slice(-3)}`;
}
