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
  connection:Pick<Pool,'connect'>|null=db
):Promise<T>{
  if(process.env.NEXA_LIFEOS_ENV!=='production')
    throw new ApiError(503,'tenant_context_unavailable','Ambiente de dados não autorizado.');
  if(!/^[A-Za-z0-9_-]{40,256}$/.test(opaqueToken))
    throw new ApiError(401,'invalid_session','Sessão inválida ou expirada.');
  if(!connection)throw new ApiError(503,'database_unavailable','Serviço indisponível.');
  const client=await connection.connect();
  let begun=false;
  try{
    await client.query('BEGIN');
    begun=true;
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
    if(begun)try{await client.query('ROLLBACK');}catch{}
    throw error;
  }finally{
    client.release();
  }
}
