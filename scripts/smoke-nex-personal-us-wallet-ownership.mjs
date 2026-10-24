import assert from 'node:assert/strict';
import {issuePersonalUSWalletChallenge,assessPersonalUSWalletProof,US_EXTERNAL_WALLET_MAX_CHALLENGE_MS} from '../apps/api/src/personal-us-wallet-ownership.ts';
import {preparePrivyUSWalletBinding} from '../apps/api/src/personal-us-privy-onboarding.ts';
const now=new Date('2026-10-24T18:00:00.000Z');
const a='0x1111111111111111111111111111111111111111',subject='us_subject_12345',origin='https://personal-us.example.test';
const issued=issuePersonalUSWalletChallenge({ownerSubject:subject,address:a,trustedOrigin:origin,now});
assert.equal(issued.challenge.chainId,137);
assert.equal(issued.challenge.ownerSubject,subject);
assert.match(issued.message,/Chain ID: 137/);
assert.match(issued.message,/does not authorize a transaction/);
assert.equal(issued.message,issued.challenge.expectedMessage);
assert.equal(Date.parse(issued.challenge.expiresAt)-now.getTime(),US_EXTERNAL_WALLET_MAX_CHALLENGE_MS);
assert.notEqual(issuePersonalUSWalletChallenge({ownerSubject:subject,address:a,trustedOrigin:origin,now}).challenge.nonceHash,issued.challenge.nonceHash);
assert.throws(()=>issuePersonalUSWalletChallenge({ownerSubject:subject,address:a,trustedOrigin:'http://personal-us.example.test',now}),/INVALID_TRUSTED_ORIGIN/);
assert.throws(()=>issuePersonalUSWalletChallenge({ownerSubject:subject,address:a,trustedOrigin:origin+'/evil',now}),/INVALID_TRUSTED_ORIGIN/);
const input={challenge:issued.challenge,authenticatedSubject:subject,trustedOrigin:origin,
 signedMessage:issued.message,signature:'0x'+'a'.repeat(130),now:new Date(now.getTime()+1000)};
await assert.rejects(assessPersonalUSWalletProof(input),/SIGNATURE_VERIFIER_UNAVAILABLE/);
let verifyCalls=0;
const verifier=async()=>{verifyCalls++;return {verified:true,recoveredAddress:a,verificationType:'eoa'}};
await assert.rejects(assessPersonalUSWalletProof({...input,authenticatedSubject:'us_subject_other',verifier}),/OWNER_SCOPE_DENIED/);
await assert.rejects(assessPersonalUSWalletProof({...input,trustedOrigin:'https://other.example.test',verifier}),/ORIGIN_MISMATCH/);
await assert.rejects(assessPersonalUSWalletProof({...input,signedMessage:'fraud',verifier}),/CHALLENGE_MESSAGE_MISMATCH/);
await assert.rejects(assessPersonalUSWalletProof({...input,challenge:{...issued.challenge,nonceHash:'0'.repeat(64)},verifier}),/MALFORMED_CHALLENGE/);
await assert.rejects(assessPersonalUSWalletProof({...input,challenge:{...issued.challenge,address:'0x2222222222222222222222222222222222222222'},verifier}),/MALFORMED_CHALLENGE/);
await assert.rejects(assessPersonalUSWalletProof({...input,now:new Date(now.getTime()+US_EXTERNAL_WALLET_MAX_CHALLENGE_MS),verifier}),/CHALLENGE_EXPIRED/);
assert.equal(verifyCalls,0,'early rejects must not reach signature verifier');
await assert.rejects(assessPersonalUSWalletProof({...input,verifier:async()=>({verified:false,recoveredAddress:a,verificationType:'eoa'})}),/WALLET_SIGNATURE_UNVERIFIED/);
await assert.rejects(assessPersonalUSWalletProof({...input,verifier:async()=>({verified:true,recoveredAddress:'0x2222222222222222222222222222222222222222',verificationType:'eoa'})}),/WALLET_SIGNATURE_UNVERIFIED/);
const evaluated=await assessPersonalUSWalletProof({...input,verifier});
assert.equal(evaluated.readyForAtomicConsume,true);
assert.equal(evaluated.ownerSubject,subject);
assert.equal(verifyCalls,1);
// A verifier stub is not cryptographic verification. The app exposes NO HTTP route
// and NO wallet binding until a real EOA/EIP-1271 verifier + atomic DB gates exist.
const evidence={
 projectId:'dedicated-us-project',userId:'did:privy:us-test',walletId:'w-123',address:a,
 linkedToAuthenticatedSubject:subject,chainType:'ethereum',walletType:'embedded',
 control:'user',recoveryConfigured:true,additionalSigners:[],verifiedAt:now.toISOString()
};
const privy=preparePrivyUSWalletBinding({
 authenticatedUSSubject:subject,dedicatedUSPrivyProjectId:'dedicated-us-project',verified:evidence,now
});
assert.equal(privy.market,'US');assert.equal(privy.executionAllowed,false);
assert.equal(privy.delegatedAgentSigningAllowed,false);
assert.equal(privy.status,'requires_atomic_owner_binding');
assert.throws(()=>preparePrivyUSWalletBinding({
 authenticatedUSSubject:subject,dedicatedUSPrivyProjectId:'nexa-br-project',verified:evidence,now
}),/PRIVY_PROJECT_MISMATCH/);
assert.throws(()=>preparePrivyUSWalletBinding({
 authenticatedUSSubject:subject,dedicatedUSPrivyProjectId:evidence.projectId,
 verified:{...evidence,control:'service'},now
}),/PRIVY_WALLET_NOT_USER_OWNED/);
assert.throws(()=>preparePrivyUSWalletBinding({
 authenticatedUSSubject:subject,dedicatedUSPrivyProjectId:evidence.projectId,
 verified:{...evidence,additionalSigners:['automation-key']},now
}),/PRIVY_DELEGATED_SIGNERS_PRESENT/);
assert.throws(()=>preparePrivyUSWalletBinding({
 authenticatedUSSubject:subject,dedicatedUSPrivyProjectId:evidence.projectId,
 verified:{...evidence,linkedToAuthenticatedSubject:'us_subject_other'},now
}),/PRIVY_IDENTITY_NOT_LINKED/);
console.log('Nex Personal USA wallet ownership + Privy candidate gates: PASS (no real provider calls)');
