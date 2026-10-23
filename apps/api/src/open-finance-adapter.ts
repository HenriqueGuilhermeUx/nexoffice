import type {
  IntegrationContext,
  IntegrationResult,
  OpenFinanceAdapter,
  OpenFinanceCapabilities,
  OpenFinanceConnectSession,
  OpenFinanceConnectSessionInput,
  OpenFinanceResource
} from '@nexoffice/integrations';

const BASE_RESOURCES:OpenFinanceResource[]=['ACCOUNTS','TRANSACTIONS','OWNERS','BILLS'];
const OPTIONAL_RESOURCES:OpenFinanceResource[]=['INVESTMENTS','INVESTMENT_TRANSACTIONS','INCOMES','RECURRING_EXPENSES','RISK_INSIGHTS'];
const WIDGET_SCOPES='read_institutions,write_links,read_consents,write_consents,write_consent_callback,delete_consents';

type BelvoEnvironment='sandbox'|'production';

function normalizeDigits(value:string){return value.replace(/\D/g,'')}

function configuredResources():OpenFinanceResource[]{
  const requested=String(process.env.BELVO_FETCH_RESOURCES||BASE_RESOURCES.join(','))
    .split(',').map(x=>x.trim().toUpperCase()).filter(Boolean) as OpenFinanceResource[];
  const allowed=new Set<OpenFinanceResource>([...BASE_RESOURCES,...OPTIONAL_RESOURCES]);
  const selected=[...new Set(requested.filter(x=>allowed.has(x)))];
  for(const resource of BASE_RESOURCES)if(!selected.includes(resource))selected.push(resource);
  if(selected.some(x=>['INCOMES','RECURRING_EXPENSES','RISK_INSIGHTS'].includes(x))){
    if(!selected.includes('ACCOUNTS'))selected.push('ACCOUNTS');
    if(!selected.includes('TRANSACTIONS'))selected.push('TRANSACTIONS');
  }
  return selected;
}

function environment():BelvoEnvironment{
  return String(process.env.BELVO_ENV||'sandbox').toLowerCase()==='production'?'production':'sandbox';
}

function baseUrl(){
  const explicit=String(process.env.BELVO_BASE_URL||'').trim().replace(/\/$/,'');
  if(explicit)return explicit;
  return environment()==='production'?'https://api.belvo.com':'https://sandbox.belvo.com';
}

function widgetBaseUrl(){
  return String(process.env.BELVO_WIDGET_URL||'https://widget.belvo.io/').trim();
}

function isConfigured(){
  return Boolean(String(process.env.BELVO_SECRET_ID||'').trim()&&String(process.env.BELVO_SECRET_PASSWORD||'').trim());
}

function apiError(payload:unknown,status:number){
  const body=Array.isArray(payload)?payload[0]:payload as any;
  const message=String(body?.message||body?.error||body?.detail||`Belvo HTTP ${status}`);
  const code=String(body?.code||'belvo_request_failed');
  const error=new Error(message);
  (error as any).status=status;
  (error as any).code=code;
  (error as any).payload=payload;
  return error;
}

export class BelvoOpenFinanceAdapter implements OpenFinanceAdapter{
  capabilities():OpenFinanceCapabilities{
    return {
      provider:'belvo',
      environment:environment(),
      configured:isConfigured(),
      resources:configuredResources(),
      connectWidget:true,
      externalMoneyMovement:false
    };
  }

