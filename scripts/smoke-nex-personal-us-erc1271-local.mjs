import assert from 'node:assert/strict';
import solc from 'solc';
import {
 createPublicClient,createWalletClient,http,recoverMessageAddress,hashMessage,parseAbi,
} from 'viem';
import {polygon} from 'viem/chains';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {createUSPolygonWalletSignatureVerifier} from '../apps/api/dist/personal-us-wallet-viem-verifier.js';

/**
 * Real ERC-1271 on a throwaway LOCAL Ganache EVM at chainId 137.
 * This test deploys its own minimal contract and spends only local, fake gas.
 * No customer/provider account, external chain, real USDC, or Privy credentials.
 */
if(process.env.NPU_LOCAL_ERC1271_CI!=='true')throw Error('US_ERC1271_TEST_DISABLED');
const RPC='http://127.0.0.1:8545';
const provider=createPublicClient({chain:polygon,transport:http(RPC,{timeout:5000})});
assert.equal(await provider.getChainId(),137,'Only local Polygon-id test chain is permitted');
const testAddresses=await provider.request({method:'eth_accounts'});
assert.ok(Array.isArray(testAddresses)&&testAddresses.length>0,'Local Ganache deployer unavailable');
const deployer=testAddresses[0];
const wallet=createWalletClient({chain:polygon,transport:http(RPC,{timeout:5000}),account:deployer});
const signer=privateKeyToAccount(generatePrivateKey());
const stranger=privateKeyToAccount(generatePrivateKey());
const src=`// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;
contract CIWallet1271 {
 address public immutable signer;
 constructor(address signer_) {signer=signer_;}
 function isValidSignature(bytes32 digest,bytes calldata sig) external view returns(bytes4) {
   if(sig.length!=65)return 0xffffffff;
   bytes32 r;bytes32 s;uint8 v;
   assembly {r:=calldataload(sig.offset) s:=calldataload(add(sig.offset,32)) v:=byte(0,calldataload(add(sig.offset,64)))}
   if(v<27)v+=27;
   if(v!=27&&v!=28)return 0xffffffff;
   return ecrecover(digest,v,r,s)==signer?bytes4(0x1626ba7e):bytes4(0xffffffff);
 }
}`;
const compilerInput={language:'Solidity',sources:{'CIWallet1271.sol':{content:src}},
 settings:{evmVersion:'paris',optimizer:{enabled:true,runs:200},
  outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}};
const compiled=JSON.parse(solc.compile(JSON.stringify(compilerInput)));
const compileErrors=(compiled.errors||[]).filter(e=>e.severity==='error');
assert.equal(compileErrors.length,0,compileErrors.map(e=>e.formattedMessage).join('\n'));
const artifact=compiled.contracts['CIWallet1271.sol'].CIWallet1271;
const bytecode='0x'+artifact.evm.bytecode.object;
const deployment=await wallet.deployContract({
 // Solidity 0.8.30 defaults to newer opcodes than some local EVMs support;
 // target Paris explicitly and use a bounded, generous local-only gas limit.
 abi:artifact.abi,bytecode,args:[signer.address],account:deployer,gas:2_000_000n
});
const receipt=await provider.waitForTransactionReceipt({hash:deployment,timeout:30000});
assert.equal(receipt.status,'success',
 `Local ERC-1271 deploy reverted: gasUsed=${receipt.gasUsed} status=${receipt.status}`);
assert.ok(receipt.contractAddress,'ERC-1271 fixture not deployed');
const contractAddress=receipt.contractAddress;
const deployed=await provider.getBytecode({address:contractAddress});
assert.ok(deployed&&deployed!=='0x','Contract code must exist on local chain');
const message='Nex Personal USA EIP-4361 wallet owner proof on local chain';
const validSignature=await signer.signMessage({message});
const invalidSignature=await stranger.signMessage({message});
const erc1271Abi=parseAbi(['function isValidSignature(bytes32 digest, bytes sig) view returns (bytes4)']);
async function verify1271AtDeployedContract({address,message,signature}){
  const magic=await provider.readContract({address,abi:erc1271Abi,
    functionName:'isValidSignature',args:[hashMessage(message),signature]});
  return magic==='0x1626ba7e';
}
const adapter=createUSPolygonWalletSignatureVerifier({
 getChainId:()=>provider.getChainId(),
 getBytecode:({address})=>provider.getBytecode({address}),
 recoverMessageAddress:({message,signature})=>recoverMessageAddress({message,signature}),
 verifyMessage:verify1271AtDeployedContract
});
const valid=await adapter({
 message,signature:validSignature,expectedAddress:contractAddress,chainId:137
});
assert.equal(valid.verified,true,'Signer authorized by deployed contract must pass');
assert.equal(valid.verificationType,'erc1271');
const rejected=await adapter({
 message,signature:invalidSignature,expectedAddress:contractAddress,chainId:137
});
assert.equal(rejected.verified,false,'Unauthorized owner must fail ERC-1271');
const altered=await adapter({
 message:message+' TAMPERED',signature:validSignature,expectedAddress:contractAddress,chainId:137
});
assert.equal(altered.verified,false,'Changed message must fail');
const directInvalid=await verify1271AtDeployedContract({
 address:contractAddress,message,signature:invalidSignature
});
assert.equal(directInvalid,false);
await assert.rejects(adapter({
 message,signature:validSignature,expectedAddress:contractAddress,chainId:1
}),/US_VIEM_PROOF_ARGUMENTS_INVALID/);
const shortContractSignature='0x'+'00'.repeat(64);
const invalidShort=await adapter({
 message,signature:shortContractSignature,expectedAddress:contractAddress,chainId:137
});
assert.equal(invalidShort.verified,false,'ERC-1271 must allow variable bytes but reject invalid proofs');
console.log('PASS: deployed local ERC-1271 wallet accepted genuine signer, denied strangers/tampering and invalid chain');
