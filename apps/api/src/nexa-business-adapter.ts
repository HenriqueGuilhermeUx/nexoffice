export type NexaBusinessMethod='GET'|'POST';

export class NexaBusinessError extends Error{
  constructor(public code:string,public status:number,message:string,public payload?:unknown){super(message)}
}

const contractBase='/api/v1/internal/nexoffice/business/v1';

function on(name:string){return String(process.env[name]||'').trim().toLowerCase()==='true'}

export function nexaBusinessFlags(){
  const enabled=on('NEXOFFICE_NEXA_BUSINESS_ENABLED');
  const writesEnabled=enabled&&on('NEXOFFICE_NEXA_BUSINESS_WRITES_ENABLED');
  return {
    enabled,
    writesEnabled,
    paymentsEnabled:writesEnabled&&on('NEXOFFICE_NEXA_BUSINESS_PAYMENTS_ENABLED'),
    accountProvisioningEnabled:writesEnabled&&on('NEXOFFICE_NEXA_BUSINESS_ACCOUNT_PROVISIONING_ENABLED'),
  };
}

export function nexaBusinessConfigured(){
  return Boolean(
    String(process.env.NEXA_BUSINESS_BASE_URL||'').trim()&&
    String(process.env.NEXA_BUSINESS_SERVICE_KEY||'').trim()
  );
}

export function nexaBusinessReadiness(){
  return {
    provider:'nexa',
    configured:nexaBusinessConfigured(),
    ...nexaBusinessFlags(),
    mode:'future_baas_adapter',
    moneySourceOfTruth:'nexa',
    operationalSourceOfTruth:'nexoffice',
  };
}

export async function nexaBusinessRequest<T=any>(
  workspaceId:string,
  path:string,
  method:NexaBusinessMethod='GET',
  body?:unknown,
  options:{write?:boolean;payment?:boolean;provisioning?:boolean}={},
):Promise<T>{
  const flags=nexaBusinessFlags();
  if(!flags.enabled)throw new NexaBusinessError('nexa_business_disabled',503,'A integração Nexa Business ainda não está habilitada neste ambiente.');
  if(options.write&&!flags.writesEnabled)throw new NexaBusinessError('nexa_business_writes_disabled',503,'Escritas na Nexa Business ainda não estão habilitadas.');
  if(options.payment&&!flags.paymentsEnabled)throw new NexaBusinessError('nexa_business_payments_disabled',503,'Pagamentos pela Nexa Business ainda não estão habilitados.');
  if(options.provisioning&&!flags.accountProvisioningEnabled)throw new NexaBusinessError('nexa_business_provisioning_disabled',503,'Provisionamento de conta Nexa Business ainda não está habilitado.');

  const base=String(process.env.NEXA_BUSINESS_BASE_URL||'').trim().replace(/\/$/,'');
  const key=String(process.env.NEXA_BUSINESS_SERVICE_KEY||'').trim();
  if(!base||!key)throw new NexaBusinessError('nexa_business_not_configured',503,'A bridge Nexa Business ainda não está configurada neste ambiente.');

  const url=`${base}${contractBase}/${String(path).replace(/^\//,'')}`;
  let response:Response;
  try{
    response=await fetch(url,{
      method,
      headers:{
        accept:'application/json',
        'content-type':'application/json',
        authorization:`Bearer ${key}`,
        'X-NexOffice-Workspace-ID':workspaceId,
      },
      body:body===undefined?undefined:JSON.stringify(body),
      signal:AbortSignal.timeout(15000),
    });
  }catch(error){
    throw new NexaBusinessError('nexa_business_unreachable',502,error instanceof Error?error.message:'Nexa Business indisponível.');
  }

  const text=await response.text();
  const payload=(()=>{try{return JSON.parse(text)}catch{return {text:text.slice(0,2000)}}})();
  if(!response.ok){
    const p=payload as any;
    throw new NexaBusinessError(
      String(p?.error||p?.code||'nexa_business_request_failed'),
      response.status,
      String(p?.message||`Nexa Business respondeu HTTP ${response.status}`),
      payload,
    );
  }
  return payload as T;
}

export function getNexaBusinessAccount(workspaceId:string){
  return nexaBusinessRequest(workspaceId,'account');
}

export function getNexaBusinessBalance(workspaceId:string){
  return nexaBusinessRequest(workspaceId,'balance');
}

export function getNexaBusinessStatement(workspaceId:string,query=''){
  return nexaBusinessRequest(workspaceId,`statement${query?`?${query}`:''}`);
}

export function prepareNexaPixCharge(workspaceId:string,input:{amountMinor:number;externalRef:string;description?:string}){
  return nexaBusinessRequest(workspaceId,'pix/charges','POST',input,{write:true});
}

export function prepareNexaPayment(workspaceId:string,input:{amountMinor:number;pixKey:string;pixKeyType:string;externalRef:string;description?:string}){
  return nexaBusinessRequest(workspaceId,'pix/payments/prepare','POST',input,{write:true});
}

export function executeNexaPayment(workspaceId:string,input:{paymentIntentId:string;approvalId:string}){
  return nexaBusinessRequest(workspaceId,'pix/payments/execute','POST',input,{write:true,payment:true});
}

export function provisionNexaBusinessAccount(workspaceId:string,input:{businessId:string;legalName:string;taxId:string}){
  return nexaBusinessRequest(workspaceId,'account/provision','POST',input,{write:true,provisioning:true});
}
