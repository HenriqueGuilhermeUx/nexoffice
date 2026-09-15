const env=process.env;
const errors=[];
const requireValue=(name)=>{const value=String(env[name]||'').trim();if(!value)errors.push(`${name} is required`);return value};
const requireExact=(name,expected)=>{const value=requireValue(name);if(value&&value!==expected)errors.push(`${name} must be ${expected}`);return value};

requireExact('NEXOFFICE_ENV','staging');
requireExact('NODE_ENV','production');
requireExact('NEXOFFICE_DATABASE_SCOPE','nexoffice-staging');
requireExact('NEXOFFICE_EXTERNAL_ACTIONS','false');

const databaseUrl=requireValue('DATABASE_URL');
if(databaseUrl&&!/^postgres(?:ql)?:\/\//i.test(databaseUrl))errors.push('DATABASE_URL must be PostgreSQL');
if(/localhost|127\.0\.0\.1/i.test(databaseUrl))errors.push('Staging DATABASE_URL cannot point to localhost');
if(/nexa-wallet-v15-staging-db/i.test(databaseUrl))errors.push('NexOffice staging must never reuse the Nexa wallet staging database');

const internalKey=requireValue('NEXOFFICE_INTERNAL_KEY');
if(internalKey&&internalKey.length<32)errors.push('NEXOFFICE_INTERNAL_KEY must be at least 32 characters in staging');
if(/placeholder|changeme|example|platform-smoke-key/i.test(internalKey))errors.push('NEXOFFICE_INTERNAL_KEY cannot use a placeholder/test value');

const webAppUrl=requireValue('WEB_APP_URL');
if(webAppUrl&&!/^https:\/\//i.test(webAppUrl))errors.push('WEB_APP_URL must use HTTPS in staging');
const origins=requireValue('ALLOWED_ORIGINS');
if(origins==='*')errors.push('ALLOWED_ORIGINS cannot be * in staging');
for(const origin of origins.split(',').map(x=>x.trim()).filter(Boolean))if(!/^https:\/\//i.test(origin))errors.push(`ALLOWED_ORIGINS entry must use HTTPS: ${origin}`);

if(errors.length){
  console.error(JSON.stringify({ok:false,environment:'staging',errors},null,2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok:true,
  environment:'staging',
  databaseScope:'nexoffice-staging',
  dedicatedDatabaseAttested:true,
  externalActions:false,
  corsRestricted:true,
  httpsWebApp:true,
  internalKeyConfigured:true,
  forbiddenDatabaseReuseChecked:true
},null,2));
