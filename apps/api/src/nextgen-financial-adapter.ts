import {ApiError} from './auth.js';

function baseUrl(){
  const raw=String(process.env.NEXTGEN_FINANCIAL_BASE_URL||'').trim();
  if(!raw)return '';
  try{const url=new URL(raw);if(!['https:','http:'].includes(url.protocol))return '';return url.toString().replace(/\/$/,'')}catch{return ''}
}
function serviceKey(){return String(process.env.NEXTGEN_FINANCIAL_SERVICE_KEY||'').trim()}

export function nextgenFinancialConfigured(){return Boolean(baseUrl()&&serviceKey())}
export function nextgenFinancialActionsEnabled(){return String(process.env.NEXTGEN_FINANCIAL_ACTIONS_ENABLED||'false').toLowerCase()==='true'}

export async function nextgenFinancialRequest<T=any>(workspaceId:string,path:string,init:RequestInit={},idempotencyKey?:string):Promise<T>{
  const base=baseUrl(),key=serviceKey();
  if(!base||!key)throw new ApiError(409,'nextgen_financial_not_configured','O motor de cobranças Pix ainda não está configurado neste ambiente.');
  const headers=new Headers(init.headers||{});
  headers.set('accept','application/json');
  headers.set('content-type','application/json');
  headers.set('x-nexoffice-key',key);
  headers.set('x-nexoffice-workspace-id',workspaceId);
  if(idempotencyKey)headers.set('idempotency-key',idempotencyKey);
  let response:Response;
  try{response=await fetch(`${base}/internal/nexoffice${path}`,{...init,headers,signal:AbortSignal.timeout(12_000)})}
  catch{throw new ApiError(502,'nextgen_financial_unreachable','O serviço de cobrança Pix está indisponível neste momento.');}
  const payload=await response.json().catch(()=>({})) as any;
  if(!response.ok){
    const code=String(payload?.error||payload?.code||'nextgen_financial_request_failed');
    const message=code==='human_approval_required'?'A operação financeira exige aprovação humana.':code==='financial_actions_disabled'?'As ações financeiras ainda não estão habilitadas neste ambiente.':code.includes('uncertain')?'O provider devolveu resultado incerto. A operação foi bloqueada para reconciliação antes de qualquer nova tentativa.':'Não foi possível concluir a operação financeira.';
    throw new ApiError(response.status===401?502:response.status>=500?502:response.status,code,message);
  }
  return payload as T;
}
