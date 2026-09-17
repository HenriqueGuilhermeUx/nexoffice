export type ModoMethod='GET'|'POST';

export class ModoMarketingError extends Error{
  constructor(public code:string,public status:number,message:string,public payload?:unknown){super(message)}
}

const contractBase='/api/v1/internal/nexoffice/marketing/v1';

export function modoMarketingConfigured(){return Boolean(String(process.env.MODO_BASE_URL||'').trim()&&String(process.env.MODO_API_KEY||'').trim())}

export async function modoMarketingRequest<T=any>(workspaceId:string,path:string,method:ModoMethod='GET',body?:unknown):Promise<T>{
  const base=String(process.env.MODO_BASE_URL||'').trim().replace(/\/$/,'');
  const key=String(process.env.MODO_API_KEY||'').trim();
  if(!base||!key)throw new ModoMarketingError('modo_not_configured',503,'O motor MODO ainda não está configurado neste ambiente.');
  const url=`${base}${contractBase}/${String(path).replace(/^\//,'')}`;
  let response:Response;
  try{
    response=await fetch(url,{method,headers:{accept:'application/json','content-type':'application/json','X-NexOffice-Key':key,'X-NexOffice-Workspace-ID':workspaceId},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  }catch(error){throw new ModoMarketingError('modo_unreachable',502,error instanceof Error?error.message:'MODO indisponível.');}
  const text=await response.text();
  const payload=(()=>{try{return JSON.parse(text)}catch{return {text:text.slice(0,2000)}}})();
  if(!response.ok){const p=payload as any;throw new ModoMarketingError(String(p?.error||'modo_request_failed'),response.status,String(p?.message||`MODO respondeu HTTP ${response.status}`),payload)}
  return payload as T;
}
