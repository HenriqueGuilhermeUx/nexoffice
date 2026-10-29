import {createHash,randomUUID} from 'node:crypto';
import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {ApiError,workspaceContext} from './auth.js';
import {auditLog} from './events.js';
import {transaction} from './db.js';

const MAX_EMAIL_BYTES=700_000;
const MAX_CALENDAR_BYTES=1_000_000;
const MAX_CALENDAR_EVENTS=500;

const fileSchema=z.object({
  filename:z.string().trim().min(1).max(240),
  content:z.string().min(1)
});
const importSchema=fileSchema.extend({
  datasetName:z.string().trim().min(2).max(120),
  humanConfirmed:z.literal(true)
});

export async function registerWorkspaceContextRoutes(app:FastifyInstance){
  app.post('/v1/connect/email/preview',async req=>{
    await workspaceContext(req,'command.read');
    const input=fileSchema.parse(req.body||{});
    if(Buffer.byteLength(input.content,'utf8')>MAX_EMAIL_BYTES)throw new ApiError(400,'email_file_too_large','O arquivo EML excede o limite desta primeira versão.');
    const parsed=parseEml(input.filename,input.content);
    return{
      source:'external.email',
      filename:input.filename,
      message:parsed.preview,
      warnings:parsed.warnings,
      safety:{persisted:false,rawFileStored:false,attachmentsStored:false,externalEffects:false}
    };
  });

  app.post('/v1/connect/email/import',async req=>{
    const ctx=await workspaceContext(req,'command.write');
    const input=importSchema.parse(req.body||{});
    if(Buffer.byteLength(input.content,'utf8')>MAX_EMAIL_BYTES)throw new ApiError(400,'email_file_too_large','O arquivo EML excede o limite desta primeira versão.');
    const parsed=parseEml(input.filename,input.content);
    const externalRef=parsed.externalRef;
    const datasetId=randomUUID();
    const occurredAt=parsed.occurredAt||new Date().toISOString();

    const result=await transaction(async client=>{
      const exists=await client.query(
        `select 1 from business_events where workspace_id=$1 and source='external.email' and correlation_id=$2 limit 1`,
        [ctx.workspaceId,externalRef]
      );
      if(exists.rowCount)return{inserted:0,duplicates:1};
      await client.query(
        `insert into business_events(id,workspace_id,type,source,subject_type,subject_id,payload,correlation_id,occurred_at)
         values($1,$2,'external_email.observed','external.email','external_message',$3,$4,$5,$6)`,
        [
          randomUUID(),ctx.workspaceId,datasetId,
          JSON.stringify({
            datasetId,datasetName:input.datasetName,filename:input.filename,
            messageIdHash:parsed.messageIdHash,
            subject:parsed.preview.subject,
            from:parsed.preview.from,
            to:parsed.preview.to,
            cc:parsed.preview.cc,
            occurredAt,
            excerpt:parsed.preview.excerpt,
            bodyHash:parsed.bodyHash,
            attachmentsStored:false,
            rawFileStored:false,
            schemaVersion:'nex-connect-email-v1'
          }),
          externalRef,occurredAt
        ]
      );
      return{inserted:1,duplicates:0};
    });

    await auditLog(ctx,'nex_connect.email_imported','external_dataset',datasetId,null,{
      datasetName:input.datasetName,filename:input.filename,inserted:result.inserted,duplicates:result.duplicates,
      rawFileStored:false,attachmentsStored:false,externalEffect:false
    });

    return{
      source:'external.email',datasetId,imported:result.inserted,duplicates:result.duplicates,
      message:parsed.preview,warnings:parsed.warnings,
      safety:{rawFileStored:false,attachmentsStored:false,externalEffects:false,automationsTriggered:false,businessEventsOnly:true,workspaceScoped:true}
    };
  });

  app.post('/v1/connect/calendar/preview',async req=>{
    await workspaceContext(req,'command.read');
    const input=fileSchema.parse(req.body||{});
    if(Buffer.byteLength(input.content,'utf8')>MAX_CALENDAR_BYTES)throw new ApiError(400,'calendar_file_too_large','O arquivo ICS excede o limite desta primeira versão.');
    const parsed=parseIcs(input.filename,input.content,true);
    return{
      source:'external.calendar',
      filename:input.filename,
      events:parsed.events.slice(0,10),
      count:parsed.events.length,
      warnings:parsed.warnings,
      safety:{persisted:false,rawFileStored:false,externalEffects:false}
    };
  });

  app.post('/v1/connect/calendar/import',async req=>{
    const ctx=await workspaceContext(req,'command.write');
    const input=importSchema.parse(req.body||{});
    if(Buffer.byteLength(input.content,'utf8')>MAX_CALENDAR_BYTES)throw new ApiError(400,'calendar_file_too_large','O arquivo ICS excede o limite desta primeira versão.');
    const parsed=parseIcs(input.filename,input.content,false);
    if(!parsed.events.length)throw new ApiError(400,'calendar_empty','Nenhum evento válido foi encontrado.');
    if(parsed.events.length>MAX_CALENDAR_EVENTS)throw new ApiError(400,'calendar_too_large',`O limite inicial é de ${MAX_CALENDAR_EVENTS} eventos por importação.`);

    const datasetId=randomUUID();
    const result=await transaction(async client=>{
      let inserted=0,duplicates=0;
      for(const item of parsed.events){
        const exists=await client.query(
          `select 1 from business_events where workspace_id=$1 and source='external.calendar' and correlation_id=$2 limit 1`,
          [ctx.workspaceId,item.externalRef]
        );
        if(exists.rowCount){duplicates++;continue}
        await client.query(
          `insert into business_events(id,workspace_id,type,source,subject_type,subject_id,payload,correlation_id,occurred_at)
           values($1,$2,'external_calendar.observed','external.calendar','external_calendar_event',$3,$4,$5,$6)`,
          [
            randomUUID(),ctx.workspaceId,item.externalRef,
            JSON.stringify({
              datasetId,datasetName:input.datasetName,filename:input.filename,
              uidHash:item.uidHash,summary:item.summary,startAt:item.startAt,endAt:item.endAt,
              organizer:item.organizer,attendees:item.attendees,location:item.location,
              descriptionExcerpt:item.descriptionExcerpt,
              rawFileStored:false,schemaVersion:'nex-connect-calendar-v1'
            }),
            item.externalRef,item.startAt
          ]
        );
        inserted++;
      }
      return{inserted,duplicates};
    });

    await auditLog(ctx,'nex_connect.calendar_imported','external_dataset',datasetId,null,{
      datasetName:input.datasetName,filename:input.filename,total:parsed.events.length,
      inserted:result.inserted,duplicates:result.duplicates,rawFileStored:false,externalEffect:false
    });

    return{
      source:'external.calendar',datasetId,imported:result.inserted,duplicates:result.duplicates,total:parsed.events.length,
      warnings:parsed.warnings,
      safety:{rawFileStored:false,externalEffects:false,automationsTriggered:false,businessEventsOnly:true,workspaceScoped:true}
    };
  });
}

