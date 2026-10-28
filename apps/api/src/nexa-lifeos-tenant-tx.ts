/**
 * Nexa PF production tenant-scoped transaction prototype.
 * Not wired into server-personal-production.ts. Needs an audited
 * SECURITY DEFINER nex_personal.resolve_api_session(hash) database function
 * and real multi-tenant RLS policy tests before production authorization.
 *
 * Authenticates opaque bearer token hash and sets app.user_id in ONE pooled
 * PostgreSQL transaction before allowing protected SQL in callback.
 */
import type {Pool,PoolClient} from 'pg';
import {ApiError,hashOpaqueToken} from './auth.js';
import {db} from './db.js';

export async function withLifeosAuthenticatedTransaction<T>(
  opaqueToken:string,
  work:(params:{client:PoolClient;userId:string})=>Promise<T>,
  connection:Pick<Pool,'connect'>|null=db,
  transactionMode:'read-write'|'read-only'='read-write'
):Promise<T>{
  if(process.env.NEXA_LIFEOS_ENV!=='production')
    throw new ApiError(503,'tenant_context_unavailable','Ambiente de dados não autorizado.');
  if(!/^[A-Za-z0-9_-]{40,256}$/.test(opaqueToken))
    throw new ApiError(401,'invalid_session','Sessão inválida ou expirada.');
  if(!connection)throw new ApiError(503,'database_unavailable','Serviço indisponível.');
  const client=await connection.connect();
  let begun=false;
  let discardConnection=false;
  try{
    // Use PostgreSQL-enforced READ ONLY transactions for future advisory
    // surfaces. A miswired query cannot mutate goals, bills or other rows.
    await client.query(transactionMode==='read-only'?'BEGIN READ ONLY':'BEGIN');
    begun=true;
    // The authenticated principal is not enough if this pooled connection
    // accidentally uses the database owner, an admin role or BYPASSRLS.
    // Assert the *effective* role before any session lookup or personal read.
    // This is defense-in-depth; production HTTP remains closed separately.
    const databaseRole=await client.query<{
      name:string;rolsuper:boolean;rolbypassrls:boolean;
      rolcreatedb:boolean;rolcreaterole:boolean
    }>(`
      select rolname::text as name,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole
      from pg_catalog.pg_roles where rolname=current_user
    `);
    const role=databaseRole.rows.length===1?databaseRole.rows[0]:null;
    if(!role||role.name!=='nexa_lifeos_app'||role.rolsuper
      ||role.rolbypassrls||role.rolcreatedb||role.rolcreaterole)
      throw new ApiError(503,'tenant_role_unsafe','Ambiente de dados não autorizado.');
    // resolve_api_session is *not* part of any existing migration.
    // It must safely validate the opaque token SHA256 under an isolated
    // least-privilege role without exposing auth_sessions to other users.
    const session=await client.query<{user_id:string}>(
      'select user_id from nex_personal.resolve_api_session($1::text)',[hashOpaqueToken(opaqueToken)]
    );
    const userId=session.rows.length===1?String(session.rows[0].user_id):'';
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId))
      throw new ApiError(401,'invalid_session','Sessão inválida ou expirada.');
    // true = transaction-local PostgreSQL setting, automatically reverted
    // on COMMIT/ROLLBACK; never use a session-level SET for pooled clients.
    await client.query("select set_config('app.user_id',$1,true)",[userId]);
    const result=await work({client,userId});
    await client.query('COMMIT');
    begun=false;
    return result;
  }catch(error){
    if(begun){
      try{await client.query('ROLLBACK');}
      catch{
        // The server-side transaction state is unknown. NEVER put this
        // connection back into the pool: it could retain app.user_id.
        discardConnection=true;
      }
    }
    throw error;
  }finally{
    client.release(discardConnection);
  }
}


/** Forces a PostgreSQL READ ONLY transaction, not just a TypeScript promise. */
export function withLifeosAuthenticatedReadTransaction<T>(
  opaqueToken:string,
  work:(params:{client:PoolClient;userId:string})=>Promise<T>,
  connection:Pick<Pool,'connect'>|null=db
):Promise<T>{
  return withLifeosAuthenticatedTransaction(opaqueToken,work,connection,'read-only');
}
