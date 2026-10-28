/**
 * Nexa PF future read-only bills capability. Deliberately not HTTP-mounted.
 * Requires the same authenticated database transaction and forced owner RLS
 * as the preparatory goals reader. This module never pays bills or sends Pix.
 */
import type {Pool} from 'pg';
import {db} from './db.js';
import {withLifeosAuthenticatedTransaction} from './nexa-lifeos-tenant-tx.js';

export type LifeosPersonalBill=Readonly<{
 id:string;name:string;amountMinor:string;nextDueOn:string;intervalMonths:number
}>;

export async function readLifeosPersonalBills(
 opaqueBearerToken:string,
 connection:Pick<Pool,'connect'>|null=db
):Promise<{bills:LifeosPersonalBill[];readOnly:true;paymentsEnabled:false}>{
 return withLifeosAuthenticatedTransaction(opaqueBearerToken,async({client,userId})=>{
  const {rows}=await client.query<{
   id:string;name:string;amount_minor:string;next_due_on:string;interval_months:number
  }>(`
    select id::text, name, amount_minor::text, next_due_on::text, interval_months
    from nex_personal.bills
    where owner_user_id=$1::uuid and active=true
    order by next_due_on asc,id asc
    limit 50
  `,[userId]);
  return {
   bills:rows.map(b=>({
    id:b.id,name:b.name,amountMinor:b.amount_minor,
    nextDueOn:b.next_due_on,intervalMonths:b.interval_months
   })),
   readOnly:true as const,paymentsEnabled:false as const
  };
 },connection);
}
