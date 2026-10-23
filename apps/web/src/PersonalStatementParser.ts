// Client-side statement parser. Does not send original file bytes to our API.
export type StatementRow={date:string;description:string;amountMinor:string;category?:string;reference?:string};
const fail=(msg:string):never=>{throw new Error(msg);};
const safeDate=(raw:string):string=>{
 const value=raw.trim(),br=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
 const iso=br?[br[3],br[2],br[1]].join('-'):value;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(iso)||Number.isNaN(Date.parse(iso))||new Date(iso).toISOString().slice(0,10)!==iso)fail('Data inválida: '+raw);
 return iso;
};
export function cents(input:string):string{
 let text=input.replace(/R\$/gi,'').replace(/\s/g,'').trim();
 if(text.includes(','))text=text.replace(/\./g,'').replace(',','.');
 if(!/^[+-]?\d{1,11}(\.\d{1,2})?$/.test(text))fail('Valor inválido: '+input);
 const negative=text.startsWith('-');
 text=text.replace(/^[+-]/,'');
 const [integer,decimal='']=text.split('.');
 const minor=BigInt(integer)*100n+BigInt((decimal+'00').slice(0,2));
 return String(negative?-minor:minor);
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
export function parsePersonalCsv(text:string):StatementRow[]{
 const lines=text.replace(/^\uFEFF/,'').replace(/\r/g,'').split('\n').filter(x=>x.trim());
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
  const money=cents(tag(block,'TRNAMT'));
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
