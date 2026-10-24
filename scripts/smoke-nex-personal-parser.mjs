import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parsePersonalStatement,parsePersonalCsv,parsePersonalOfx,cents} from '../apps/web/src/PersonalStatementParser.ts';

assert.equal(cents('1.234,56'),'123456');
assert.equal(cents('2.500'),'250000','CSV thousands separator must never become cents');
assert.equal(cents('-2.500'),'-250000','Negative CSV grouping cannot shrink financial liabilities');
assert.equal(cents('2.500','pt-BR'),'250000','Manual balance with dot groups equals R$2.500');
assert.equal(cents('1.000.000,50','pt-BR'),'100000050');
assert.equal(cents('12,30','pt-BR'),'1230');
assert.equal(cents('0','pt-BR'),'0');
assert.throws(()=>cents('12.30','pt-BR'),/ambíguo/,'Manual forms require comma decimals');
assert.throws(()=>cents('1.2.3','pt-BR'));
assert.throws(()=>cents('2.500','ofx'),/OFX inválido/,'OFX cannot confuse three fractional digits with grouping');
assert.equal(cents('2.50','ofx'),'250','OFX decimal dot must still work');
assert.equal(cents('-42.35','ofx'),'-4235');
assert.throws(()=>cents('1,500','csv'),/inválido/);
assert.throws(()=>cents('1.234,567','pt-BR'),/inválido/);
assert.throws(()=>cents('100000000000','pt-BR'),/ambíguo|inválido|limite/);

assert.equal(cents('-12.30'),'-1230');
assert.equal(cents('+2,50'),'250');
assert.throws(()=>cents('1.2.3'));
assert.throws(()=>cents('NaN'));

const csv=[
 'data;descricao;valor;categoria;referencia',
 '23/10/2026;Supermercado;-30,90;Alimentação;abc-1',
 '2026-10-22;"Loja; Venda";-2.000,50;Compras;abc-2'
].join('\n');
const groupingCsv='data;descricao;valor\n2026-10-23;Assinatura anual;-2.500';
assert.equal(parsePersonalCsv(groupingCsv)[0].amountMinor,'-250000','Bank CSV group separator is not a decimal dot');
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
const studio=readFileSync('apps/web/src/NexPersonalStudio.tsx','utf8');
assert.match(studio,/return cents\(value,'pt-BR'\)/,'All financial forms must use the strict pt-BR shared parser');
assert.match(studio,/2\.500.*R\$ 2\.500,00/,'Manual value example must clarify thousands grouping');
assert.match(studio,/OFX utiliza ponto para os centavos/,'Import screen must explain different OFX locale');
console.log('Nex Personal local CSV and OFX parser: OK');
