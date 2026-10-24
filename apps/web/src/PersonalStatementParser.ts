// Client-side statement parser. Does not send original file bytes to our API.
export type StatementRow={date:string;description:string;amountMinor:string;category?:string;reference?:string};
const fail=(msg:string):never=>{throw new Error(msg);};
const safeDate=(raw:string):string=>{
 const value=raw.trim(),br=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
 const iso=br?[br[3],br[2],br[1]].join('-'):value;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(iso)||Number.isNaN(Date.parse(iso))||new Date(iso).toISOString().slice(0,10)!==iso)fail('Data inválida: '+raw);
 return iso;
};
/**
 * CSV input can use documented bank exports with comma decimals (pt-BR)
 * or a single dot followed by one/two decimal digits (US-style exports).
 * A dot followed by THREE digits means a Brazilian thousands group:
 * "2.500" is R$ 2,500.00, never R$ 2.50.
 *
 * Form inputs use strict pt-BR to reject ambiguous "2.50" typing.
 * OFX uses the standard dot decimal marker with no thousands separators.
 * All modes operate in integer centavos, never floating point.
 */
export function cents(input:string,format:'csv'|'pt-BR'|'ofx'='csv'):string{
 const source=String(input||'').trim();
 const raw=(format==='ofx'?source:source.replace(/^\s*R\$\s*/i,'')).replace(/\s/g,'');
 const sign=raw.startsWith('-')?'-':'';
 const amount=raw.replace(/^[+-]/,'');
 if(!amount)fail('Valor vazio: informe um valor monetário.');
 let integral='',fraction='';
 if(format==='ofx'){
  if(!/^\d{1,11}(?:\.\d{1,2})?$/.test(amount))fail('Valor OFX inválido: '+input);
  [integral,fraction='']=amount.split('.');
 }else if(amount.includes(',')){
  if(!/^(?:\d{1,11}|\d{1,3}(?:\.\d{3})+),\d{1,2}$/.test(amount))
   fail('Valor inválido: use ponto para milhares e vírgula para centavos.');
  const parts=amount.split(',');
  integral=parts[0].replace(/\./g,'');fraction=parts[1];
 }else if(/^\d{1,3}(?:\.\d{3})+$/.test(amount)){
  integral=amount.replace(/\./g,'');
 }else if(format==='csv'&&/^\d{1,11}\.\d{1,2}$/.test(amount)){
  // Some bank CSVs really export in en-US format: 12.30 is R$12,30.
  [integral,fraction='']=amount.split('.');
 }else if(/^\d{1,11}$/.test(amount)){
  integral=amount;
 }else{
  fail(format==='pt-BR'
   ?'Valor ambíguo: use vírgula para centavos (12,30) ou ponto só para milhares (2.500).'
   :'Valor inválido: confira os separadores decimais do extrato.');
 }
 const minor=BigInt(integral)*100n+BigInt((fraction+'00').slice(0,2));
 if(minor>9_999_999_999_999n)fail('Valor fora do limite permitido.');
 return String(sign==='-'?-minor:minor);
}
const header=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z]/g,'');
const splitCsvLine=(line:string,delimiter:string):string[]=>{
 const parts:string[]=[];let current='',inside=false;
 for(let i=0;i<line.length;i++){
  const char=line[i];
  if(char==='"'&&inside&&line[i+1]==='"'){current+='"';i++;continue;}
  if(char==='"'){inside=!inside;continue;}
  if(char===delimiter&&!inside){parts.push(current.trim());current='';continue;}
  current+=char;
 }
 if(inside)fail('Arquivo CSV com aspas não fechadas.');
 return [...parts,current.trim()];
};
// A quoted CSV field may contain newlines. Split complete records, not lines.
const csvRecords=(source:string):string[]=>{
 const input=source.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
 const records:string[]=[];let record='',quoted=false;
 for(let i=0;i<input.length;i++){
  const char=input[i];
  if(char==='"'){
   if(quoted&&input[i+1]==='"'){record+='""';i++;continue;}
   quoted=!quoted;
  }
  if(char==='\n'&&!quoted){if(record.trim())records.push(record);record='';}
  else record+=char;
 }
 if(quoted)fail('Arquivo CSV com aspas não fechadas.');
 if(record.trim())records.push(record);
 return records;
};
export function parsePersonalCsv(text:string):StatementRow[]{
 const lines=csvRecords(text);
 if(lines.length<2)fail('CSV vazio: inclua cabeçalho e pelo menos uma movimentação.');
 if(lines.length>251)fail('Importe no máximo 250 transações por vez.');
 const delimiter=lines[0].includes(';')?';':',';
 const headers=splitCsvLine(lines[0],delimiter).map(header);
 const col=(variants:string[])=>headers.findIndex(x=>variants.includes(x));
 const date=col(['data','date','dataoperacao','datalancamento','datalanc']),description=col(['descricao','description','historico','estabelecimento','detalhe']),
  amount=col(['valor','amount','valorr','valorbrl']),category=col(['categoria','category']),
  reference=col(['referencia','reference','idtransacao','fitid','identificador']);
 if(date<0||description<0||amount<0)fail('Cabeçalhos esperados: data;descricao;valor.');
 return lines.slice(1).map((line,index)=>{
  const fields=splitCsvLine(line,delimiter),name=(fields[description]||'').trim(),money=cents(fields[amount]||'');
  if(name.length<2||name.length>120)fail('Descrição inválida na linha '+(index+2));
  if(money==='0')fail('Valor zero na linha '+(index+2));
  const cat=(category>=0?(fields[category]||''):'').trim();
  if(cat&&(cat.length<2||cat.length>70))fail('Categoria inválida na linha '+(index+2));
  const ref=reference>=0?(fields[reference]||'').trim():'';
  if(ref.length>120)fail('Referência excessivamente longa na linha '+(index+2));
  return {date:safeDate(fields[date]||''),description:name,amountMinor:money,...(cat?{category:cat}:{}),...(ref?{reference:ref}:{})};
 });
}
const xmlDecode=(s:string)=>s.replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&quot;/gi,'"').replace(/&apos;/gi,"'");
const tag=(block:string,name:string):string=>{
 const match=new RegExp('<'+name+'\\s*>([^\\r\\n<]*)','i').exec(block);
 return match?xmlDecode(match[1].trim()):'';
};
export function parsePersonalOfx(text:string):StatementRow[]{
 const blocks=[...text.matchAll(/<STMTTRN\s*>([\s\S]*?)(?=<\/STMTTRN\s*>|<STMTTRN\s*>|$)/gi)].map(m=>m[1]);
 if(blocks.length===0)fail('Não foi encontrada uma lista de transações OFX (STMTTRN).');
 if(blocks.length>250)fail('Importe no máximo 250 transações OFX por vez.');
 return blocks.map((block,i)=>{
  const posted=tag(block,'DTPOSTED').slice(0,8);
  if(!/^\d{8}$/.test(posted))fail('Data OFX ausente ou inválida na transação '+(i+1));
  const description=(tag(block,'NAME')||tag(block,'MEMO')||tag(block,'TRNTYPE')||'').slice(0,120);
  if(description.length<2)fail('Descrição OFX ausente na transação '+(i+1));
  const money=cents(tag(block,'TRNAMT'),'ofx');
  if(money==='0')fail('Valor zero no OFX na transação '+(i+1));
  const fitid=tag(block,'FITID').slice(0,120);
  return {
   date:safeDate(posted.slice(0,4)+'-'+posted.slice(4,6)+'-'+posted.slice(6,8)),
   description,amountMinor:money,...(fitid?{reference:fitid}:{})
  };
 });
}
export function parsePersonalStatement(text:string,fileName:string):StatementRow[]{
 const ofx=/\.ofx$/i.test(fileName)||/<OFX\b/i.test(text);
 return ofx?parsePersonalOfx(text):parsePersonalCsv(text);
}
