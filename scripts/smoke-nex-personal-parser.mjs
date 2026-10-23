import assert from 'node:assert/strict';
import {parsePersonalStatement,parsePersonalCsv,parsePersonalOfx,cents} from '../apps/web/src/PersonalStatementParser.ts';

assert.equal(cents('1.234,56'),'123456');
assert.equal(cents('-12.30'),'-1230');
assert.equal(cents('+2,50'),'250');
assert.throws(()=>cents('1.2.3'));
assert.throws(()=>cents('NaN'));

const csv=[
 'data;descricao;valor;categoria;referencia',
 '23/10/2026;Supermercado;-30,90;Alimentação;abc-1',
 '2026-10-22;"Loja; Venda";-2.000,50;Compras;abc-2'
].join('\n');
const rows=parsePersonalStatement(csv,'transacoes.csv');
assert.equal(rows.length,2);
assert.deepEqual(rows[0],{
 date:'2026-10-23',description:'Supermercado',amountMinor:'-3090',category:'Alimentação',reference:'abc-1'
});
assert.equal(rows[1].description,'Loja; Venda');
assert.equal(rows[1].amountMinor,'-200050');
assert.throws(()=>parsePersonalCsv('data;descricao;valor\n2026-02-30;Xyz;-5,00'),/Data inválida/);

const xml=['<?xml version="1.0"?><OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>',
'<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261023120000[-3:BRT]</DTPOSTED>',
'<TRNAMT>-42.35</TRNAMT><FITID>bank-1</FITID><NAME>Mercado &amp; Hortifruti</NAME></STMTTRN>',
'<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261023120000</DTPOSTED>',
'<TRNAMT>-42.35</TRNAMT><FITID>bank-2</FITID><NAME>Mercado &amp; Hortifruti</NAME></STMTTRN>',
'</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>'].join('\n');
const ofx=parsePersonalStatement(xml,'statement.ofx');
assert.equal(ofx.length,2);
assert.equal(ofx[0].amountMinor,'-4235');
assert.equal(ofx[0].description,'Mercado & Hortifruti');
assert.equal(ofx[0].reference,'bank-1');
assert.equal(ofx[1].reference,'bank-2');
assert.notEqual(ofx[0].reference,ofx[1].reference);
const legacy=['OFXHEADER:100','DATA:OFXSGML','<OFX><BANKTRANLIST>',
'<STMTTRN>','<TRNTYPE>CREDIT','<DTPOSTED>20260914',
'<TRNAMT>150.01','<FITID>legacy-1','<NAME>Pagamento recebido',
'</BANKTRANLIST></OFX>'].join('\n');
const old=parsePersonalOfx(legacy);
assert.equal(old.length,1);
assert.equal(old[0].date,'2026-09-14');
assert.equal(old[0].amountMinor,'15001');
assert.throws(()=>parsePersonalOfx('<OFX><STMTTRN><TRNAMT>2</TRNAMT></STMTTRN></OFX>'),/Data OFX/);
console.log('Nex Personal local CSV and OFX parser: OK');
