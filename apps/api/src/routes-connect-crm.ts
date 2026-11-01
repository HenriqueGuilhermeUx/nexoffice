import {createHash,randomUUID} from 'node:crypto';
import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {ApiError,workspaceContext} from './auth.js';
import {auditLog} from './events.js';
import {transaction} from './db.js';
import {parseSpreadsheet,sanitizeCell} from './routes-connect-spreadsheet.js';

const MAX_BYTES=1_000_000;
const MAX_ROWS=1000;
const RESOURCE_KINDS=['contact','company','lead','deal','activity'] as const;
type ResourceKind=typeof RESOURCE_KINDS[number];

const previewSchema=z.object({
  filename:z.string().trim().min(1).max(240),
  content:z.string().min(1).max(MAX_BYTES),
  resourceKind:z.enum(RESOURCE_KINDS),
  sourceSystem:z.string().trim().min(2).max(120).default('CRM externo')
});
const importSchema=previewSchema.extend({
  datasetName:z.string().trim().min(2).max(120),
  humanConfirmed:z.literal(true)
});

type NormalizedCrmRecord={
  resourceKind:ResourceKind;
  externalId:string;
  name?:string|null;
  email?:string|null;
  phone?:string|null;
  companyName?:string|null;
  status?:string|null;
  stage?:string|null;
  rawStage?:string|null;
  amountMinor?:number|null;
  currency?:string|null;
  owner?:string|null;
  origin?:string|null;
  createdAt?:string|null;
  updatedAt?:string|null;
  expectedCloseAt?:string|null;
  activityType?:string|null;
  subject?:string|null;
  direction?:string|null;
  occurredAt?:string|null;
  partyEmail?:string|null;
  notesExcerpt?:string|null;
};

