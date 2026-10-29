import {createHash,randomUUID} from 'node:crypto';
import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {ApiError,workspaceContext} from './auth.js';
import {auditLog} from './events.js';
import {transaction} from './db.js';

const MAX_BYTES=1_000_000;
const MAX_ROWS=1000;
const previewSchema=z.object({
  filename:z.string().trim().min(1).max(240),
  content:z.string().min(1).max(MAX_BYTES)
});
const importSchema=previewSchema.extend({
  datasetName:z.string().trim().min(2).max(120),
  humanConfirmed:z.literal(true)
});

type ParsedSheet={
  delimiter:string;
  headers:string[];
  normalizedHeaders:string[];
  rows:string[][];
  warnings:string[];
  inferred:Array<{header:string;normalized:string;semantic:string;confidence:number}>;
};

export async function registerConnectSpreadsheetRoutes(app:FastifyInstance){
  app.post('/v1/connect/spreadsheet/preview',async req=>{
    await workspaceContext(req,'command.read');
    const input=previewSchema.parse(req.body||{});
    const parsed=parseSpreadsheet(input.filename,input.content,true);
    return{
      source:'external.spreadsheet',
      filename:input.filename,
      rows:parsed.rows.length,
      headers:parsed.headers,
      inferred:parsed.inferred,
      sample:parsed.rows.slice(0,8).map(row=>Object.fromEntries(parsed.headers.map((header,index)=>[header,row[index]??'']))),
      warnings:parsed.warnings,
      safety:{persisted:false,externalEffects:false,rawFileStored:false}
    };
  });

  app.post('/v1/connect/spreadsheet/import',async req=>{
    const ctx=await workspaceContext(req,'command.write');
    const input=importSchema.parse(req.body||{});
    const parsed=parseSpreadsheet(input.filename,input.content,false);
    if(!parsed.rows.length)throw new ApiError(400,'spreadsheet_empty','A planilha não possui linhas válidas para importar.');
    if(parsed.rows.length>MAX_ROWS)throw new ApiError(400,'spreadsheet_too_large',`O limite inicial é de ${MAX_ROWS} linhas por importação.`);

    const datasetId=randomUUID();
    const fingerprint=createHash('sha256').update(input.content).digest('hex');
    const importedAt=new Date().toISOString();

    const result=await transaction(async client=>{
      let inserted=0,duplicates=0;
      for(let index=0;index<parsed.rows.length;index++){
        const row=parsed.rows[index];
        const record=Object.fromEntries(parsed.normalizedHeaders.map((header,column)=>[header,sanitizeCell(row[column]??'')]));
        const rowHash=createHash('sha256').update(JSON.stringify(record)).digest('hex');
        const externalRef=createHash('sha256').update(`${fingerprint}:${rowHash}:${index}`).digest('hex').slice(0,48);
        const exists=await client.query(
          `select 1 from business_events where workspace_id=$1 and source='external.spreadsheet' and correlation_id=$2 limit 1`,
          [ctx.workspaceId,externalRef]
        );
        if(exists.rowCount){duplicates++;continue}
        const eventId=randomUUID();
        await client.query(
          `insert into business_events(id,workspace_id,type,source,subject_type,subject_id,payload,correlation_id,occurred_at)
           values($1,$2,'external_record.observed','external.spreadsheet','external_dataset',$3,$4,$5,$6)`,
          [
            eventId,ctx.workspaceId,datasetId,
            JSON.stringify({
              datasetId,
              datasetName:input.datasetName,
              filename:input.filename,
              rowNumber:index+2,
              schemaVersion:'nex-connect-spreadsheet-v1',
              inferred:parsed.inferred,
              record
            }),
            externalRef,
            importedAt
          ]
        );
        inserted++;
      }
      return{inserted,duplicates};
    });

    await auditLog(ctx,'nex_connect.spreadsheet_imported','external_dataset',datasetId,null,{
      datasetName:input.datasetName,
      filename:input.filename,
      totalRows:parsed.rows.length,
      inserted:result.inserted,
      duplicates:result.duplicates,
      fingerprint:fingerprint.slice(0,16),
      rawFileStored:false,
      externalEffect:false
    });

    return{
      source:'external.spreadsheet',
      datasetId,
      datasetName:input.datasetName,
      filename:input.filename,
      imported:result.inserted,
      duplicates:result.duplicates,
      total:parsed.rows.length,
      inferred:parsed.inferred,
      warnings:parsed.warnings,
      safety:{
        rawFileStored:false,
        externalEffects:false,
        automationsTriggered:false,
        businessEventsOnly:true,
        workspaceScoped:true
      }
    };
  });
}

