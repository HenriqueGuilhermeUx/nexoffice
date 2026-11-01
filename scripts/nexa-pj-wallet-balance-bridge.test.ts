import {strict as assert} from 'node:assert';
import {validateWalletPjProjection} from '../apps/api/src/nexa-pj-wallet-balance-bridge';
const valid={schemaVersion:1,mode:'read_only',status:'connected',corporateWalletVerified:true,balancesVisible:true,transfersEnabled:false,walletAddress:'0x'+'a'.repeat(40),balanceUsdc:'2.500000',asOf:new Date().toISOString()};
assert.equal(validateWalletPjProjection(valid).status,'connected');
for(const invalid of [null,{...valid,transfersEnabled:true},{...valid,walletAddress:'bad'},{...valid,balanceUsdc:'-5'},{...valid,corporateWalletVerified:false},{...valid,asOf:'2020-01-01T00:00:00Z'}]){
 const result=validateWalletPjProjection(invalid);
 assert.equal(result.status,'requires_corporate_verification');
 assert.equal(result.balanceUsdc,null);
}
