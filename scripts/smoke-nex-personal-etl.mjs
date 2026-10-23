import assert from 'node:assert/strict';
import {enrichBankTransaction,enrichEvmTransfer,previewEnrichment,cleanTransactionDescription}
 from '../packages/integrations/dist/personal-transaction-etl.js';

const base={source:'csv',accountRef:'account-a',date:'2026-10-23',currency:'BRL'};
const grocery=enrichBankTransaction({...base,description:'Supermercado da Esquina',amountMinor:'-4525',reference:'R1'});
assert.equal(grocery.category,'Alimentação');assert.equal(grocery.treatment,'expense');assert.equal(grocery.strongReference,true);
assert.equal(grocery.amount,'-4525');assert.equal(grocery.unit,'BRL');assert.equal(grocery.externalEffect,false);
const salary=enrichBankTransaction({...base,description:'Crédito recebido',amountMinor:'120000',reference:'R2'});
assert.equal(salary.treatment,'review','A positive credit is not automatically salary');
const pix=enrichBankTransaction({...base,description:'PIX enviado',amountMinor:'-40000',reference:'R3'});
assert.equal(pix.category,'Transferências');
assert.equal(pix.treatment,'review','Pix may be a third-party payment');
const own=enrichBankTransaction({...base,description:'PIX enviado',amountMinor:'-40000',reference:'R4',selfTransferConfirmed:true});
assert.equal(own.treatment,'excluded_internal');
const of=enrichBankTransaction({...base,source:'open_finance',description:'COMERCIO ABC',amountMinor:'-3000',
  reference:'belvo-2930',providerCategory:'Food & Groceries',merchantName:'Mercado Verde'});
assert.equal(of.category,'Alimentação');
assert.equal(of.provenance,'consented_feed_unverified');
assert.equal(of.confidence,'medium','Provider category is a suggestion, not verified independently');

const noRef1=enrichBankTransaction({...base,description:'Compra de 20,00',amountMinor:'-2000'});
const noRef2=enrichBankTransaction({...base,description:'Compra de 20,00',amountMinor:'-2000'});
const weak=previewEnrichment([{...base,description:'Compra de 20,00',amountMinor:'-2000'},
 {...base,description:'Compra de 20,00',amountMinor:'-2000'}]);
assert.equal(noRef1.fingerprint,noRef2.fingerprint);
assert.equal(weak.items[0].strongReference,false);
assert.equal(weak.items[0].duplicateCandidate,false,'Do not automatically drop identical legitimate charges');
const duplicate=previewEnrichment([{...base,description:'Compra x',amountMinor:'-2000',reference:'FITID-SAME'},
 {...base,description:'Compra x',amountMinor:'-2000',reference:'FITID-SAME'}]);
assert.equal(duplicate.items[1].duplicateCandidate,true);
const distinct=previewEnrichment([{...base,description:'Compra x',amountMinor:'-2000',reference:'FITID-A'},
 {...base,description:'Compra x',amountMinor:'-2000',reference:'FITID-B'}]);
assert.equal(distinct.items[1].duplicateCandidate,false);
assert.match(cleanTransactionDescription('CPF 123.456.789-00 email abc@example.org'),/\[documento\]/);
assert.match(cleanTransactionDescription('CPF 123.456.789-00 email abc@example.org'),/\[e-mail\]/);
assert.throws(()=>enrichBankTransaction({...base,date:'2026-13-99',description:'AAAA',amountMinor:'-100'}));

const wallet='0x'+'a'.repeat(40),other='0x'+'b'.repeat(40),owned='0x'+'c'.repeat(40),hash='0x'+'d'.repeat(64);
const tx={source:'onchain',walletAddress:wallet,from:other,to:wallet,chainId:137,txHash:hash,
 logIndex:0,symbol:'USDC',contractAddress:'0x'+'e'.repeat(40),amountAtomic:'1000000',decimals:6,status:'confirmed'};
const inbound=enrichEvmTransfer(tx);
assert.equal(inbound.direction,'in');assert.equal(inbound.amount,'1000000');
assert.equal(inbound.unit,'USDC');assert.equal(inbound.fractionDigits,6);
assert.equal(inbound.treatment,'review','Incoming USDC is not automatically income');
const ownChain=enrichEvmTransfer({...tx,from:wallet,to:owned,confirmedOwnWallets:[owned],logIndex:1});
assert.equal(ownChain.treatment,'excluded_internal');
assert.equal(ownChain.direction,'self');
const swapped=enrichEvmTransfer({...tx,from:wallet,to:other,action:'swap',logIndex:2});
assert.equal(swapped.treatment,'excluded_internal','Swap legs must not be recorded as ordinary expenses');
const pending=enrichEvmTransfer({...tx,status:'pending'});
assert.equal(pending.treatment,'review');assert.equal(pending.metadata.confirmed,false);
assert.notEqual(enrichEvmTransfer({...tx,logIndex:2}).fingerprint,enrichEvmTransfer({...tx,logIndex:3}).fingerprint);
const gas=enrichEvmTransfer({...tx,from:wallet,to:other,action:'gas',logIndex:10});
assert.equal(gas.category,'Taxas');assert.equal(gas.treatment,'expense');
assert.equal(gas.unit,'USDC','Do not silently convert native units to BRL');
assert.throws(()=>enrichEvmTransfer({...tx,from:other,to:other}));
assert.throws(()=>enrichEvmTransfer({...tx,txHash:'not-a-hash'}));
assert.throws(()=>previewEnrichment(Array.from({length:41},()=>tx)));
console.log('Personal transaction ETL: banking, Open Finance, Pix, EVM, fees, no fiat conversion, opt-in and safe dedupe OK');