function parseEml(filename:string,content:string){
  if(!filename.toLowerCase().endsWith('.eml'))throw new ApiError(400,'email_format_unsupported','Nesta primeira versão, envie arquivos .eml.');
  const normalized=content.replace(/\r\n/g,'\n');
  const split=normalized.split(/\n\n/);
  const rawHeaders=split.shift()||'';
  const body=split.join('\n\n');
  const headers=parseHeaders(rawHeaders);
  const subject=decodeSimple(headers.subject||'(sem assunto)').slice(0,300);
  const from=parseAddresses(headers.from||'');
  const to=parseAddresses(headers.to||'');
  const cc=parseAddresses(headers.cc||'');
  const date=headers.date?new Date(headers.date):null;
  const occurredAt=date&&!Number.isNaN(date.getTime())?date.toISOString():null;
  const messageId=String(headers['message-id']||'').trim();
  const messageIdHash=createHash('sha256').update(messageId||content).digest('hex').slice(0,48);
  const externalRef=createHash('sha256').update(`email:${messageIdHash}`).digest('hex').slice(0,48);
  const text=extractBodyText(body,headers['content-type']||'').slice(0,1400);
  const bodyHash=createHash('sha256').update(body).digest('hex').slice(0,48);
  const warnings:string[]=[];
  if(!headers.date)warnings.push('Mensagem sem cabeçalho Date; a importação usará o horário atual como observação.');
  if(!messageId)warnings.push('Mensagem sem Message-ID; a deduplicação usa hash do conteúdo.');
  return{
    preview:{subject,from,to,cc,occurredAt,excerpt:text},
    occurredAt,messageIdHash,externalRef,bodyHash,warnings
  };
}

