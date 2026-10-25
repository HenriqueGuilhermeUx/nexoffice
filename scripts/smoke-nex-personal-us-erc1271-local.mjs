import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {issuePersistedUSWalletChallenge,bindVerifiedUSExternalWallet,revokeUSWalletBinding}
 from '../apps/api/dist/personal-us-wallet-binding-store.js';
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
// End-to-end test: this deployed ERC-1271 proof must bind atomically to
// its USA owner on a brand-new disposable PostgreSQL database. No customer data.
const root=new URL(String(process.env.DATABASE_URL||''));
if(root.protocol!=='postgresql:'||root.hostname!=='127.0.0.1'||
   root.port!=='5432'||root.pathname!=='/nexoffice')
 throw Error('US_ERC1271_CI_REFUSES_NON_DISPOSABLE_DB');
const admin=new pg.Client({connectionString:root.toString()});
await admin.connect();
let usPool;
try{
 await admin.query('CREATE DATABASE nex_personal_us_erc1271_ci');
 const usURL=new URL(root);
 usURL.pathname='/nex_personal_us_erc1271_ci';
 usPool=new pg.Pool({connectionString:usURL.toString(),max:3,connectionTimeoutMillis:3000});
 const ddl=await readFile(new URL('../docs/sql/nex-personal-us-wallet-identity-review-only.sql',import.meta.url),'utf8');
 await usPool.query(ddl);
 const owner='us_erc1271_ci_owner';
 await usPool.query("INSERT INTO nex_personal_us.profiles(id,auth_subject,status) VALUES($1,$2,'active')",
  [randomUUID(),owner]);
 const origin='https://nex-personal-erc1271-ci.example.test';
 const challenge=await issuePersistedUSWalletChallenge({
  pool:usPool,authenticatedUSSubject:owner,walletAddress:contractAddress,
  trustedOrigin:origin,now:new Date()
 });
 const signed=await signer.signMessage({message:challenge.message});
 const tampered=await stranger.signMessage({message:challenge.message});
 const bindingArgs={pool:usPool,authenticatedUSSubject:owner,
  challengeId:challenge.challengeId,trustedOrigin:origin,
  signedMessage:challenge.message,signature:signed,verifier:adapter,now:new Date()};
 await assert.rejects(bindVerifiedUSExternalWallet({
  ...bindingArgs,signature:tampered
 }),/WALLET_SIGNATURE_UNVERIFIED/);
 const nonceAfterInvalid=await usPool.query(
  'SELECT consumed_at FROM nex_personal_us.wallet_ownership_challenges WHERE id=$1',
  [challenge.challengeId]);
 assert.equal(nonceAfterInvalid.rows[0].consumed_at,null,'Invalid ERC-1271 proof must not consume nonce');
 await assert.rejects(bindVerifiedUSExternalWallet({
  ...bindingArgs,authenticatedUSSubject:'us_erc1271_wrong_owner'
 }),/US_CHALLENGE_NOT_FOUND/);
 const linked=await bindVerifiedUSExternalWallet(bindingArgs);
 assert.equal(linked.executionAllowed,false);
 assert.equal(linked.source,'external');
 assert.equal(linked.walletAddress.toLowerCase(),contractAddress.toLowerCase());
 const rows=await usPool.query(
  'SELECT wallet_address,proof_challenge_id FROM nex_personal_us.wallet_bindings WHERE id=$1',
  [linked.walletBindingId]);
 assert.equal(rows.rows.length,1);
 assert.equal(rows.rows[0].wallet_address.toLowerCase(),contractAddress.toLowerCase());
 assert.equal(rows.rows[0].proof_challenge_id,challenge.challengeId);
 await assert.rejects(bindVerifiedUSExternalWallet(bindingArgs),/US_CHALLENGE_INVALID/);
 assert.equal((await usPool.query('SELECT count(*)::int AS n FROM nex_personal_us.wallet_bindings')).rows[0].n,1,
  'ERC-1271 signature replay must not create another binding');
 const revoked=await revokeUSWalletBinding({
  pool:usPool,authenticatedUSSubject:owner,bindingId:linked.walletBindingId,now:new Date()
 });
 assert.equal(revoked.revoked,true);
 assert.equal(revoked.executionAllowed,false);
 const audit=await usPool.query(
  "SELECT event_type FROM nex_personal_us.wallet_security_events WHERE event_type IN ('challenge.issued','challenge.consumed','binding.created','binding.revoked')");
 assert.deepEqual(audit.rows.map(x=>x.event_type).sort(),
  ['binding.created','binding.revoked','challenge.consumed','challenge.issued']);
}finally{
 if(usPool)await usPool.end();
 await admin.end();
}
console.log('PASS: deployed local ERC-1271 real signer + isolated PostgreSQL US nonce, bind, anti-replay and revoke');

