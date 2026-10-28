/**
 * Nexa PF: first authenticated, owner-scoped, read-only production capability.
 *
 * Preparatory code ONLY: not mounted in server-personal-production.ts.
 * The production API remains unconditionally HTTP 503 until the complete
 * schema/identity/consent gates, DB role grants, real RLS and E2E pass.
 *
 * Never call the shared query() pool for tenant rows: the verified bearer,
 * the transaction-local app.user_id and every SQL read must use ONE client.
 */
import type {Pool} from 'pg';
import {db} from './db.js';
import {withLifeosAuthenticatedTransaction} from './nexa-lifeos-tenant-tx.js';

export type LifeosPersonalGoal=Readonly<{
  id:string;
  name:string;
  targetMinor:string;
  savedMinor:string;
  dueOn:string|null;
}>;

/** No writes, offers, payments or access to Nexa Wallet/PJ. */
export async function readLifeosPersonalGoals(
  opaqueBearerToken:string,
  connection:Pick<Pool,'connect'>|null=db
):Promise<{goals:LifeosPersonalGoal[];readOnly:true;externalFinancialActions:false}>{
  return withLifeosAuthenticatedTransaction(opaqueBearerToken,async({client,userId})=>{
    // Owner predicate complements, but does NOT replace, forced PostgreSQL RLS.
    // The two protections must agree on exactly the server-resolved identity.
    const response=await client.query<{
      id:string;name:string;target_minor:string;saved_minor:string;due_on:string|null
    }>(`
      select id::text, name, target_minor::text, saved_minor::text,
        due_on::text
      from nex_personal.goals
      where owner_user_id=$1::uuid and status='active'
      order by created_at desc, id desc
      limit 50
    `,[userId]);
    return {
      goals:response.rows.map(row=>({
        id:row.id,name:row.name,targetMinor:row.target_minor,
        savedMinor:row.saved_minor,dueOn:row.due_on
      })),
      readOnly:true as const,
      externalFinancialActions:false as const
    };
  },connection);
}
