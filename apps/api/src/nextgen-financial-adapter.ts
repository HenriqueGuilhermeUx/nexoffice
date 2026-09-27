import {ApiError} from './auth.js';

function baseUrl(){
  const raw=String(process.env.NEXTGEN_FINANCIAL_BASE_URL||'').trim();
  if(!raw)return '';
  try{const url=new URL(raw);if(!['https:','http:'].includes(url.protocol))return '';return url.toString().replace(/\/$/,'')}catch{return ''}
}
function serviceKey(){return String(process.env.NEXTGEN_FINANCIAL_SERVICE_KEY||'').trim()}
function receivingMode(){return String(process.env.NEXTGEN_FINANCIAL_RECEIVING_MODE||'subaccount').trim().toLowerCase()}
function providerPath(path:string){
  if(receivingMode()!=='subaccount')return path;
  if(path==='/charges')return '/receiving-account/charges';
  const reconcile=path.match(/^\/charges\/([^/]+)\/reconcile$/);
  if(reconcile)return `/receiving-account/charges/${reconcile[1]}/reconcile`;
  return path;
}
function safeProviderReason(value:unknown){
  const raw=String(value??'').replace(/\u0000/g,'').trim().slice(0,320);
  return raw.replace(/[\w.+-]+@[\w.-]+/g,'***@***').replace(/\b\d{7,}\b/g,'***');
}

export function nextgenFinancialConfigured(){return Boolean(baseUrl()&&serviceKey())}
export function nextgenFinancialActionsEnabled(){return String(process.env.NEXTGEN_FINANCIAL_ACTIONS_ENABLED||'false').toLowerCase()==='true'}
export function nextgenFinancialReceivingMode(){return receivingMode()}

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
  try{response=await fetch(`${base}/internal/nexoffice${providerPath(path)}`,{...init,headers,signal:AbortSignal.timeout(12_000)})}
  catch{throw new ApiError(502,'nextgen_financial_unreachable','O serviço de cobrança Pix está indisponível neste momento.');}
  const payload=await response.json().catch(()=>({})) as any;
  if(!response.ok){
    const code=String(payload?.error||payload?.code||'nextgen_financial_request_failed');
    const providerReason=safeProviderReason(payload?.providerReason);
    const baseMessage=code==='human_approval_required'?'A operação financeira exige aprovação humana.':code==='financial_actions_disabled'||code==='receiving_account_actions_disabled'?'As ações financeiras ainda não estão habilitadas neste ambiente.':code==='receiving_account_not_ready'||code==='receiving_account_not_found'?'Configure e valide a chave Pix de recebimento desta empresa antes de gerar cobranças automáticas.':code==='receiving_account_balance_must_be_zero_before_pix_key_change'?'A chave Pix só pode ser trocada quando a conta de recebimento estiver com saldo zero.':code.includes('uncertain')?'O provider devolveu resultado incerto. A operação foi bloqueada para reconciliação antes de qualquer nova tentativa.':'Não foi possível concluir a operação financeira.';
    const message=providerReason?`${baseMessage} Motivo do provider: ${providerReason}`:baseMessage;
    throw new ApiError(response.status===401?502:response.status>=500?502:response.status,code,message);
  }
  return payload as T;
}
