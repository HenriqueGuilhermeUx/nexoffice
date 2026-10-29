import type {USWalletClient} from './personal-us-wallet-binding-store.js';

/**
 * INTERNAL USA ONLY — live PostgreSQL session attestation for a future
 * USA-only backend. Caller must already have an open transaction and the
 * intended restricted database role SET LOCAL. Does not create roles/tables,
 * connect to production, enable API routes, or establish a US hosting region.
 *
 * A matching DATABASE_URL is not proof of isolation: use catalog checks on the
 * same physical PG session before serving any sensitive account action.
 */
const DB=/^nex_personal_us(?:_[a-z0-9_]+)?$/;
const ROLE=/^[a-z][a-z0-9_]{7,79}$/;
const REQUIRED_TABLES=[
 'profiles',
 'wallet_ownership_challenges',
 'wallet_bindings',
 'wallet_security_events',
 'wallet_agentic_read_consents',
 'privy_identity_links'
] as const;
export type USReadOnlyPostgresAttestation={
 databaseVerified:true;
 restrictedSessionRoleVerified:true;
 forcedRLSVerified:true;
 verifiedTables:number;
 usHostingRegionVerified:false;
 providerIdentityVerified:false;
 financialExecutionAllowed:false;
 agentSigningAllowed:false;
};
type SessionRow={
 database_name:string;role_name:string;row_security_setting:string;
 is_superuser:boolean;can_bypass_rls:boolean;can_create_database:boolean;
 can_create_role:boolean;can_replicate:boolean
};
type TableRow={table_name:string;rls_enabled:boolean;rls_forced:boolean};
type PrivilegeRow={
 can_create_database:boolean;
 can_create_us_schema:boolean;
 can_create_public_schema:boolean;
 can_insert_identity_links:boolean;
 can_delete_identity_links:boolean;
 can_revoke_identity_links:boolean;
 can_delete_wallet_bindings:boolean;
 can_truncate_wallet_bindings:boolean;
 can_delete_agentic_consents:boolean;
 can_truncate_agentic_consents:boolean;
 can_change_profile_status:boolean;
};
export async function attestUSReadOnlyPostgresSession(input:{
 client:USWalletClient;
 expectedDatabaseName:string;
 expectedRoleName:string;
}):Promise<USReadOnlyPostgresAttestation>{
 if(!input?.client||!DB.test(input.expectedDatabaseName)||
    !ROLE.test(input.expectedRoleName)||!input.expectedRoleName.includes('_us_'))
  throw Error('US_RUNTIME_DB_ATTESTATION_INPUT_INVALID');
 // Never trust preflight URL names as evidence of which DB or role is active.
 const session=await input.client.query<SessionRow>(`
  SELECT current_database() AS database_name,
         current_user AS role_name,
         current_setting('row_security') AS row_security_setting,
         r.rolsuper AS is_superuser, r.rolbypassrls AS can_bypass_rls,
         r.rolcreatedb AS can_create_database,
         r.rolcreaterole AS can_create_role,
         r.rolreplication AS can_replicate
    FROM pg_catalog.pg_roles r
   WHERE r.rolname=current_user`);
 const row=session.rows.length===1?session.rows[0]:undefined;
 if(!row||row.database_name!==input.expectedDatabaseName||
    row.role_name!==input.expectedRoleName||row.row_security_setting!=='on'||
    row.is_superuser!==false||row.can_bypass_rls!==false||
    row.can_create_database!==false||row.can_create_role!==false||
    row.can_replicate!==false)
  throw Error('US_RUNTIME_DB_SESSION_NOT_ISOLATED');
 // Missing relations, disabled RLS, or owner-bypass must fail startup.
 const tables=await input.client.query<TableRow>(`
  SELECT c.relname AS table_name,
         c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname=$1 AND c.relname=ANY($2::text[])
     AND c.relkind='r'`,['nex_personal_us',[...REQUIRED_TABLES]]);
 if(tables.rows.length!==REQUIRED_TABLES.length||
    new Set(tables.rows.map(t=>t.table_name)).size!==REQUIRED_TABLES.length||
    tables.rows.some(t=>!REQUIRED_TABLES.includes(t.table_name as typeof REQUIRED_TABLES[number])||
      t.rls_enabled!==true||t.rls_forced!==true))
  throw Error('US_RUNTIME_DB_FORCED_RLS_REQUIRED');
 // Check EFFECTIVE privileges, including PUBLIC/inherited grants and grants
 // accidentally made after the service role was created. Role flags and
 // FORCE RLS alone do not prove that a role cannot perform dangerous DDL
 // or rewrite identities. No write/probe operations are performed here.
 const privileges=await input.client.query<PrivilegeRow>(`
  SELECT
   has_database_privilege(current_user,current_database(),'CREATE') AS can_create_database,
   has_schema_privilege(current_user,'nex_personal_us','CREATE') AS can_create_us_schema,
   has_schema_privilege(current_user,'public','CREATE') AS can_create_public_schema,
   has_table_privilege(current_user,'nex_personal_us.privy_identity_links','INSERT') AS can_insert_identity_links,
   has_table_privilege(current_user,'nex_personal_us.privy_identity_links','DELETE') AS can_delete_identity_links,
   has_column_privilege(current_user,'nex_personal_us.privy_identity_links','revoked_at','UPDATE') AS can_revoke_identity_links,
   has_table_privilege(current_user,'nex_personal_us.wallet_bindings','DELETE') AS can_delete_wallet_bindings,
   has_table_privilege(current_user,'nex_personal_us.wallet_bindings','TRUNCATE') AS can_truncate_wallet_bindings,
   has_table_privilege(current_user,'nex_personal_us.wallet_agentic_read_consents','DELETE') AS can_delete_agentic_consents,
   has_table_privilege(current_user,'nex_personal_us.wallet_agentic_read_consents','TRUNCATE') AS can_truncate_agentic_consents,
   has_column_privilege(current_user,'nex_personal_us.profiles','status','UPDATE') AS can_change_profile_status`);
 const rights=privileges.rows.length===1?privileges.rows[0]:undefined;
 if(!rights||Object.values(rights).some(value=>value!==false))
  throw Error('US_RUNTIME_DB_EXCESS_PRIVILEGES');
 return {
  databaseVerified:true,restrictedSessionRoleVerified:true,
  forcedRLSVerified:true,verifiedTables:REQUIRED_TABLES.length,
  usHostingRegionVerified:false,providerIdentityVerified:false,
  financialExecutionAllowed:false,agentSigningAllowed:false
 };
}
