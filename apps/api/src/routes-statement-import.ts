import {createHash} from 'node:crypto';
import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {ApiError,workspaceContext} from './auth.js';
import {query} from './db.js';
import {auditLog} from './events.js';

const uuid=z.string().uuid();
const MAX_BYTES=2_000_000;
const MAX_ITEMS=5000;

type ParsedTx={occurredAt:string;direction:'income'|'expense';amountMinor:number;description:string;counterparty?:string|null;documentNumber?:string|null;externalRef:string;metadata:Record<string,unknown>};

export async function registerStatementImportRoutes(app:FastifyInstance){
  app.post('/v1/reconciliation/import-file/preview',async req=>{
    await workspaceContext(req,'finance.read');
    const input=z.object({filename:z.string().min(1).max(240),content:z.string().min(1).max(MAX_BYTES)}).parse(req.body);
    const result=parseStatement(input.filename,input.content,true);
    return {format:result.format,count:result.items.length,headers:result.headers||[],sample:result.items.slice(0,8),warnings:result.warnings};
  });

  app.post('/v1/reconciliation/import-file',async req=>{
    const ctx=await workspaceContext(req,'finance.write');
    const input=z.object({accountId:uuid,filename:z.string().min(1).max(240),content:z.string().min(1).max(MAX_BYTES)}).parse(req.body);
    const account=(await query<any>(`select id from finance_accounts where id=$1 and workspace_id=$2 and active=true`,[input.accountId,ctx.workspaceId]))[0];
    if(!account)throw new ApiError(404,'account_not_found','Conta financeira não encontrada.');
    const parsed=parseStatement(input.filename,input.content,false);
    if(!parsed.items.length)throw new ApiError(400,'statement_empty','Nenhuma movimentação válida foi encontrada no arquivo.');
    if(parsed.items.length>MAX_ITEMS)throw new ApiError(400,'statement_too_large',`O arquivo contém mais de ${MAX_ITEMS} movimentações.`);
    let inserted=0,duplicates=0;
    const provider=`file:${parsed.format}`;
    for(const item of parsed.items){
      const rows=await query<any>(`insert into bank_transactions(workspace_id,account_id,provider,external_ref,occurred_at,direction,amount_minor,currency,description,counterparty,document_number,raw_metadata) values($1,$2,$3,$4,$5,$6,$7,'BRL',$8,$9,$10,$11) on conflict(workspace_id,account_id,provider,external_ref) where external_ref is not null do nothing returning id`,[ctx.workspaceId,input.accountId,provider,item.externalRef,item.occurredAt,item.direction,item.amountMinor,item.description,item.counterparty||null,item.documentNumber||null,JSON.stringify({...item.metadata,filename:input.filename,importFormat:parsed.format})]);
      if(rows.length)inserted++;else duplicates++;
    }
    await auditLog(ctx,'reconciliation.file_imported','finance_account',input.accountId,null,{filename:input.filename,format:parsed.format,inserted,duplicates,total:parsed.items.length,rawFileStored:false});
    return {format:parsed.format,inserted,duplicates,total:parsed.items.length,warnings:parsed.warnings,rawFileStored:false};
  });
}

function parseStatement(filename:string,content:string,preview:boolean):{format:'ofx'|'csv';items:ParsedTx[];headers?:string[];warnings:string[]}{
  const trimmed=content.trim();
  if(/<OFX[>\s]|<STMTTRN>/i.test(trimmed)||filename.toLowerCase().endsWith('.ofx'))return parseOfx(trimmed,preview);
  return parseCsv(trimmed,preview);
}

