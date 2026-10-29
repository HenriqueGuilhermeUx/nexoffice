import assert from 'node:assert/strict';
import {createUSPolygonWalletSignatureVerifier} from '../apps/api/dist/personal-us-wallet-viem-verifier.js';
const a='0x1111111111111111111111111111111111111111';
const signature='0x'+'ab'.repeat(65),message='Nex Personal USA EIP-4361 test';
const input={message,signature,expectedAddress:a,chainId:137};
let calls=[];
function provider(extra={}){
 return {
  getChainId:async()=>{calls.push('chain');return 137;},
  getBytecode:async()=>{calls.push('bytecode');return undefined;},
  recoverMessageAddress:async()=>{calls.push('recover');return a;},
  verifyMessage:async()=>{calls.push('contract');return true;},
  ...extra
 };
}
let verify=createUSPolygonWalletSignatureVerifier(provider());
let r=await verify(input);
assert.deepEqual(r,{verified:true,recoveredAddress:a,verificationType:'eoa'});
assert.deepEqual(calls,['chain','bytecode','recover','chain']);
calls=[];
r=await createUSPolygonWalletSignatureVerifier(provider({
 recoverMessageAddress:async()=>{calls.push('recover');return '0x2222222222222222222222222222222222222222'}
}))(input);
assert.equal(r.verified,false);
calls=[];
r=await createUSPolygonWalletSignatureVerifier(provider({
 getBytecode:async()=>{calls.push('bytecode');return '0x60006000'}
}))(input);
assert.equal(r.verified,true);
assert.equal(r.verificationType,'erc1271');
assert.equal(calls.includes('recover'),false);
assert.equal(calls.includes('contract'),true);
r=await createUSPolygonWalletSignatureVerifier(provider({
 getBytecode:async()=> '0x60006000',verifyMessage:async()=>false
}))(input);
assert.equal(r.verified,false);
r=await createUSPolygonWalletSignatureVerifier(provider({
 getBytecode:async()=> '0x60006000',verifyMessage:async()=> 'true'
}))(input);
assert.equal(r.verified,false,'Truthy nonboolean ERC-1271 response must never authorize');
await assert.rejects(createUSPolygonWalletSignatureVerifier(provider())({
 ...input,chainId:1
}),/US_VIEM_PROOF_ARGUMENTS_INVALID/);
await assert.rejects(createUSPolygonWalletSignatureVerifier(provider({
 getChainId:async()=>1
}))(input),/US_VIEM_WRONG_CHAIN/);
let requests=0;
await assert.rejects(createUSPolygonWalletSignatureVerifier(provider({
 getChainId:async()=>{requests++;return requests===1?137:1}
}))(input),/US_VIEM_CHAIN_CHANGED_DURING_PROOF/);
await assert.rejects(createUSPolygonWalletSignatureVerifier(provider())({
 ...input,signature:'0x'+'ab'.repeat(10)
}),/US_VIEM_INVALID_EOA_SIGNATURE/);
await assert.rejects(createUSPolygonWalletSignatureVerifier(provider({
 getBytecode:async()=>{throw Error('RPC_FAILURE')}
}))(input),/RPC_FAILURE/);
assert.throws(()=>createUSPolygonWalletSignatureVerifier({}),/US_VIEM_VERIFIER_UNAVAILABLE/);
console.log('Nex Personal USA EOA/ERC-1271 viem adapter gates: PASS (mock viem, not live crypto)');
