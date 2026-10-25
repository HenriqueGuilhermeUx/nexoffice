import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {recoverMessageAddress} from 'viem';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {
 issuePersistedUSWalletChallenge,bindVerifiedUSExternalWallet
} from '../apps/api/dist/personal-us-wallet-binding-store.js';
import {createUSPolygonWalletSignatureVerifier} from '../apps/api/dist/personal-us-wallet-viem-verifier.js';

/** True ephemeral EOA signing + real Postgres 16; no real funds, no live RPC.
 * Deployed ERC-1271 verification needs an audited local-chain integration test.
 */
if(process.env.NPU_REAL_CRYPTO_CI!=='true')
 throw Error('REAL_CRYPTO_CI_ONLY');
const source=new URL(String(process.env.DATABASE_URL||''));
if(source.protocol!=='postgresql:'||source.hostname!=='127.0.0.1'||
 source.port!=='5432'||source.pathname!=='/nexoffice')
 throw Error('REFUSING_NON_DISPOSABLE_DATABASE');
const admin=new pg.Client({connectionString:source.toString()});
await admin.connect();
let pool;
try{
 await admin.query('CREATE DATABASE nex_personal_us_eoa_ci');
 const url=new URL(source);
 url.pathname='/nex_personal_us_eoa_ci';
 pool=new pg.Pool({connectionString:url.toString(),max:3});
 const sql=await readFile(new URL('../docs/sql/nex-personal-us-wallet-identity-review-only.sql',import.meta.url),'utf8');
 await pool.query(sql);
 const identity='us_eoa_crypto_subject',profileId=randomUUID();
 await pool.query(`INSERT INTO nex_personal_us.profiles(id,auth_subject,status)
 VALUES($1,$2,'active')`,[profileId,identity]);
 // No static wallet or production private key: generated only within this test.
 const account=privateKeyToAccount(generatePrivateKey());
 const other=privateKeyToAccount(generatePrivateKey());
 const trustedOrigin='https://nex-personal-us-crypto-ci.example.test';
 const challenge=await issuePersistedUSWalletChallenge({
  pool,authenticatedUSSubject:identity,walletAddress:account.address,
  trustedOrigin,now:new Date()
 });
 const signature=await account.signMessage({message:challenge.message});
 const wrongSignature=await other.signMessage({message:challenge.message});
 const provider={
  getChainId:async()=>137,
  // No deployed smart wallet in this test. Only EOA math is verified here.
  getBytecode:async()=>undefined,
  recoverMessageAddress:({message,signature})=>recoverMessageAddress({message,signature}),
  verifyMessage:async()=>{throw Error('CONTRACT_WALLET_NOT_TESTED')}
 };
 const verifier=createUSPolygonWalletSignatureVerifier(provider);
 const args={pool,authenticatedUSSubject:identity,challengeId:challenge.challengeId,
  trustedOrigin,signedMessage:challenge.message,signature,verifier,now:new Date()};
 await assert.rejects(bindVerifiedUSExternalWallet({...args,signature:wrongSignature}),
   /WALLET_SIGNATURE_UNVERIFIED/);
 const notConsumed=await pool.query(
  'SELECT consumed_at FROM nex_personal_us.wallet_ownership_challenges WHERE id=$1',
  [challenge.challengeId]);
 assert.equal(notConsumed.rows[0].consumed_at,null,'Bad signature must rollback');
 await assert.rejects(bindVerifiedUSExternalWallet({...args,signedMessage:challenge.message+' changed'}),
  /US_SIGNED_MESSAGE_MISMATCH/);
 const bound=await bindVerifiedUSExternalWallet(args);
 assert.equal(bound.walletAddress.toLowerCase(),account.address.toLowerCase());
 assert.equal(bound.executionAllowed,false);
 const db=await pool.query(
  'SELECT wallet_address,revoked_at FROM nex_personal_us.wallet_bindings WHERE id=$1',
  [bound.walletBindingId]);
 assert.equal(db.rows.length,1);
 assert.equal(db.rows[0].wallet_address.toLowerCase(),account.address.toLowerCase());
 assert.equal(db.rows[0].revoked_at,null);
 await assert.rejects(bindVerifiedUSExternalWallet(args),/US_CHALLENGE_INVALID/);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM nex_personal_us.wallet_bindings')).rows[0].n,1);
 console.log('PASS: real ephemeral EOA ECDSA + atomic US Postgres wallet binding; 0 network transactions');
}finally{
 if(pool)await pool.end();
 await admin.end();
}