export async function registerCrmConnectRoutes(app:FastifyInstance){
  app.post('/v1/connect/crm/preview',async req=>{
    await workspaceContext(req,'command.read');
    const input=previewSchema.parse(req.body||{});
    const parsed=parseSpreadsheet(input.filename,input.content,true);
    const normalized=parsed.rows.slice(0,8).map((row,index)=>normalizeRecord(input.resourceKind,recordFromRow(parsed.normalizedHeaders,row),index));
    return{
      source:'external.crm',
      sourceSystem:input.sourceSystem,
      resourceKind:input.resourceKind,
      filename:input.filename,
      rows:parsed.rows.length,
      headers:parsed.headers,
      inferred:parsed.inferred,
      normalizedSample:normalized,
      mapping:buildMapping(input.resourceKind,parsed.normalizedHeaders),
      warnings:parsed.warnings,
      safety:{persisted:false,externalEffects:false,rawFileStored:false,rawRowsStored:false,normalizedOnly:true}
    };
  });

  app.post('/v1/connect/crm/import',async req=>{
    const ctx=await workspaceContext(req,'command.write');
    const input=importSchema.parse(req.body||{});
    const parsed=parseSpreadsheet(input.filename,input.content,false);
    if(!parsed.rows.length)throw new ApiError(400,'crm_import_empty','O arquivo não possui linhas válidas.');
    if(parsed.rows.length>MAX_ROWS)throw new ApiError(400,'crm_import_too_large',`O limite inicial é de ${MAX_ROWS} linhas por importação.`);

    const datasetId=randomUUID();
    const fingerprint=createHash('sha256').update(input.content).digest('hex');
    const result=await transaction(async client=>{
      let inserted=0,duplicates=0;
      for(let index=0;index<parsed.rows.length;index++){
        const normalized=normalizeRecord(input.resourceKind,recordFromRow(parsed.normalizedHeaders,parsed.rows[index]),index);
        const rowHash=createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
        const externalRef=createHash('sha256').update(`${input.sourceSystem}:${input.resourceKind}:${normalized.externalId}:${rowHash}`).digest('hex').slice(0,48);
        const exists=await client.query(
          `select 1 from business_events where workspace_id=$1 and source='external.crm' and correlation_id=$2 limit 1`,
          [ctx.workspaceId,externalRef]
        );
        if(exists.rowCount){duplicates++;continue}
        await client.query(
          `insert into business_events(id,workspace_id,type,source,subject_type,subject_id,payload,correlation_id,occurred_at)
           values($1,$2,$3,'external.crm','external_crm_dataset',$4,$5,$6,$7)`,
          [
            randomUUID(),ctx.workspaceId,`crm.${input.resourceKind}.observed`,datasetId,
            JSON.stringify({
              schemaVersion:'nex-connect-crm-v1',
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

    await auditLog(ctx,'nex_connect.crm_imported','external_dataset',datasetId,null,{
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
      externalEffect:false,
      migrationPerformed:false
    });

    return{
      source:'external.crm',
      sourceSystem:input.sourceSystem,
      resourceKind:input.resourceKind,
      datasetId,
      imported:result.inserted,
      duplicates:result.duplicates,
      total:parsed.rows.length,
      warnings:parsed.warnings,
      safety:{
        rawFileStored:false,
        rawRowsStored:false,
        externalEffects:false,
        automationsTriggered:false,
        normalizedOnly:true,
        migrationPerformed:false,
        workspaceScoped:true
      }
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
function externalId(record:Record<string,string>,index:number){
  return value(record,['id','contact_id','company_id','lead_id','deal_id','activity_id','codigo','code','referencia','ref'])||`row-${index+1}`;
}
function normalizeEmail(input:string){
  const text=String(input||'').trim().toLowerCase();
  return text.includes('@')?text:null;
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
function parseDate(input:string){
  const text=String(input||'').trim();if(!text)return null;
  const br=text.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if(br){
    const d=new Date(Date.UTC(+br[3],+br[2]-1,+br[1],+(br[4]||12),+(br[5]||0),+(br[6]||0)));
    return Number.isNaN(d.getTime())?null:d.toISOString();
  }
  const d=new Date(text);return Number.isNaN(d.getTime())?null:d.toISOString();
}
function normalizeStage(input:string){
  const raw=String(input||'').trim();
  const key=raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  if(/ganh|won|closed won|fechad.*ganh/.test(key))return'won';
  if(/perd|lost|closed lost|fechad.*perd/.test(key))return'lost';
  if(/propost|proposal|negoci/.test(key))return'proposal';
  if(/reun|meeting|demo|apresent/.test(key))return'meeting';
  if(/qualif|qualified|mql|sql/.test(key))return'qualified';
  if(/lead|novo|new|aberto|open/.test(key))return'lead';
  return raw?raw.slice(0,80):null;
}
function normalizeActivityType(input:string){
  const key=String(input||'').trim().toLowerCase();
  if(/email|e-mail/.test(key))return'email';
  if(/whats/.test(key))return'whatsapp';
  if(/call|ligac|telefone|phone/.test(key))return'call';
  if(/meeting|reun|demo|visit/.test(key))return'meeting';
  if(/task|tarefa/.test(key))return'task';
  if(/sms/.test(key))return'sms';
  if(/note|nota|observ/.test(key))return'note';
  return key.slice(0,60)||'activity';
}
function normalizeRecord(kind:ResourceKind,record:Record<string,string>,index:number):NormalizedCrmRecord{
  const id=externalId(record,index);
  const createdAt=parseDate(value(record,['created_at','created','criado_em','data_criacao','create_date']));
  const updatedAt=parseDate(value(record,['updated_at','updated','atualizado_em','data_atualizacao','last_modified_date']));
  const email=normalizeEmail(value(record,['email','e_mail','contact_email','lead_email','customer_email']));
  const name=value(record,['name','nome','contact_name','lead_name','company','empresa','company_name','title','titulo'])||null;
  const companyName=value(record,['company','empresa','company_name','organization','organisation','account_name'])||null;
  const origin=value(record,['source','origem','lead_source','origin','canal','channel'])||null;
  const owner=value(record,['owner','proprietario','responsavel','assigned_to','sales_rep','owner_name'])||null;
  const status=value(record,['status','situacao','state'])||null;

  if(kind==='contact'||kind==='company'||kind==='lead'){
    return{
      resourceKind:kind,externalId:id,name,email,
      phone:value(record,['phone','telefone','mobile','celular','whatsapp'])||null,
      companyName,
      status,
      stage:kind==='lead'?normalizeStage(value(record,['stage','etapa','status','lifecycle_stage','lead_stage'])):null,
      rawStage:kind==='lead'?value(record,['stage','etapa','status','lifecycle_stage','lead_stage'])||null:null,
      owner,origin,createdAt,updatedAt,
      notesExcerpt:value(record,['notes','note','observacao','observacoes','description','descricao']).slice(0,800)||null
    };
  }
  if(kind==='deal'){
    const rawStage=value(record,['stage','etapa','deal_stage','pipeline_stage','status']);
    return{
      resourceKind:kind,externalId:id,
      name:value(record,['deal_name','opportunity_name','title','titulo','name','nome'])||name,
      email:normalizeEmail(value(record,['email','contact_email','lead_email'])),
      partyEmail:normalizeEmail(value(record,['email','contact_email','lead_email'])),
      companyName,
      status,
      stage:normalizeStage(rawStage),
      rawStage:rawStage||null,
      amountMinor:parseMoneyMinor(value(record,['amount','valor','deal_value','value','total'])),
      currency:value(record,['currency','moeda'])||'BRL',
      owner,origin,createdAt,updatedAt,
      expectedCloseAt:parseDate(value(record,['expected_close_at','close_date','expected_close_date','data_fechamento','previsao_fechamento'])),
      notesExcerpt:value(record,['notes','note','observacao','description','descricao']).slice(0,800)||null
    };
  }
  const activityRaw=value(record,['activity_type','type','tipo','activity','kind']);
  return{
    resourceKind:kind,externalId:id,
    name:value(record,['subject','assunto','title','titulo','name','nome'])||'Atividade',
    email,
    partyEmail:email,
    companyName,
    status,
    activityType:normalizeActivityType(activityRaw),
    subject:value(record,['subject','assunto','title','titulo'])||null,
    direction:value(record,['direction','direcao','sent_received'])||null,
    occurredAt:parseDate(value(record,['occurred_at','activity_date','date','data','created_at','created']))||createdAt,
    owner,origin,createdAt,updatedAt,
    notesExcerpt:value(record,['notes','note','body','description','descricao','observacao']).slice(0,800)||null
  };
}
function buildMapping(kind:ResourceKind,headers:string[]){
  const groups:Record<ResourceKind,Record<string,string[]>>={
    contact:{name:['name','nome','contact_name'],email:['email','e_mail','contact_email'],phone:['phone','telefone','mobile','celular'],company:['company','empresa','company_name'],owner:['owner','proprietario','responsavel']},
    company:{name:['company','empresa','company_name','name','nome'],email:['email','e_mail'],phone:['phone','telefone'],owner:['owner','proprietario','responsavel'],status:['status','situacao']},
    lead:{name:['name','nome','lead_name'],email:['email','lead_email'],stage:['stage','etapa','lifecycle_stage','lead_stage'],source:['source','origem','lead_source'],owner:['owner','responsavel']},
    deal:{name:['deal_name','opportunity_name','title','titulo','name'],email:['email','contact_email'],stage:['stage','etapa','deal_stage','pipeline_stage'],amount:['amount','valor','deal_value','value'],close:['expected_close_at','close_date','data_fechamento']},
    activity:{subject:['subject','assunto','title','titulo'],email:['email','contact_email','lead_email'],type:['activity_type','type','tipo','activity'],date:['occurred_at','activity_date','date','data'],owner:['owner','responsavel']}
  };
  return Object.fromEntries(Object.entries(groups[kind]).map(([field,aliases])=>[field,aliases.find(alias=>headers.includes(alias))||null]));
}
