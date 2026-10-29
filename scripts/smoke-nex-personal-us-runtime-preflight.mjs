import assert from 'node:assert/strict';
import {assertUSReadOnlyRuntimePreflight} from
 '../apps/api/dist/personal-us-runtime-preflight.js';
import {assessUSReadOnlyRuntimeCandidate}
 from '../apps/api/dist/personal-us-runtime-readiness.js';

const base={
 dedicatedDatabaseUrl:'postgresql://nex_personal_us_api:CI_FAKE_SECRET_NEVER_CONNECT@ep-ci-us.aws.neon.tech/nex_personal_us_staging?sslmode=require',
 dedicatedUSPrivyAppId:'privy_us_preview_ci',
 allowedFrontendOrigin:'https://nex-personal-usa.netlify.app',
 assertedDeploymentRegion:'us-east-2',
 financialExecutionEnabled:false,agentSigningEnabled:false
};
const verified=assertUSReadOnlyRuntimePreflight(base);
assert.deepEqual(verified,{
 configurationValidated:true,runtime:'nex_personal_us_read_only',
 databaseName:'nex_personal_us_staging',
 allowedFrontendOrigin:'https://nex-personal-usa.netlify.app',
 databaseConnectionVerified:false,privilegedRoleVerified:false,
 privyProjectVerified:false,officialPrivyVerifierInstalled:false,
 usHostingRegionVerified:false,financialExecutionAllowed:false,
 agentSigningAllowed:false
});
assert.ok(!JSON.stringify(verified).includes('CI_FAKE_SECRET_NEVER_CONNECT'));
const deny=(changes,error)=>assert.throws(
 ()=>assertUSReadOnlyRuntimePreflight({...base,...changes}),error
);
deny({financialExecutionEnabled:true},/US_RUNTIME_EXECUTION_NOT_DISABLED/);
deny({agentSigningEnabled:true},/US_RUNTIME_EXECUTION_NOT_DISABLED/);
deny({financialExecutionEnabled:undefined},/US_RUNTIME_EXECUTION_NOT_DISABLED/);
deny({assertedDeploymentRegion:'sa-east-1'},/US_RUNTIME_REGION_CONFIGURATION_INVALID/);
deny({assertedDeploymentRegion:'us-east-2;aws'},/US_RUNTIME_REGION_CONFIGURATION_INVALID/);
deny({dedicatedUSPrivyAppId:''},/US_RUNTIME_PRIVY_APP_CONFIGURATION_INVALID/);
deny({allowedFrontendOrigin:'http://nex-personal-usa.netlify.app'},/US_RUNTIME_ORIGIN_INVALID/);
deny({allowedFrontendOrigin:'https://nex-personal-usa.netlify.app/'},/US_RUNTIME_ORIGIN_INVALID/);
deny({allowedFrontendOrigin:'https://nexoffices.com.br'},/US_RUNTIME_ORIGIN_INVALID/);
deny({allowedFrontendOrigin:'https://trynexa.com.br'},/US_RUNTIME_ORIGIN_INVALID/);
deny({allowedFrontendOrigin:'https://nex-personal-usa.netlify.app.attacker.com:9443'},/US_RUNTIME_ORIGIN_INVALID/);
deny({allowedFrontendOrigin:'https://user:pass@nex-personal-usa.netlify.app'},/US_RUNTIME_ORIGIN_INVALID/);
deny({allowedFrontendOrigin:'https://nex-personal-usa.netlify.app/?token=s'},/US_RUNTIME_ORIGIN_INVALID/);
deny({dedicatedDatabaseUrl:base.dedicatedDatabaseUrl.replace('nex_personal_us_staging','nexoffice')},/DATABASE_URL_INVALID/);
deny({dedicatedDatabaseUrl:base.dedicatedDatabaseUrl.replace('nex_personal_us_staging','nex_personal')},/DATABASE_URL_INVALID/);
deny({dedicatedDatabaseUrl:base.dedicatedDatabaseUrl.replace('nex_personal_us_staging','nexa')},/DATABASE_URL_INVALID/);
deny({dedicatedDatabaseUrl:base.dedicatedDatabaseUrl.replace('nex_personal_us_api','postgres')},/DATABASE_URL_INVALID/);
deny({dedicatedDatabaseUrl:base.dedicatedDatabaseUrl.replace('nex_personal_us_api','neondb_owner')},/DATABASE_URL_INVALID/);
deny({dedicatedDatabaseUrl:base.dedicatedDatabaseUrl.replace('sslmode=require','sslmode=disable')},/DATABASE_URL_INVALID/);
deny({dedicatedDatabaseUrl:base.dedicatedDatabaseUrl+'&application_name=bad'},/DATABASE_URL_INVALID/);
deny({dedicatedDatabaseUrl:base.dedicatedDatabaseUrl.replace('postgresql://','http://')},/DATABASE_URL_INVALID/);
deny({dedicatedDatabaseUrl:base.dedicatedDatabaseUrl.replace('CI_FAKE_SECRET_NEVER_CONNECT','')},/DATABASE_URL_INVALID/);
deny({dedicatedDatabaseUrl:base.dedicatedDatabaseUrl.replace('nex_personal_us_staging','nex_personal_us%2Fprod')},/DATABASE_URL_INVALID/);
// Candidate readiness must fail closed on a broken transactional cleanup.
// This is a deliberately synthetic transport; no DB is connected.
let released=0;
await assert.rejects(assessUSReadOnlyRuntimeCandidate({
 configuration:base,
 pool:{connect:async()=>({
  query:async sql=>{
   if(sql==='ROLLBACK')throw Error('SIMULATED_ROLLBACK_DISCONNECT');
   if(sql.startsWith('SELECT'))throw Error('SIMULATED_SESSION_UNAVAILABLE');
   return {rows:[]};
  },
  release:()=>{released++;}
 })}
}),/US_RUNTIME_DB_CLEANUP_FAILED/);
assert.equal(released,1,'The bad client must still be released');
// Reject unsafe configuration before attempting any PostgreSQL pool connection.
let attemptedConnections=0;
await assert.rejects(assessUSReadOnlyRuntimeCandidate({
 configuration:{...base,financialExecutionEnabled:true},
 pool:{connect:async()=>{attemptedConnections++;throw Error('MUST_NOT_CONNECT');}}
}),/US_RUNTIME_EXECUTION_NOT_DISABLED/);
assert.equal(attemptedConnections,0,'Unsafe configuration must never touch the pool');

// A client release error must also prevent a candidate-ready result.
let releaseAttempts=0;
await assert.rejects(assessUSReadOnlyRuntimeCandidate({
 configuration:base,
 pool:{connect:async()=>({
  query:async sql=>{
   if(sql.startsWith('SELECT'))throw Error('SIMULATED_SESSION_UNAVAILABLE');
   return {rows:[]};
  },
  release:()=>{releaseAttempts++;throw Error('SIMULATED_RELEASE_FAILURE');}
 })}
}),/US_RUNTIME_DB_CLEANUP_FAILED/);
assert.equal(releaseAttempts,1);

console.log('PASS: read-only US API preflight rejects BR databases, non-US region declarations, unsafe origins, roles, and financial execution');