  async createConnectSession(_ctx:IntegrationContext,input:OpenFinanceConnectSessionInput):Promise<IntegrationResult<OpenFinanceConnectSession>>{
    if(!isConfigured())return{ok:false,error:'Belvo Open Finance credentials are not configured.'};

    const identifications=input.identifications.map(item=>({
      type:item.type,
      number:normalizeDigits(item.number),
      name:item.name.trim()
    }));
    const cpf=identifications.find(x=>x.type==='CPF');
    const cnpj=identifications.find(x=>x.type==='CNPJ');
    if(!cpf||!cnpj)return{ok:false,error:'Business Open Finance connection requires both CPF and CNPJ identification.'};

    const resources=(input.resources?.length?input.resources:configuredResources()).filter(resource=>configuredResources().includes(resource));
    const fetchResources=[...new Set(resources)];
    if(fetchResources.some(x=>['INCOMES','RECURRING_EXPENSES','RISK_INSIGHTS'].includes(x))){
      if(!fetchResources.includes('ACCOUNTS'))fetchResources.push('ACCOUNTS');
      if(!fetchResources.includes('TRANSACTIONS'))fetchResources.push('TRANSACTIONS');
    }

    const payload={
      id:String(process.env.BELVO_SECRET_ID),
      password:String(process.env.BELVO_SECRET_PASSWORD),
      scopes:WIDGET_SCOPES,
      stale_in:String(process.env.BELVO_STALE_IN||'300d'),
      fetch_resources:fetchResources,
      widget:{
        purpose:input.purpose.slice(0,140),
        openfinance_feature:'consent_link_creation',
        callback_urls:{
          success:input.callbackUrls.success,
          exit:input.callbackUrls.exit,
          event:input.callbackUrls.event
        },
        consent:{
          terms_and_conditions_url:input.termsAndConditionsUrl,
          permissions:['REGISTER','ACCOUNTS','CREDIT_CARDS','CREDIT_OPERATIONS'],
          identification_info:identifications,
          ...(input.consentDurationDays?{default_consent_duration_days:input.consentDurationDays}:{})
        },
        branding:{
          company_name:String(process.env.BELVO_BRAND_NAME||'NexOffice'),
          company_terms_url:input.termsAndConditionsUrl,
          ...(process.env.BELVO_COMPANY_ICON?{company_icon:String(process.env.BELVO_COMPANY_ICON)}:{}),
          ...(process.env.BELVO_COMPANY_LOGO?{company_logo:String(process.env.BELVO_COMPANY_LOGO)}:{})
        }
      }
    };

    try{
      const response=await fetch(`${baseUrl()}/api/token/`,{
        method:'POST',
        headers:{
          accept:'application/json',
          'content-type':'application/json'
        },
        body:JSON.stringify(payload),
        signal:AbortSignal.timeout(12_000)
      });
      const body=await response.json().catch(()=>({})) as any;
      if(!response.ok)throw apiError(body,response.status);
      const access=String(body?.access||'');
      if(!access)throw new Error('Belvo did not return a widget access token.');

      const url=new URL(widgetBaseUrl());
      url.searchParams.set('access_token',access);
      url.searchParams.set('locale','pt');
      url.searchParams.set('integration_type','openfinance');
      url.searchParams.set('country_codes','BR');
      url.searchParams.set('access_mode','recurrent');
      url.searchParams.set('institution_types',(input.institutionTypes?.length?input.institutionTypes:['business']).join(','));
      if(input.externalId)url.searchParams.set('external_id',input.externalId);
      const widgetResources=fetchResources.filter(x=>['ACCOUNTS','OWNERS','TRANSACTIONS','BILLS','INVESTMENTS','INVESTMENT_TRANSACTIONS'].includes(x));
      if(widgetResources.length)url.searchParams.set('resources',widgetResources.join(','));

      return{
        ok:true,
        data:{
          provider:'belvo',
          environment:environment(),
          accessToken:access,
          refreshToken:body?.refresh?String(body.refresh):undefined,
          expiresInSeconds:600,
          widgetUrl:url.toString(),
          requestedResources:fetchResources
        },
        usage:[{
          capability:'open-finance',
          operation:'connect_session',
          units:1,
          unitName:'session',
          provider:'belvo',
          currency:'BRL',
          metadata:{environment:environment(),resources:fetchResources}
        }]
      };
    }catch(error){
      return{ok:false,error:error instanceof Error?error.message:String(error)};
    }
  }
}

export const belvoOpenFinance=new BelvoOpenFinanceAdapter();
