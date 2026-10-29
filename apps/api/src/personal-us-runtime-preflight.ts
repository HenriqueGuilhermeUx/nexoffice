/**
 * Internal-only USA API deployment configuration gate.
 *
 * Offline validation BEFORE any connection, route registration or token use.
 * This cannot prove database region, account permissions, real Privy app
 * ownership, provider keys, or regulatory readiness. Those require a
 * dedicated external deployment/security review and live server checks.
 *
 * No default to the Brazilian NexOffice / Nexa DB or Privy application.
 */
export type USReadOnlyRuntimePreflightInput={
 dedicatedDatabaseUrl:string;
 dedicatedUSPrivyAppId:string;
 allowedFrontendOrigin:string;
 assertedDeploymentRegion:string;
 financialExecutionEnabled:boolean;
 agentSigningEnabled:boolean;
};
export type USReadOnlyRuntimePreflight={
 configurationValidated:true;
 runtime:'nex_personal_us_read_only';
 databaseName:string;
 allowedFrontendOrigin:string;
 // These are NEVER evidence that a live service, user, wallet or bank is linked.
 databaseConnectionVerified:false;
 privilegedRoleVerified:false;
 privyProjectVerified:false;
 officialPrivyVerifierInstalled:false;
 usHostingRegionVerified:false;
 financialExecutionAllowed:false;
 agentSigningAllowed:false;
};

// Require an exact HTTPS frontend origin. Domain ownership and per-request
// CORS/token authorization must be verified by the eventual USA deployment.
const USA_DATABASE_NAME=/^nex_personal_us(?:_[a-z0-9_]+)?$/;
const US_REGION=/^us-(?:east|west|central)-[1-9]$/;
const US_ROLE=/(?:^|_)us(?:_|$)/;
const PRIVILEGED_ROLES=new Set([
 'postgres','root','neondb_owner','supabase_admin','supabase_auth_admin',
 'supabase_storage_admin','service_role','admin'
]);
function invalid(code:string):never{throw Error('US_RUNTIME_'+code);}
export function assertUSReadOnlyRuntimePreflight(
 input:USReadOnlyRuntimePreflightInput
):USReadOnlyRuntimePreflight{
 if(!input||input.financialExecutionEnabled!==false||input.agentSigningEnabled!==false)
  invalid('EXECUTION_NOT_DISABLED');
 if(typeof input.assertedDeploymentRegion!=='string'||
    !US_REGION.test(input.assertedDeploymentRegion))
  invalid('REGION_CONFIGURATION_INVALID');
 if(typeof input.dedicatedUSPrivyAppId!=='string'||
    !/^[A-Za-z0-9_-]{8,128}$/.test(input.dedicatedUSPrivyAppId))
  invalid('PRIVY_APP_CONFIGURATION_INVALID');
 let origin:URL;
 try{origin=new URL(input.allowedFrontendOrigin)}catch{invalid('ORIGIN_INVALID')}
 if(origin.protocol!=='https:'||origin.username||origin.password||origin.search||
    origin.hash||origin.pathname!=='/'||origin.port||!origin.hostname.includes('.')||
    origin.hostname==='localhost'||origin.hostname.endsWith('.com.br')||
    origin.hostname==='trynexa.com.br'||origin.hostname==='nexoffices.com.br'||
    input.allowedFrontendOrigin!==origin.origin)
  invalid('ORIGIN_INVALID');
 let db:URL;
 try{db=new URL(input.dedicatedDatabaseUrl)}catch{invalid('DATABASE_URL_INVALID')}
 let name:string;
 let role:string;
 try{
  name=decodeURIComponent(db.pathname.slice(1));
  role=decodeURIComponent(db.username);
 }catch{invalid('DATABASE_URL_INVALID')}
 const ssl=db.searchParams.get('sslmode');
 if((db.protocol!=='postgresql:'&&db.protocol!=='postgres:')||
    !db.hostname||!db.hostname.includes('.')||db.hash||db.searchParams.size!==1||
    !['require','verify-ca','verify-full'].includes(ssl??'')||
    !USA_DATABASE_NAME.test(name)||db.pathname.slice(1).includes('/')||
    !role||!US_ROLE.test(role)||PRIVILEGED_ROLES.has(role)||
    !db.password||db.username.length>100||db.password.length>5000)
  invalid('DATABASE_URL_INVALID');
 // Do not return or log credentials, hostname or connection details.
 return {
  configurationValidated:true,runtime:'nex_personal_us_read_only',
  databaseName:name,allowedFrontendOrigin:origin.origin,
  databaseConnectionVerified:false,privilegedRoleVerified:false,
  privyProjectVerified:false,officialPrivyVerifierInstalled:false,
  usHostingRegionVerified:false,financialExecutionAllowed:false,
  agentSigningAllowed:false
 };
}
