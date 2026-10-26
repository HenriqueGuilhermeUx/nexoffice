/**
 * Offline-by-default production PF PostgreSQL schema and role audit.
 * Read-only catalogs when explicitly enabled. Never accesses customer rows.
 * Positive result is NOT a go-live approval; per-user policy/E2E review needed.
 */
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {inspectLifeosProdEnv} from './check-nexa-lifeos-prod-env.mjs';

const ALLOWED_PUBLIC=new Set(['users','auth_sessions','nexa_lifeos_schema_migrations']);
const REQUIRED_PF=new Set(['profiles','accounts','transactions','consents','life_preferences']);

export function evaluateLifeosSchema({tables,policies,role}){
 if(!Array.isArray(tables)||!Array.isArray(policies)||!role?.rolname)
  throw new Error('Incomplete database metadata: production readiness blocked');
 if(role.rolsuper||role.rolbypassrls||role.rolcreatedb||role.rolcreaterole)
  throw new Error('PF application role must not be a privileged database administrator');
 const identities=tables.filter(t=>t.schema==='public');
 if(identities.some(t=>!ALLOWED_PUBLIC.has(t.name))
   ||!identities.some(t=>t.name==='users')
   ||!identities.some(t=>t.name==='auth_sessions'))
  throw new Error('Unexpected public tables or missing PF identity tables');
 const pf=tables.filter(t=>t.schema==='nex_personal');
 for(const name of REQUIRED_PF)if(!pf.some(t=>t.name===name))
  throw new Error('Required PF table missing: '+name);
 if(pf.length<REQUIRED_PF.size)throw new Error('PF schema is incomplete');
 for(const t of [...pf,...identities]){
  if(t.owner===role.rolname)
   throw new Error('Application DB role must not own table '+t.schema+'.'+t.name);
 }
 for(const t of pf){
  if(!t.rls||!t.forceRls)
   throw new Error('Missing enforced RLS for PF table '+t.name);
  const corresponding=policies.filter(p=>p.schema==='nex_personal'&&p.name===t.name);
  if(!corresponding.length)throw new Error('Missing row access policies for '+t.name);
  if(corresponding.some(p=>(p.roles||[]).includes('public')&&
     ['true','(true)'].includes(String(p.qual||'').trim().toLowerCase())))
    throw new Error('Unrestricted PUBLIC RLS policy: '+t.name);
 }
 const securityTables=identities.filter(t=>['users','auth_sessions'].includes(t.name));
 if(securityTables.some(t=>!t.rls||!t.forceRls))
  throw new Error('Identity and session tables must have enforced RLS too');
 return Object.freeze({
  status:'SCHEMA_CATALOG_CHECK_PASSED_ONLY',
  pfTableCount:pf.length,identityTableCount:securityTables.length,
  databaseRoleUnprivileged:true,
  productionReady:false
 });
}

async function main(){
 if(process.env.NEXA_LIFEOS_SCHEMA_AUDIT!=='true'){
  console.log('Production schema catalog audit offline by default: no DB connection');
  return;
 }
 inspectLifeosProdEnv(process.env);
 const {Client}=await import('pg');
 const client=new Client({connectionString:process.env.DATABASE_URL,
  connectionTimeoutMillis:10000,query_timeout:10000});
 try{
  await client.connect();
  await client.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');
  const [tables,policies,roles]=await Promise.all([
   client.query('select n.nspname as schema,c.relname as name,c.relrowsecurity as rls,c.relforcerowsecurity as "forceRls",pg_get_userbyid(c.relowner) as owner from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ($1,$2) and c.relkind=$3',['public','nex_personal','r']),
   client.query('select schemaname as schema,tablename as name,roles,qual from pg_policies where schemaname in ($1,$2)',['public','nex_personal']),
   client.query('select rolname,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole from pg_roles where rolname=current_user')
  ]);
  console.log(JSON.stringify(evaluateLifeosSchema({
    tables:tables.rows,policies:policies.rows,role:roles.rows[0]
  })));
  console.log('NOT GO-LIVE APPROVED: must separately prove effective policies, least privileges and two-user isolation.');
 }finally{await client.end();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 await main().catch(error=>{
  console.error('NEXA_LIFEOS_SCHEMA_AUDIT_BLOCKED: '+(error instanceof Error?error.message:'Unknown'));
  process.exitCode=2;
 });
}
