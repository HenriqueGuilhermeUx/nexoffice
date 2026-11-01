import {createHash,randomUUID} from 'node:crypto';
import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {ApiError,workspaceContext} from './auth.js';
import {auditLog} from './events.js';
import {transaction} from './db.js';
import {parseSpreadsheet,sanitizeCell} from './routes-connect-spreadsheet.js';

const MAX_BYTES=1_000_000;
const MAX_ROWS=1000;
const RESOURCE_KINDS=['customer','supplier','product','sale','receivable','payable'] as const;
type ResourceKind=typeof RESOURCE_KINDS[number];

const previewSchema=z.object({
  filename:z.string().trim().min(1).max(240),
  content:z.string().min(1).max(MAX_BYTES),
  resourceKind:z.enum(RESOURCE_KINDS),
  sourceSystem:z.string().trim().min(2).max(120).default('ERP / Contábil')
});
const importSchema=previewSchema.extend({
  datasetName:z.string().trim().min(2).max(120),
  humanConfirmed:z.literal(true)
});

type NormalizedRecord={
  resourceKind:ResourceKind;
  externalId:string;
  name?:string|null;
  email?:string|null;
  document?:string|null;
  phone?:string|null;
  status?:string|null;
  occurredAt?:string|null;
  dueAt?:string|null;
  paidAt?:string|null;
  amountMinor?:number|null;
  currency?:string|null;
  description?:string|null;
  sku?:string|null;
  quantity?:number|null;
  partyName?:string|null;
  partyEmail?:string|null;
  partyDocument?:string|null;
};

export async function registerErpConnectRoutes(app:FastifyInstance){
  app.post('/v1/connect/erp/preview',async req=>{
    await workspaceContext(req,'command.read');
    const input=previewSchema.parse(req.body||{});
    const parsed=parseSpreadsheet(input.filename,input.content,true);
    const normalized=parsed.rows.slice(0,8).map((row,index)=>normalizeRecord(input.resourceKind,recordFromRow(parsed.normalizedHeaders,row),index));
    return{
      source:'external.erp',
      sourceSystem:input.sourceSystem,
      resourceKind:input.resourceKind,
      filename:input.filename,
      rows:parsed.rows.length,
      headers:parsed.headers,
      inferred:parsed.inferred,
      normalizedSample:normalized,
      mapping:buildMapping(input.resourceKind,parsed.normalizedHeaders),
      warnings:parsed.warnings,
      safety:{persisted:false,externalEffects:false,rawFileStored:false,normalizedOnly:true}
    };
  });

  app.post('/v1/connect/erp/import',async req=>{
    const ctx=await workspaceContext(req,'command.write');
    const input=importSchema.parse(req.body||{});
    const parsed=parseSpreadsheet(input.filename,input.content,false);
    if(!parsed.rows.length)throw new ApiError(400,'erp_import_empty','O arquivo não possui linhas válidas.');
    if(parsed.rows.length>MAX_ROWS)throw new ApiError(400,'erp_import_too_large',`O limite inicial é de ${MAX_ROWS} linhas por importação.`);

    const datasetId=randomUUID();
    const fingerprint=createHash('sha256').update(input.content).digest('hex');
    const result=await transaction(async client=>{
      let inserted=0,duplicates=0;
      for(let index=0;index<parsed.rows.length;index++){
        const raw=recordFromRow(parsed.normalizedHeaders,parsed.rows[index]);
        const normalized=normalizeRecord(input.resourceKind,raw,index);
        const rowHash=createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
        const externalRef=createHash('sha256').update(`${input.sourceSystem}:${input.resourceKind}:${normalized.externalId}:${rowHash}`).digest('hex').slice(0,48);
        const exists=await client.query(
          `select 1 from business_events where workspace_id=$1 and source='external.erp' and correlation_id=$2 limit 1`,
          [ctx.workspaceId,externalRef]
        );
        if(exists.rowCount){duplicates++;continue}
        await client.query(
          `insert into business_events(id,workspace_id,type,source,subject_type,subject_id,payload,correlation_id,occurred_at)
           values($1,$2,$3,'external.erp','external_erp_dataset',$4,$5,$6,$7)`,
          [
            randomUUID(),ctx.workspaceId,`erp.${input.resourceKind}.observed`,datasetId,
            JSON.stringify({
              schemaVersion:'nex-connect-erp-v1',
              datasetId,
              datasetName:input.datasetName,
              sourceSystem:input.sourceSystem,
              filename:input.filename,
              rowNumber:index+2,
              resourceKind:input.resourceKind,
              normalized,
              mapping:buildMapping(input.resourceKind,parsed.normalizedHeaders),
              rawFileStored:false,
              rawRowStored:false
            }),
            externalRef,
            new Date().toISOString()
          ]
        );
        inserted++;
      }
      return{inserted,duplicates};
    });

    await auditLog(ctx,'nex_connect.erp_imported','external_dataset',datasetId,null,{
      sourceSystem:input.sourceSystem,
      resourceKind:input.resourceKind,
      datasetName:input.datasetName,
      filename:input.filename,
      totalRows:parsed.rows.length,
      inserted:result.inserted,
      duplicates:result.duplicates,
      fingerprint:fingerprint.slice(0,16),
      rawFileStored:false,
      rawRowsStored:false,
      externalEffect:false
    });

    return{
      source:'external.erp',
      sourceSystem:input.sourceSystem,
      resourceKind:input.resourceKind,
      datasetId,
      imported:result.inserted,
      duplicates:result.duplicates,
      total:parsed.rows.length,
      warnings:parsed.warnings,
      safety:{rawFileStored:false,rawRowsStored:false,externalEffects:false,automationsTriggered:false,normalizedOnly:true,workspaceScoped:true}
    };
  });
}