function parseSpreadsheet(filename:string,content:string,preview:boolean):ParsedSheet{
  const lower=filename.toLowerCase();
  if(!lower.endsWith('.csv')&&!lower.endsWith('.txt'))throw new ApiError(400,'spreadsheet_format_unsupported','Nesta primeira versão, envie CSV ou TXT delimitado.');
  const lines=content.replace(/^\uFEFF/,'').split(/\r?\n/).filter(line=>line.trim());
  if(lines.length<2)throw new ApiError(400,'spreadsheet_invalid','O arquivo precisa ter cabeçalho e ao menos uma linha de dados.');
  const delimiter=guessDelimiter(lines[0]);
  const parsedLines=lines.slice(0,preview?60:MAX_ROWS+2).map(line=>parseCsvLine(line,delimiter));
  const headers=dedupeHeaders(parsedLines[0].map((value,index)=>value.trim()||`coluna_${index+1}`));
  const normalizedHeaders=headers.map(normalizeHeader);
  const rows=parsedLines.slice(1).filter(row=>row.some(cell=>String(cell||'').trim()!==''));
  const warnings:string[]=[];
  const width=headers.length;
  for(let i=0;i<rows.length;i++){
    if(rows[i].length!==width)warnings.push(`Linha ${i+2} possui ${rows[i].length} coluna(s); o cabeçalho possui ${width}.`);
  }
  const inferred=headers.map((header,index)=>inferSemantic(header,rows.slice(0,50).map(row=>row[index]??'')));
  return{delimiter,headers,normalizedHeaders,rows,warnings:warnings.slice(0,20),inferred};
}

function inferSemantic(header:string,values:string[]){
  const normalized=normalizeHeader(header);
  const joined=values.join(' ').toLowerCase();
  const patterns:Array<[RegExp,string,number]>= [
    [/(^|_)(email|e_mail)($|_)/,'email',.98],
    [/(^|_)(telefone|phone|whatsapp|celular)($|_)/,'phone',.97],
    [/(^|_)(cnpj|cpf|documento|tax_id)($|_)/,'document',.95],
    [/(^|_)(data|date|created|updated|vencimento|due|paid_at)($|_)/,'date',.9],
    [/(^|_)(valor|amount|price|preco|total|receita|custo)($|_)/,'amount',.9],
    [/(^|_)(status|situacao|stage|etapa)($|_)/,'status',.9],
    [/(^|_)(nome|name|cliente|customer|empresa|company|fornecedor)($|_)/,'name',.85],
    [/(^|_)(id|codigo|code|ref|referencia)($|_)/,'identifier',.82],
    [/(^|_)(produto|product|servico|service|item)($|_)/,'offering',.8],
    [/(^|_)(descricao|description|historico|notes|observacao)($|_)/,'description',.8]
  ];
  for(const [pattern,semantic,confidence] of patterns)if(pattern.test(normalized))return{header,normalized,semantic,confidence};
  const emailRate=values.length?values.filter(v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())).length/values.length:0;
  if(emailRate>.6)return{header,normalized,semantic:'email',confidence:.75};
  const dateRate=values.length?values.filter(v=>!Number.isNaN(Date.parse(v))).length/values.length:0;
  if(dateRate>.7)return{header,normalized,semantic:'date',confidence:.65};
  const numberRate=values.length?values.filter(v=>/^[-+]?\s*(?:R\$\s*)?[\d.,]+$/.test(v.trim())).length/values.length:0;
  if(numberRate>.8&&/valor|total|saldo|preco|price|amount/.test(joined+normalized))return{header,normalized,semantic:'amount',confidence:.6};
  return{header,normalized,semantic:'generic',confidence:.4};
}

function sanitizeCell(value:string){
  const text=String(value||'').replace(/\u0000/g,'').trim().slice(0,2000);
  return /^[=+@]/.test(text)?`'${text}`:text;
}
function dedupeHeaders(headers:string[]){
  const seen=new Map<string,number>();
  return headers.map(header=>{const count=(seen.get(header)||0)+1;seen.set(header,count);return count===1?header:`${header}_${count}`});
}
function normalizeHeader(value:string){return value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')||'coluna'}
function guessDelimiter(line:string){const options=[[';',countOutsideQuotes(line,';')],[',',countOutsideQuotes(line,',')],['\t',countOutsideQuotes(line,'\t')]] as const;return [...options].sort((a,b)=>b[1]-a[1])[0][0]}
function countOutsideQuotes(line:string,delimiter:string){let count=0,quoted=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(quoted&&line[i+1]==='"')i++;else quoted=!quoted;continue}if(ch===delimiter&&!quoted)count++}return count}
function parseCsvLine(line:string,delimiter:string){const out:string[]=[];let cur='',quoted=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(quoted&&line[i+1]==='"'){cur+='"';i++}else quoted=!quoted;continue}if(ch===delimiter&&!quoted){out.push(cur.trim());cur=''}else cur+=ch}out.push(cur.trim());return out}
