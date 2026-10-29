import assert from 'node:assert/strict';
import {
 createUSPolygonNativeUSDCReader,US_POLYGON_NATIVE_USDC
} from '../apps/api/dist/personal-us-polygon-usdc-reader.js';

const addr='0x1111111111111111111111111111111111111111';
const another='0x2222222222222222222222222222222222222222';
const observedTime=new Date('2026-10-25T19:00:00.000Z');
const calls=[];
const client={
 getChainId:async()=>{calls.push('chain');return 137},
 getBlockNumber:async()=>{calls.push('block');return 12345678n},
 readContract:async params=>{
  calls.push('read');
  assert.equal(params.address,US_POLYGON_NATIVE_USDC);
  assert.equal(params.functionName,'balanceOf');
  assert.equal(params.blockNumber,12345678n);
  assert.deepEqual(params.args,[addr]);
  assert.deepEqual(params.abi[0].outputs,[{name:'balance',type:'uint256'}]);
  return 25000001n;
 }
};
const read=createUSPolygonNativeUSDCReader({client,clock:()=>observedTime});
const observed=await read(addr);
assert.deepEqual(observed,{chainId:137,tokenAddress:US_POLYGON_NATIVE_USDC,
 walletAddress:addr,rawBalance:'25000001',decimals:6,
 source:'trusted_server_polygon_rpc',observedAt:observedTime.toISOString()});
assert.deepEqual(calls,['chain','block','read','chain']);
await assert.rejects(read('invalid'),/US_USDC_INVALID_WALLET_ADDRESS/);
assert.equal(calls.length,4,'Malformed wallet must fail before contacting RPC');
assert.throws(()=>createUSPolygonNativeUSDCReader({client:{}}),/TRUSTED_PUBLIC_CLIENT_REQUIRED/);
const mocked=(overrides={})=>createUSPolygonNativeUSDCReader({
 client:{...client,...overrides},clock:()=>observedTime
});
await assert.rejects(mocked({getChainId:async()=>1})(addr),/POLYGON_CHAIN_REQUIRED/);
let chainCheck=0;
await assert.rejects(mocked({getChainId:async()=>++chainCheck===1?137:1})(addr),/US_USDC_CHAIN_CHANGED/);
await assert.rejects(mocked({getBlockNumber:async()=>-1n})(addr),/US_USDC_INVALID_BLOCK/);
await assert.rejects(mocked({getBlockNumber:async()=>123})(addr),/US_USDC_INVALID_BLOCK/);
await assert.rejects(mocked({readContract:async()=>-1n})(addr),/US_USDC_INVALID_RPC_BALANCE/);
await assert.rejects(mocked({readContract:async()=>2n**256n})(addr),/US_USDC_INVALID_RPC_BALANCE/);
await assert.rejects(mocked({readContract:async()=>42})(addr),/US_USDC_INVALID_RPC_BALANCE/);
await assert.rejects(mocked({readContract:async()=>{throw Error('RPC_TIMEOUT')}})(addr),/RPC_TIMEOUT/);
const max=await createUSPolygonNativeUSDCReader({
 client:{getChainId:async()=>137,getBlockNumber:async()=>1n,
  readContract:async()=>2n**256n-1n},clock:()=>observedTime
})(another);
assert.equal(max.rawBalance,(2n**256n-1n).toString());
await assert.rejects(createUSPolygonNativeUSDCReader({
 client:{...client},clock:()=>new Date(Number.NaN)
})(addr),/US_USDC_INVALID_OBSERVATION_TIME/);
console.log('Nex Personal USA pinned Polygon native-USDC server read contract PASS (mock public viem client, no live RPC)');