function parseOfx(content:string,preview:boolean){
  const blocks=[...content.matchAll(/<STMTTRN>([\s\S]*?)(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi)].map(x=>x[1]);
  const warnings:string[]=[];const items:ParsedTx[]=[];
  for(const block of blocks.slice(0,preview?50:MAX_ITEMS+1)){
    const tag=(name:string)=>{const m=block.match(new RegExp(`<${name}>([^<\\r\\n]+)`,'i'));return m?.[1]?.trim()||''};
    const amount=parseMoney(tag('TRNAMT'));if(!Number.isFinite(amount)||amount===0)continue;
    const dt=parseOfxDate(tag('DTPOSTED')||tag('DTUSER'));if(!dt){warnings.push('Uma movimentação OFX foi ignorada por data inválida.');continue}
    const fitid=tag('FITID'),name=tag('NAME'),memo=tag('MEMO'),check=tag('CHECKNUM');
    const description=[name,memo].filter(Boolean).join(' · ').slice(0,500)||'Movimentação bancária';
    const rawRef=fitid||`${dt}|${amount}|${description}|${check}`;
    items.push({occurredAt:dt,direction:amount>=0?'income':'expense',amountMinor:Math.round(Math.abs(amount)*100),description,counterparty:name||null,documentNumber:check||null,externalRef:stableRef(rawRef),metadata:{ofxType:tag('TRNTYPE')||null,fitid:fitid||null}});
  }
  return {format:'ofx' as const,items,warnings};
}

function parseCsv(content:string,preview:boolean){
  const lines=content.replace(/^\uFEFF/,'').split(/\r?\n/).filter(x=>x.trim());
  if(lines.length<2)throw new ApiError(400,'csv_invalid','O CSV precisa ter cabeçalho e pelo menos uma linha de dados.');
  const delimiter=guessDelimiter(lines[0]);const rows=lines.slice(0,preview?60:MAX_ITEMS+2).map(line=>parseCsvLine(line,delimiter));
  const headers=rows[0].map(normalizeHeader);const warnings:string[]=[];
  const dateIdx=findHeader(headers,['data','date','dt','data_lancamento','data_movimento','data_transacao']);
  const descIdx=findHeader(headers,['descricao','description','historico','memo','detalhes','lancamento','descricao_lancamento']);
  const amountIdx=findHeader(headers,['valor','amount','valor_rs','valor_r','montante']);
  const debitIdx=findHeader(headers,['debito','debit','saida','valor_debito']);
  const creditIdx=findHeader(headers,['credito','credit','entrada','valor_credito']);
  const typeIdx=findHeader(headers,['tipo','type','natureza','dc']);
  const idIdx=findHeader(headers,['id','fitid','identificador','documento','numero_documento','num_doc']);
  const counterpartyIdx=findHeader(headers,['favorecido','contraparte','counterparty','nome','pagador','recebedor']);
  if(dateIdx<0||descIdx<0||(amountIdx<0&&(debitIdx<0||creditIdx<0)))throw new ApiError(400,'csv_mapping_required',`Não consegui identificar automaticamente as colunas essenciais. Cabeçalhos encontrados: ${rows[0].join(', ')}`);
  const items:ParsedTx[]=[];
  for(let i=1;i<rows.length;i++){
    const row=rows[i];const dt=parseDate(row[dateIdx]||'');if(!dt){warnings.push(`Linha ${i+1} ignorada por data inválida.`);continue}
    let signed=0;
    if(amountIdx>=0)signed=parseMoney(row[amountIdx]||'');
    else {const credit=parseMoney(row[creditIdx]||'');const debit=parseMoney(row[debitIdx]||'');signed=Math.abs(credit||0)-Math.abs(debit||0)}
    if(!Number.isFinite(signed)||signed===0)continue;
    const type=String(typeIdx>=0?row[typeIdx]||'':'').toLowerCase();
    let direction:signedDirection=signed>=0?'income':'expense';
    if(/d[eé]bito|debito|sa[ií]da|expense|out|d\b/.test(type))direction='expense';
    if(/cr[eé]dito|credito|entrada|income|in|c\b/.test(type))direction='income';
    const description=String(row[descIdx]||'Movimentação bancária').trim().slice(0,500);
    const rawId=idIdx>=0?String(row[idIdx]||'').trim():'';const rawRef=rawId||`${dt}|${signed}|${description}|${i}`;
    items.push({occurredAt:dt,direction,amountMinor:Math.round(Math.abs(signed)*100),description,counterparty:counterpartyIdx>=0?String(row[counterpartyIdx]||'').trim()||null:null,documentNumber:rawId||null,externalRef:stableRef(rawRef),metadata:{csvLine:i+1}});
  }
  return {format:'csv' as const,items,headers:rows[0],warnings:warnings.slice(0,20)};
}
type signedDirection='income'|'expense';

function stableRef(value:string){return createHash('sha256').update(value).digest('hex').slice(0,48)}
function normalizeHeader(value:string){return value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')}
function findHeader(headers:string[],candidates:string[]){return headers.findIndex(h=>candidates.includes(h)||candidates.some(c=>h.includes(c)))}
function guessDelimiter(line:string){const values=[[';',line.split(';').length],[',',line.split(',').length],['\t',line.split('\t').length]] as const;return [...values].sort((a,b)=>b[1]-a[1])[0][0]}
function parseCsvLine(line:string,delimiter:string){const out:string[]=[];let cur='',quoted=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(quoted&&line[i+1]==='"'){cur+='"';i++}else quoted=!quoted;continue}if(ch===delimiter&&!quoted){out.push(cur.trim());cur=''}else cur+=ch}out.push(cur.trim());return out}
function parseMoney(value:string){let s=String(value||'').trim().replace(/R\$|\s/g,'');if(!s)return 0;const neg=/^-|\(.*\)$/.test(s);s=s.replace(/[()+-]/g,'');if(s.includes(',')&&s.includes('.'))s=s.lastIndexOf(',')>s.lastIndexOf('.')?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');else if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');const n=Number(s);return (neg?-1:1)*n}
function parseDate(value:string){const v=String(value||'').trim();if(!v)return null;const br=v.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);if(br){let y=Number(br[3]);if(y<100)y+=2000;const d=new Date(Date.UTC(y,Number(br[2])-1,Number(br[1]),Number(br[4]||12),Number(br[5]||0),Number(br[6]||0)));return Number.isNaN(d.getTime())?null:d.toISOString()}const iso=new Date(v);return Number.isNaN(iso.getTime())?null:iso.toISOString()}
function parseOfxDate(value:string){const m=String(value||'').match(/^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/);if(!m)return null;const d=new Date(Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3]),Number(m[4]||12),Number(m[5]||0),Number(m[6]||0)));return Number.isNaN(d.getTime())?null:d.toISOString()}
