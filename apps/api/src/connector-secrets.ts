import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';

function connectorKey(){
  const raw=String(process.env.NEXOFFICE_CONNECTOR_SECRET_KEY||process.env.NEXOFFICE_INTEGRATION_SECRET_KEY||'').trim();
  if(!raw)throw new Error('NEXOFFICE_CONNECTOR_SECRET_KEY/NEXOFFICE_INTEGRATION_SECRET_KEY is not configured.');
  let key:Buffer;
  if(/^[0-9a-f]{64}$/i.test(raw))key=Buffer.from(raw,'hex');
  else {
    try{key=Buffer.from(raw,'base64')}catch{key=Buffer.alloc(0)}
  }
  if(key.length!==32)throw new Error('Connector secret key must be exactly 32 bytes (hex or base64).');
  return key;
}

export function connectorSecretsConfigured(){
  try{connectorKey();return true}catch{return false}
}

export function encryptConnectorSecret(value:unknown){
  const key=connectorKey(),iv=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',key,iv);
  const plaintext=Buffer.from(JSON.stringify(value),'utf8');
  const encrypted=Buffer.concat([cipher.update(plaintext),cipher.final()]);
  const tag=cipher.getAuthTag();
  return `enc:v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
}

export function decryptConnectorSecret<T=Record<string,unknown>>(encoded:string):T{
  const parts=String(encoded||'').split(':');
  if(parts.length!==5||parts[0]!=='enc'||parts[1]!=='v1')throw new Error('Unsupported connector secret format.');
  const key=connectorKey(),iv=Buffer.from(parts[2],'base64url'),tag=Buffer.from(parts[3],'base64url'),encrypted=Buffer.from(parts[4],'base64url');
  const decipher=createDecipheriv('aes-256-gcm',key,iv);decipher.setAuthTag(tag);
  const plaintext=Buffer.concat([decipher.update(encrypted),decipher.final()]).toString('utf8');
  return JSON.parse(plaintext) as T;
}

export function connectorStateSecret(){
  return createHash('sha256').update(connectorKey()).update('nexoffice-connect-oauth-state-v1').digest();
}
