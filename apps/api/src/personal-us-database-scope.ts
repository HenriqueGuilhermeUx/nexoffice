import type {USWalletClient} from './personal-us-wallet-binding-store.js';

/**
 * Physical database fence for every Nex Personal USA identity/consent
 * transaction. It must run AFTER BEGIN and BEFORE any account lookup, API/RPC
 * call or database mutation. It does not replace tenancy, RLS or US IAM roles.
 */
export async function assertPersonalUSDedicatedDatabase(client:USWalletClient):Promise<void>{
 const result=await client.query<{database:string}>('SELECT current_database() AS database');
 const name=result.rows.length===1?result.rows[0]?.database:undefined;
 if(typeof name!=='string'||!/^nex_personal_us(?:_[a-z0-9_]+)?$/.test(name))
  throw Error('US_WALLET_WRONG_DATABASE');
}