function parseIcs(filename:string,content:string,preview:boolean){
  if(!filename.toLowerCase().endsWith('.ics'))throw new ApiError(400,'calendar_format_unsupported','Nesta primeira versão, envie arquivos .ics.');
  const unfolded=content.replace(/\r\n[ \t]/g,'').replace(/\n[ \t]/g,'');
  const blocks=[...unfolded.matchAll(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/gi)].map(match=>match[1]);
  const warnings:string[]=[];
  const events:any[]=[];
  for(const block of blocks.slice(0,preview?60:MAX_CALENDAR_EVENTS+1)){
    const lines=block.replace(/\r\n/g,'\n').split('\n').filter(Boolean);
    const fields: Record<string, string[]> = {};
    for(const line of lines){
      const idx=line.indexOf(':');if(idx<0)continue;
      const rawKey=line.slice(0,idx);const key=rawKey.split(';')[0].toUpperCase();
      (fields[key]??=[]).push(unescapeIcs(line.slice(idx+1)));
    }
    const summary=String(fields.SUMMARY?.[0]||'(sem título)').slice(0,300);
    const startAt=parseIcsDate(fields.DTSTART?.[0]||'');
    if(!startAt){warnings.push(`Evento "${summary}" ignorado por DTSTART inválido.`);continue}
    const endAt=parseIcsDate(fields.DTEND?.[0]||'');
    const uid=String(fields.UID?.[0]||'');
    const uidHash=createHash('sha256').update(uid||`${summary}|${startAt}|${fields.ORGANIZER?.[0]||''}`).digest('hex').slice(0,48);
    const externalRef=createHash('sha256').update(`calendar:${uidHash}`).digest('hex').slice(0,48);
    events.push({
      externalRef,uidHash,summary,startAt,endAt,
      organizer:parseAddresses((fields.ORGANIZER||[]).join(',')),
      attendees:(fields.ATTENDEE||[]).flatMap(parseAddresses).slice(0,30),
      location:String(fields.LOCATION?.[0]||'').slice(0,300)||null,
      descriptionExcerpt:String(fields.DESCRIPTION?.[0]||'').replace(/\s+/g,' ').trim().slice(0,800)||null
    });
  }
  return{events,warnings:warnings.slice(0,20)};
}

function parseHeaders(raw:string){
  const unfolded=raw.replace(/\n[ \t]+/g,' ');
  const out:Record<string,string>={};
  for(const line of unfolded.split('\n')){
    const idx=line.indexOf(':');if(idx<1)continue;
    out[line.slice(0,idx).trim().toLowerCase()]=line.slice(idx+1).trim();
  }
  return out;
}
function parseAddresses(value:string){
  return value.split(',').map(part=>{
    const match=part.match(/<([^>]+)>/);return String(match?.[1]||part).replace(/^mailto:/i,'').trim().toLowerCase();
  }).filter(item=>item&&item.includes('@')).slice(0,30);
}
function decodeSimple(value:string){return value.replace(/=\?UTF-8\?Q\?([^?]+)\?=/gi,(_,x)=>String(x).replace(/_/g,' ').replace(/=([0-9A-F]{2})/gi,(__,hex)=>String.fromCharCode(parseInt(hex,16))))}
function extractBodyText(body:string,contentType:string){
  let text=body;
  if(/text\/html/i.test(contentType)||/<html|<body|<div|<p[ >]/i.test(body))text=body.replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<[^>]+>/g,' ');
  return text.replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/=\r?\n/g,'').replace(/\s+/g,' ').trim();
}
function unescapeIcs(value:string){return value.replace(/\\n/gi,'\n').replace(/\\,/g,',').replace(/\\;/g,';').replace(/\\\\/g,'\\').trim()}
function parseIcsDate(value:string){
  const v=String(value||'').trim();if(!v)return null;
  const z=v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if(z)return new Date(Date.UTC(+z[1],+z[2]-1,+z[3],+z[4],+z[5],+z[6])).toISOString();
  const local=v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?$/);
  if(local)return new Date(Date.UTC(+local[1],+local[2]-1,+local[3],+(local[4]||12),+(local[5]||0),+(local[6]||0))).toISOString();
  const d=new Date(v);return Number.isNaN(d.getTime())?null:d.toISOString();
}
