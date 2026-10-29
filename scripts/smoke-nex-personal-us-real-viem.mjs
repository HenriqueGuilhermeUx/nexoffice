import assert from 'node:assert/strict';
import {recoverMessageAddress,verifyMessage as verifyEOA} from 'viem';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {createUSPolygonWalletSignatureVerifier} from '../apps/api/dist/personal-us-wallet-viem-verifier.js';

/**
 * Real cryptography with pinned viem; no live RPC, no network transfers,
 * no reused credential and no logged private key. Does NOT test ERC-1271
 * onchain contract signatures (requires a separate local-chain fixture).
 */
if(process.env.NPU_REAL_CRYPTO_CI!=='true')
 throw Error('REAL_CRYPTO_TEST_NOT_APPROVED_FOR_THIS_ENVIRONMENT');
const ephemeralKey=generatePrivateKey();
const signer=privateKeyToAccount(ephemeralKey);
const message='Nex Personal USA isolated SIWE real EOA signing test';
const signature=await signer.signMessage({message});
assert.equal(signature.length,132,'Must be a 65-byte EOA signature');
assert.equal(
 await recoverMessageAddress({message,signature}),
 signer.address,
 'Real ECDSA recovery must return the ephemeral owner'
);
assert.equal(await verifyEOA({address:signer.address,message,signature}),true);
assert.equal(await verifyEOA({address:signer.address,message:message+' altered',signature}),false);
const provider={
 getChainId:async()=>137,
 getBytecode:async()=>undefined,
 recoverMessageAddress:async({message,signature})=>recoverMessageAddress({message,signature}),
 verifyMessage:async()=>{throw Error('ERC1271_NOT_TESTED_HERE')}
};
const verify=createUSPolygonWalletSignatureVerifier(provider);
const valid=await verify({
 message,signature,expectedAddress:signer.address,chainId:137
});
assert.deepEqual(valid,{verified:true,recoveredAddress:signer.address,verificationType:'eoa'});
const mismatched=await verify({
 message:message+' changed',signature,expectedAddress:signer.address,chainId:137
});
assert.equal(mismatched.verified,false,'Modified signed message must be rejected');
const another=privateKeyToAccount(generatePrivateKey());
const notOwner=await verify({
 message,signature,expectedAddress:another.address,chainId:137
});
assert.equal(notOwner.verified,false,'Another EOA cannot claim ownership');
await assert.rejects(verify({
 message,signature,expectedAddress:signer.address,chainId:1
}),/US_VIEM_PROOF_ARGUMENTS_INVALID/);
const wrongNetwork=createUSPolygonWalletSignatureVerifier({...provider,getChainId:async()=>1});
await assert.rejects(wrongNetwork({
 message,signature,expectedAddress:signer.address,chainId:137
}),/US_VIEM_WRONG_CHAIN/);
console.log('USA wallet real viem EOA ECDSA vectors PASS; ERC-1271 onchain still pending');
