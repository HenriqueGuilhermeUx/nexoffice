import assert from 'node:assert/strict';
import {validateLifeOsProductionEnvironment} from '../apps/api/dist/lifeos-production-policy.js';
import {createLifeOsProductionStandby} from '../apps/api/dist/lifeos-production-standby.js';

const DATABASE_URL='postgresql://nexa_lifeos_app:fixture-only-password@lifeos-db.dedicated.neon.tech/nexa_lifeos_prod?sslmode=verify-full';
const base={
  NEXA_LIFEOS_PRODUCTION:'true',
  NEXA_LIFEOS_PROD_BACKEND_APPROVED:'true',
  NEX_PERSONAL_PREVIEW:'false',
  NEX_PERSONAL_PREVIEW_CI:'false',
  NODE_ENV:'production',
  NEXOFFICE_DATABASE_SCOPE:'nexa-lifeos-production',
  NEXOFFICE_EXTERNAL_ACTIONS:'false',
  NEXOFFICE_INTELLIGENCE_DAILY_ENGINE:'false',
  AUTO_MIGRATE:'false',
  NEXA_LIFEOS_SESSION_AUDIENCE:'nexa-lifeos-pf-v1',
  NEXA_LIFEOS_API_ORIGIN:'https://life-api.trynexa.com.br',
  ALLOWED_ORIGINS:'https://trynexa.com.br',
  NEXA_LIFEOS_DB_HOST_PIN:'lifeos-db.dedicated.neon.tech',
  DATABASE_SSL:'true',
  DATABASE_URL
};
function rejects(key,value){
 const env={...base,[key]:value};
 assert.throws(()=>validateLifeOsProductionEnvironment(env),
  err=>err instanceof Error&&!err.message.includes('fixture-only-password'),
  'Fail closed without leaking database credentials: '+key);
}
const config=validateLifeOsProductionEnvironment(base);
assert.equal(config.databaseName,'nexa_lifeos_prod');
assert.equal(config.databaseRole,'nexa_lifeos_app');
assert.equal(config.apiOrigin,'https://life-api.trynexa.com.br');
assert.equal(config.frontendOrigin,'https://trynexa.com.br');
assert.equal(config.sessionAudience,'nexa-lifeos-pf-v1');

for(const [key,value] of [
 ['NEXA_LIFEOS_PRODUCTION',undefined],
 ['NEXA_LIFEOS_PROD_BACKEND_APPROVED','false'],
 ['NEX_PERSONAL_PREVIEW','true'],
 ['NEX_PERSONAL_PREVIEW_CI','true'],
 ['NODE_ENV','development'],
 ['NEXOFFICE_DATABASE_SCOPE','nex-personal-preview'],
 ['NEXOFFICE_EXTERNAL_ACTIONS','true'],
 ['NEXOFFICE_INTELLIGENCE_DAILY_ENGINE','true'],
 ['AUTO_MIGRATE','true'],
 ['NEXA_LIFEOS_SESSION_AUDIENCE','nexa-wallet'],
 ['ALLOWED_ORIGINS','*'],
 ['ALLOWED_ORIGINS','https://wallet.trynexa.com.br'],
 ['ALLOWED_ORIGINS','https://nex-personal-preview-api.onrender.com'],
 ['NEXA_LIFEOS_API_ORIGIN','https://wallet.trynexa.com.br'],
 ['NEXA_LIFEOS_API_ORIGIN','https://nex-personal-preview-api.onrender.com'],
 ['NEXA_LIFEOS_API_ORIGIN','http://life-api.trynexa.com.br'],
 ['DATABASE_SSL','false'],
 ['DATABASE_URL',DATABASE_URL.replace('/nexa_lifeos_prod','/nex_personal_preview')],
 ['DATABASE_URL',DATABASE_URL.replace('nexa_lifeos_app:','nexoffice:')],
 ['DATABASE_URL',DATABASE_URL.replace('sslmode=verify-full','sslmode=require')],
 ['DATABASE_URL',DATABASE_URL+'&host=other.neon.tech'],
 ['DATABASE_URL',DATABASE_URL+'&ssl=true'],
 ['DATABASE_URL',DATABASE_URL+'&uselibpqcompat=true'],
 ['DATABASE_URL',DATABASE_URL+'&sslmode=disable'],
 ['DATABASE_URL',DATABASE_URL+'&options=-c%20search_path%3Dpublic'],
 ['DATABASE_URL',DATABASE_URL+'&channel_binding=disable'],
 ['DATABASE_URL',DATABASE_URL+'&channel_binding=require&channel_binding=disable'],
 ['DATABASE_URL',DATABASE_URL.replace('lifeos-db.dedicated.neon.tech','nex-personal-preview-db.neon.tech')],
 ['DATABASE_URL',DATABASE_URL.replace('lifeos-db.dedicated.neon.tech','localhost')],
 ['NEXA_LIFEOS_DB_HOST_PIN','other-host.neon.tech'],
 ['NEXA_LIFEOS_DB_HOST_PIN',''],
 ['DATABASE_URL',undefined],
])rejects(key,value);

const standby=createLifeOsProductionStandby(base);
try{
 const health=await standby.inject({url:'/health'});
 assert.equal(health.statusCode,200);
 assert.equal(health.json().service,'nexa-lifeos-production-standby');
 assert.equal(health.json().acceptsUsers,false);
 assert.equal(health.json().externalFinancialActions,false);
 assert.equal(health.json().walletIntegration,false);
 const readiness=await standby.inject({url:'/ready'});
 assert.equal(readiness.statusCode,503,'Not-ready bootstrap cannot be mistaken for real API');
 assert.equal(readiness.json().ready,false);
 for(const path of [
  '/v1/auth/login','/v1/personal/auth/register','/v1/personal/me',
  '/api/v1/health','/portal','/wallet','/v1/workspaces',
  '/v1/personal/accounts','/v1/personal/transactions','/'
 ]){
  const resp=await standby.inject({url:path,method:'GET'});
  assert.equal(resp.statusCode,404,'Standby accidentally exposed a client or finance route: '+path);
 }
 const denied=await standby.inject({url:'/health',headers:{origin:'https://wallet.trynexa.com.br'}});
 assert.equal(denied.statusCode,403);
 assert.equal(denied.headers['access-control-allow-origin'],undefined);
 const allowed=await standby.inject({url:'/health',headers:{origin:'https://trynexa.com.br'}});
 assert.equal(allowed.statusCode,200);
 assert.equal(allowed.headers['access-control-allow-origin'],'https://trynexa.com.br');
 assert.match(String(allowed.headers['content-security-policy']),/default-src 'none'/);
 assert.equal(allowed.headers['cache-control'],'no-store');
}finally{
 await standby.close();
}
console.log('NEXA_LIFEOS_PRODUCTION_STANDBY_GATES_PASS — negative policy, isolated origins, no login, payments or migrations');
