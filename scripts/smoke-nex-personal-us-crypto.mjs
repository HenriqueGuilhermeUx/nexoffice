import assert from 'node:assert/strict';
import {US_CRYPTO_CAPABILITIES,US_CRYPTO_CHAIN_ID,US_CRYPTO_USDC_POLYGON,balanceOfCallData,decodeNativePolygonUsdcBalance,walletReadRequest} from '../apps/web/src/nex-personal-us-crypto-policy.ts';
const a='0x1111111111111111111111111111111111111111';
assert.equal(US_CRYPTO_CHAIN_ID,'0x89');
assert.equal(US_CRYPTO_USDC_POLYGON,'0x3c499c542cef5e3811e1192ce70d8cc03d5c3359');
for(const prohibited of ['privyEmbeddedCreateEnabled','externalWalletAccountBindingEnabled','agenticExecutionEnabled','depositEnabled','withdrawalEnabled','swapEnabled','ledgerCreditEnabled','reownQrEnabled']){
 assert.equal(US_CRYPTO_CAPABILITIES[prohibited],false,prohibited+' must be disabled');
}
assert.equal(US_CRYPTO_CAPABILITIES.feeBpsProposal,0);
assert.equal(balanceOfCallData(a),'0x70a08231'+a.slice(2).padStart(64,'0'));
assert.throws(()=>balanceOfCallData('0xdead'));
assert.equal(decodeNativePolygonUsdcBalance('0x'+(1234567n).toString(16).padStart(64,'0')),1234567n);
assert.throws(()=>decodeNativePolygonUsdcBalance('0x'));
const calls=[];
const wallet={request:async x=>{calls.push(x);return '0x89'}};
for(const method of ['eth_sign','personal_sign','eth_signTypedData_v4','eth_sendTransaction','wallet_switchEthereumChain','wallet_addEthereumChain','wallet_requestPermissions']){
 await assert.rejects(walletReadRequest(wallet,method),/forbidden/);
}
await assert.rejects(walletReadRequest(wallet,'eth_call',[{to:a,data:balanceOfCallData(a)},'latest']),/Only native Polygon/);
await assert.rejects(walletReadRequest(wallet,'eth_call',[{to:US_CRYPTO_USDC_POLYGON,data:'0x095ea7b3'},'latest']),/Only native Polygon/);
await walletReadRequest(wallet,'eth_call',[{to:US_CRYPTO_USDC_POLYGON,data:balanceOfCallData(a)},'latest']);
assert.equal(calls.length,1,'Denied requests must never hit wallet provider');
console.log('Nex Personal USA crypto read-only policy: PASS');