function recordFromRow(headers:string[],row:string[]){
  return Object.fromEntries(headers.map((header,index)=>[header,sanitizeCell(row[index]??'')]));
}
function value(record:Record<string,string>,aliases:string[]){
  for(const alias of aliases){
    if(record[alias]!==undefined&&String(record[alias]).trim()!=='')return String(record[alias]).trim();
  }
  return '';
}
function parseMoneyMinor(input:string){
  const raw=String(input||'').trim().replace(/R\$/gi,'').replace(/\s/g,'');
  if(!raw)return null;
  let normalized=raw;
  if(raw.includes(',')&&raw.includes('.'))normalized=raw.lastIndexOf(',')>raw.lastIndexOf('.')?raw.replace(/\./g,'').replace(',','.'):raw.replace(/,/g,'');
  else if(raw.includes(','))normalized=raw.replace(/\./g,'').replace(',','.');
  const amount=Number(normalized.replace(/[^0-9.-]/g,''));
  return Number.isFinite(amount)?Math.round(amount*100):null;
}
function parseNumber(input:string){
  const n=Number(String(input||'').replace(',','.').replace(/[^0-9.-]/g,''));
  return Number.isFinite(n)?n:null;
}
function parseDate(input:string){
  const text=String(input||'').trim();if(!text)return null;
  const br=text.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if(br){
    const d=new Date(Date.UTC(+br[3],+br[2]-1,+br[1],+(br[4]||12),+(br[5]||0),+(br[6]||0)));
    return Number.isNaN(d.getTime())?null:d.toISOString();
  }
  const d=new Date(text);return Number.isNaN(d.getTime())?null:d.toISOString();
}
function normalizeEmail(input:string){
  const value=String(input||'').trim().toLowerCase();
  return value.includes('@')?value:null;
}
function cleanDocument(input:string){
  const value=String(input||'').replace(/\D/g,'');
  return value||null;
}
function externalId(record:Record<string,string>,index:number){
  return value(record,['id','codigo','code','referencia','ref','numero','number','documento','cnpj','cpf'])||`row-${index+1}`;
}
function normalizeRecord(kind:ResourceKind,record:Record<string,string>,index:number):NormalizedRecord{
  const id=externalId(record,index);
  const common={
    resourceKind:kind,
    externalId:id,
    status:value(record,['status','situacao','stage','etapa'])||null,
    description:value(record,['descricao','description','historico','observacao','notes'])||null
  } satisfies Partial<NormalizedRecord>;

  if(kind==='customer'||kind==='supplier'){
    return{
      ...common,resourceKind:kind,externalId:id,
      name:value(record,kind==='customer'?['cliente','customer','nome','name','empresa','company']:['fornecedor','supplier','nome','name','empresa','company'])||null,
      email:normalizeEmail(value(record,['email','e_mail'])),
      phone:value(record,['telefone','phone','celular','whatsapp'])||null,
      document:cleanDocument(value(record,['cnpj','cpf','documento','tax_id']))
    };
  }
  if(kind==='product'){
    return{
      ...common,resourceKind:kind,externalId:id,
      name:value(record,['produto','product','servico','service','item','nome','name'])||null,
      sku:value(record,['sku','codigo','code','referencia','ref'])||null,
      amountMinor:parseMoneyMinor(value(record,['preco','price','valor','amount','total'])),
      currency:value(record,['moeda','currency'])||'BRL'
    };
  }

  const partyName=value(record,['cliente','customer','fornecedor','supplier','empresa','company','nome','name'])||null;
  const partyEmail=normalizeEmail(value(record,['email','e_mail','cliente_email','customer_email','fornecedor_email','supplier_email']));
  const partyDocument=cleanDocument(value(record,['cnpj','cpf','documento','tax_id','cliente_documento','fornecedor_documento']));
  const amountMinor=parseMoneyMinor(value(record,['valor','amount','total','receita','custo','price','preco']));
  const occurredAt=parseDate(value(record,['data','date','emissao','issued_at','created_at','created']));
  const dueAt=parseDate(value(record,['vencimento','due','due_at','data_vencimento']));
  const paidAt=parseDate(value(record,['pagamento','paid_at','data_pagamento','received_at']));
  return{
    ...common,resourceKind:kind,externalId:id,
    occurredAt,dueAt,paidAt,amountMinor,
    currency:value(record,['moeda','currency'])||'BRL',
    quantity:parseNumber(value(record,['quantidade','quantity','qtd'])),
    partyName,partyEmail,partyDocument,
    name:kind==='sale'?value(record,['produto','product','servico','service','item','descricao','description'])||null:null
  };
}
function buildMapping(kind:ResourceKind,headers:string[]){
  const groups:Record<ResourceKind,Record<string,string[]>>={
    customer:{name:['cliente','customer','nome','name','empresa','company'],email:['email','e_mail'],document:['cnpj','cpf','documento','tax_id'],phone:['telefone','phone','celular','whatsapp']},
    supplier:{name:['fornecedor','supplier','nome','name','empresa','company'],email:['email','e_mail'],document:['cnpj','cpf','documento','tax_id'],phone:['telefone','phone','celular','whatsapp']},
    product:{name:['produto','product','servico','service','item','nome','name'],sku:['sku','codigo','code','referencia','ref'],amount:['preco','price','valor','amount','total']},
    sale:{party:['cliente','customer','empresa','company'],email:['email','cliente_email','customer_email'],amount:['valor','amount','total'],date:['data','date','emissao','issued_at'],status:['status','situacao','stage']},
    receivable:{party:['cliente','customer','empresa','company'],email:['email','cliente_email','customer_email'],amount:['valor','amount','total'],due:['vencimento','due','due_at','data_vencimento'],status:['status','situacao']},
    payable:{party:['fornecedor','supplier','empresa','company'],email:['email','fornecedor_email','supplier_email'],amount:['valor','amount','total','custo'],due:['vencimento','due','due_at','data_vencimento'],status:['status','situacao']}
  };
  return Object.fromEntries(Object.entries(groups[kind]).map(([field,aliases])=>[field,aliases.find(alias=>headers.includes(alias))||null]));
}
