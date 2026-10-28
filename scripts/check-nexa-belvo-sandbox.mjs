/**
 * Nexa PF - Belvo SANDBOX-only, read-only connectivity smoke.
 *
 * No real-user consent, wallet connection, provider token storage, payment,
 * database write, login or application endpoint. Never log credentials.
 *
 * Runtime: Node 22+ (global fetch). Test injection is kept separate from
 * the production OpenFinanceProvider interface on purpose.
 */
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

export const BELVO_SANDBOX_ORIGIN='https://sandbox.belvo.com';
const PATH='/api/institutions/?page_size=10';
export class BelvoSandboxCheckError extends Error{
 constructor(code,message){super(message);this.name='BelvoSandboxCheckError';this.code=code;}
}

export async function checkBelvoSandbox({
 env=process.env,
 fetcher=fetch,
 timeoutMs=8000
}={}){
 if(env.NEX_PERSONAL_PREVIEW!=='true'||env.BELVO_SANDBOX_ENABLED!=='true'
    ||env.BELVO_ENV!=='sandbox')
  throw new BelvoSandboxCheckError('SANDBOX_GUARD','Verificação desativada fora da homologação PF e Belvo sandbox.');
 const id=String(env.BELVO_SANDBOX_SECRET_ID||'');
 const password=String(env.BELVO_SANDBOX_SECRET_PASSWORD||'');
 if(!id||!password||id.length>2048||password.length>2048)
  throw new BelvoSandboxCheckError('KEYS_MISSING','Configure as credenciais Belvo sandbox SOMENTE como secrets do servidor.');
 if(typeof fetcher!=='function'||!Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>30000)
  throw new BelvoSandboxCheckError('INVALID_CHECK','Configuração de teste inválida.');
 const authorization='Basic '+Buffer.from(id+':'+password,'utf8').toString('base64');
 let response;
 try{
  response=await fetcher(BELVO_SANDBOX_ORIGIN+PATH,{
   method:'GET',
   headers:{authorization,accept:'application/json'},
   signal:AbortSignal.timeout(timeoutMs),
   redirect:'error',
   cache:'no-store'
  });
 }catch{
  throw new BelvoSandboxCheckError('NETWORK_ERROR','Belvo sandbox indisponível ou conexão interrompida.');
 }
 if(response.status===401||response.status===403)
  throw new BelvoSandboxCheckError('UNAUTHORIZED','Chaves Belvo sandbox inválidas, expiradas ou com acesso negado.');
 if(response.status!==200)
  throw new BelvoSandboxCheckError('UNEXPECTED_STATUS','Não foi possível listar as instituições no Belvo sandbox.');
 let body;
 try{body=await response.json();}catch{throw new BelvoSandboxCheckError('INVALID_RESPONSE','Resposta Belvo sandbox não é JSON válido.');}
 const institutions=Array.isArray(body)?body:Array.isArray(body?.results)?body.results:null;
 if(!institutions)
  throw new BelvoSandboxCheckError('INVALID_RESPONSE','Resposta Belvo sandbox não contém lista de instituições.');
 // The caller receives only summary metadata, never the HTTP response or a key.
 return Object.freeze({
  environment:'sandbox',baseUrl:BELVO_SANDBOX_ORIGIN,
  authenticated:true,readOnly:true,linkCreated:false,
  consentCreated:false,financialDataDownloaded:false,paymentInitiated:false,
  institutionsOnPage:institutions.length
 });
}

const isMain=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(isMain){
 checkBelvoSandbox().then(r=>{
  process.stdout.write(JSON.stringify({status:'BELVO_SANDBOX_READ_ONLY_OK',...r})+'\n');
 }).catch(e=>{
  const error=e instanceof BelvoSandboxCheckError?e:
   new BelvoSandboxCheckError('CHECK_FAILED','Falha na verificação de homologação.');
  process.stderr.write(error.code+': '+error.message+'\n');
  process.exitCode=1;
 });
}
