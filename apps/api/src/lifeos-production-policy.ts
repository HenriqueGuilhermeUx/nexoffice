/**
 * Nexa Life OS PF — immutable production deployment contract.
 *
 * Never import preview bootstrapping here: this policy makes ZERO queries,
 * creates ZERO databases, signs ZERO tokens and cannot migrate any schema.
 * Only safe to evaluate before an independently reviewed production rollout.
 */
export type LifeOsProductionEnvironment=Record<string,string|undefined>;
export type LifeOsProductionPolicy={
  apiOrigin:string;
  frontendOrigin:'https://trynexa.com.br';
  sessionAudience:'nexa-lifeos-pf-v1';
  databaseHost:string;
  databaseName:'nexa_lifeos_prod';
  databaseRole:'nexa_lifeos_app';
  connectionString:string;
};

function required(env:LifeOsProductionEnvironment,key:string,value:string):void{
  if(env[key]!==value)throw new Error('Life OS production configuration rejected: '+key);
}
function fail(field:string):never{
  throw new Error('Life OS production configuration rejected: '+field);
}
function exactOrigin(raw:string|undefined,field:string){
  if(!raw)fail(field);
  let parsed:URL;
  try{parsed=new URL(raw);}catch{fail(field);}
  if(parsed.protocol!=='https:'||parsed.username||parsed.password||
     parsed.pathname!=='/'||parsed.search||parsed.hash||parsed.port)
    fail(field);
  return parsed.origin;
}
export function validateLifeOsProductionEnvironment(
  env:LifeOsProductionEnvironment
):LifeOsProductionPolicy{
  required(env,'NEXA_LIFEOS_PRODUCTION','true');
  required(env,'NEXA_LIFEOS_PROD_BACKEND_APPROVED','true');
  if(env.NEX_PERSONAL_PREVIEW==='true'||env.NEX_PERSONAL_PREVIEW_CI==='true')
    fail('preview mode must be disabled');
  required(env,'NODE_ENV','production');
  required(env,'NEXOFFICE_DATABASE_SCOPE','nexa-lifeos-production');
  required(env,'NEXOFFICE_EXTERNAL_ACTIONS','false');
  required(env,'NEXOFFICE_INTELLIGENCE_DAILY_ENGINE','false');
  required(env,'AUTO_MIGRATE','false');
  required(env,'NEXA_LIFEOS_SESSION_AUDIENCE','nexa-lifeos-pf-v1');
  // Only the main Nexa site may call the future PF API. Wallet and staging
  // clients get no CORS authorization; API bearer sessions remain separate.
  required(env,'ALLOWED_ORIGINS','https://trynexa.com.br');
  const frontendOrigin='https://trynexa.com.br' as const;
  const apiOrigin=exactOrigin(env.NEXA_LIFEOS_API_ORIGIN,'NEXA_LIFEOS_API_ORIGIN');
  if(apiOrigin!=='https://life-api.trynexa.com.br')fail('dedicated PF API origin');
  if(env.DATABASE_SSL==='false')fail('DATABASE_SSL');

  const raw=env.DATABASE_URL;
  if(!raw)fail('DATABASE_URL');
  let url:URL;
  try{url=new URL(raw);}catch{fail('DATABASE_URL');}
  if(!['postgres:','postgresql:'].includes(url.protocol)
    ||!url.hostname||!url.username||!url.password||url.port==='0'
    ||url.hash)fail('DATABASE_URL');
  // Dedicated database and role are NOT those of Wallet, PJ or PF preview.
  if(decodeURIComponent(url.pathname)!=='/nexa_lifeos_prod')
    fail('dedicated database name');
  if(decodeURIComponent(url.username)!=='nexa_lifeos_app')
    fail('dedicated database role');
  const host=url.hostname.toLowerCase();
  const pinned=String(env.NEXA_LIFEOS_DB_HOST_PIN||'').toLowerCase();
  if(!pinned||pinned!==host||!host.includes('.')||
    ['localhost','127.0.0.1','[::1]'].includes(host)||
    /(?:preview|staging|nexoffice|nexa-backend|wallet)/.test(host)||
    ['.invalid','.example','.test','.local'].some(s=>host.endsWith(s)))
    fail('independent production database host pin');
  // psycopg/libpq query overrides must not disable hostname verification.
  for(const key of ['host','ssl','uselibpqcompat']){
    if(url.searchParams.has(key))fail('DATABASE_URL unsafe connection option');
  }
  if(url.searchParams.getAll('sslmode').length!==1 ||
    url.searchParams.get('sslmode')!=='verify-full')
    fail('DATABASE_URL TLS verification must be exactly verify-full');
  // Do not allow otherwise-valid libpq URI parameters to change the
  // endpoint, trust store, TLS negotiation or startup commands.
  for(const key of url.searchParams.keys()){
    if(!['sslmode','channel_binding'].includes(key))
      fail('DATABASE_URL unknown connection option');
  }
  if(url.searchParams.getAll('channel_binding').length>1 ||
    (url.searchParams.has('channel_binding') &&
     url.searchParams.get('channel_binding')!=='require'))
    fail('DATABASE_URL channel binding must be require');
  if(!/^[A-Za-z0-9.-]+$/.test(host))fail('database hostname');
  return {
    apiOrigin,frontendOrigin,sessionAudience:'nexa-lifeos-pf-v1',
    databaseHost:host,databaseName:'nexa_lifeos_prod',
    databaseRole:'nexa_lifeos_app',connectionString:url.toString()
  };
}
