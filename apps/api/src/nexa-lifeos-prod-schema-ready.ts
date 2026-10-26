/**
 * Runtime fail-closed schema guard for the future PF production API.
 * Reads PostgreSQL catalog metadata using the *application* DB role.
 * Never reads customer rows or modifies schema; refuses all authenticated
 * PF data access until required RLS/role guarantees are present.
 */
import {query} from './db.js';
import {ApiError} from './auth.js';

// @ts-ignore .mjs is a deliberately shared Node runtime audit module.
const {evaluateLifeosSchema}=await import('../../../scripts/audit-nexa-lifeos-prod-schema.mjs');

let acceptedAt=0;
let pending:Promise<void>|undefined;
const CHECK_TTL_MS=60_000;

async function inspect(){
 const [tables,policies,role]=await Promise.all([
  query<Record<string,unknown>>(
   'select n.nspname as schema,c.relname as name,c.relrowsecurity as rls,c.relforcerowsecurity as "forceRls",pg_get_userbyid(c.relowner) as owner from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ($1,$2) and c.relkind=$3',
   ['public','nex_personal','r']),
  query<Record<string,unknown>>(
   'select schemaname as schema,tablename as name,roles,qual from pg_policies where schemaname in ($1,$2)',
   ['public','nex_personal']),
  query<Record<string,unknown>>(
   'select rolname,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole from pg_roles where rolname=current_user')
 ]);
 evaluateLifeosSchema({tables,policies,role:role[0]});
 acceptedAt=Date.now();
}

export async function requireLifeosProductionSchema():Promise<void>{
 if(process.env.NEXA_LIFEOS_ENV!=='production')
  throw new ApiError(503,'schema_not_ready','Serviço Nexa indisponível.');
 if(acceptedAt&&Date.now()-acceptedAt<CHECK_TTL_MS)return;
 if(!pending)pending=inspect().finally(()=>{pending=undefined});
 try{await pending;}
 catch{
  // Never expose policies, table names, DB internals or connection failures
  // to callers. A missing/unsafe RLS schema always fails closed.
  throw new ApiError(503,'schema_not_ready','Serviço Nexa indisponível para autenticação.');
 }
}
