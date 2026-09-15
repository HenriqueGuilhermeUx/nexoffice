import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {ApiError,workspaceContext} from './auth.js';
import {query} from './db.js';
import {auditLog,emitBusinessEvent} from './events.js';

const uuid=z.string().uuid();

export async function registerCollectionsRoutes(app:FastifyInstance){
  app.get('/v1/collections/overview',async req=>{
    const ctx=await workspaceContext(req,'finance.read');
    const [summary,rows,attempts]=await Promise.all([
      query<any>(`select count(*) filter(where status='overdue' or (status='open' and due_at<now()))::int overdue_count,coalesce(sum(amount_minor) filter(where direction='income' and (status='overdue' or (status='open' and due_at<now()))),0)::bigint overdue_minor from ledger_entries where workspace_id=$1`,[ctx.workspaceId]),
      query<any>(`select l.id,l.description,l.amount_minor,l.due_at,l.status,l.contact_id,c.name contact_name,c.email,c.phone,greatest(0,floor(extract(epoch from (now()-l.due_at))/86400))::int days_overdue from ledger_entries l left join crm_contacts c on c.id=l.contact_id where l.workspace_id=$1 and l.direction='income' and l.status in ('open','overdue') and l.due_at<now() order by l.due_at asc limit 200`,[ctx.workspaceId]),
      query<any>(`select status,count(*)::int count from collection_attempts where workspace_id=$1 and created_at>=date_trunc('month',now()) group by status`,[ctx.workspaceId])
    ]);
    return {summary:summary[0],receivables:rows,attempts};
  });

  app.get('/v1/collections/rules',async req=>{const ctx=await workspaceContext(req,'finance.read');return query<any>(`select * from collection_rules where workspace_id=$1 order by created_at`,[ctx.workspaceId])});

  app.put('/v1/collections/rules/:id',async req=>{
    const ctx=await workspaceContext(req,'finance.write'),id=uuid.parse((req.params as any).id);
    const input=z.object({name:z.string().min(1).optional(),active:z.boolean().optional(),daysAfterDue:z.array(z.number().int().min(0).max(365)).min(1).optional(),channels:z.array(z.enum(['whatsapp','email','sms'])).min(1).optional(),requireApproval:z.boolean().optional(),messageTemplate:z.string().min(10).max(2000).optional()}).parse(req.body);
    const before=(await query<any>(`select * from collection_rules where id=$1 and workspace_id=$2`,[id,ctx.workspaceId]))[0];if(!before)throw new ApiError(404,'not_found','Régua de cobrança não encontrada.');
    const rows=await query<any>(`update collection_rules set name=$3,active=$4,days_after_due=$5,channels=$6,require_approval=$7,message_template=$8,updated_at=now() where id=$1 and workspace_id=$2 returning *`,[id,ctx.workspaceId,input.name??before.name,input.active??before.active,input.daysAfterDue??before.days_after_due,input.channels??before.channels,input.requireApproval??before.require_approval,input.messageTemplate??before.message_template]);
    await auditLog(ctx,'collections.rule.updated','collection_rule',id,before,rows[0]);return rows[0];
  });

  app.post('/v1/collections/scan',async req=>{
    const ctx=await workspaceContext(req,'finance.write');
    await query(`update ledger_entries set status='overdue',updated_at=now() where workspace_id=$1 and direction='income' and status='open' and due_at<now()`,[ctx.workspaceId]);
    const rules=await query<any>(`select * from collection_rules where workspace_id=$1 and active=true order by created_at limit 10`,[ctx.workspaceId]);
    const receivables=await query<any>(`select l.*,c.name contact_name,c.email contact_email,c.phone contact_phone,greatest(0,floor(extract(epoch from (now()-l.due_at))/86400))::int days_overdue from ledger_entries l left join crm_contacts c on c.id=l.contact_id where l.workspace_id=$1 and l.direction='income' and l.status='overdue' and l.due_at is not null order by l.due_at asc limit 100`,[ctx.workspaceId]);
    let created=0;const queued:any[]=[];
    for(const ledger of receivables){
      const rule=rules[0];if(!rule)break;
      const eligible=(rule.days_after_due||[]).map(Number).filter((d:number)=>d<=Number(ledger.days_overdue)).sort((a:number,b:number)=>b-a);
      if(!eligible.length)continue;
      const step=eligible[0];
      for(const channel of (rule.channels||[])){
        if(channel==='whatsapp'&&!ledger.contact_phone)continue;
        if(channel==='email'&&!ledger.contact_email)continue;
        const existing=(await query<any>(`select id from collection_attempts where workspace_id=$1 and ledger_entry_id=$2 and step_day=$3 and channel=$4`,[ctx.workspaceId,ledger.id,step,channel]))[0];if(existing)continue;
        const message=renderTemplate(rule.message_template,{name:ledger.contact_name||'cliente',amount:money(ledger.amount_minor),due_date:datePt(ledger.due_at),description:ledger.description});
        const emitted=await emitBusinessEvent(ctx.workspaceId,'collection.reminder.send','nexoffice.collections','ledger_entry',ledger.id,{ledgerEntryId:ledger.id,contactId:ledger.contact_id,channel,recipient:channel==='email'?ledger.contact_email:ledger.contact_phone,contactName:ledger.contact_name,amountMinor:Number(ledger.amount_minor),dueAt:String(ledger.due_at),description:ledger.description,message,stepDay:step,requireApproval:Boolean(rule.require_approval)});
        const actionId=(emitted.action as any)?.id||null;
        const attempt=(await query<any>(`insert into collection_attempts(workspace_id,ledger_entry_id,rule_id,step_day,channel,status,command_action_id,metadata) values($1,$2,$3,$4,$5,'planned',$6,$7) returning *`,[ctx.workspaceId,ledger.id,rule.id,step,channel,actionId,JSON.stringify({message,daysOverdue:Number(ledger.days_overdue)})]))[0];
        created++;queued.push(attempt);
      }
    }
    await auditLog(ctx,'collections.scan','workspace',ctx.workspaceId,null,{created,receivables:receivables.length});return {created,receivablesScanned:receivables.length,attempts:queued};
  });

  app.post('/v1/collections/ledger/:id/create-charge',async req=>{
    const ctx=await workspaceContext(req,'finance.write'),id=uuid.parse((req.params as any).id);
    const ledger=(await query<any>(`select l.*,c.name contact_name,c.email contact_email,c.phone contact_phone,c.document_number from ledger_entries l left join crm_contacts c on c.id=l.contact_id where l.id=$1 and l.workspace_id=$2 and l.direction='income'`,[id,ctx.workspaceId]))[0];
    if(!ledger)throw new ApiError(404,'not_found','Recebível não encontrado.');if(ledger.status==='paid')throw new ApiError(409,'already_paid','Este recebível já foi pago.');
    return emitBusinessEvent(ctx.workspaceId,'payment.charge.create','nexoffice.collections','ledger_entry',id,{ledgerEntryId:id,amountMinor:Number(ledger.amount_minor),currency:ledger.currency,description:ledger.description,dueAt:ledger.due_at,customer:{name:ledger.contact_name,email:ledger.contact_email,phone:ledger.contact_phone,taxID:ledger.document_number}});
  });

  app.get('/v1/collections/attempts',async req=>{const ctx=await workspaceContext(req,'finance.read');return query<any>(`select a.*,l.description,l.amount_minor,l.due_at,c.name contact_name from collection_attempts a join ledger_entries l on l.id=a.ledger_entry_id left join crm_contacts c on c.id=l.contact_id where a.workspace_id=$1 order by a.created_at desc limit 500`,[ctx.workspaceId])});
}

function renderTemplate(template:string,data:Record<string,string>){return String(template||'').replace(/{{\s*([a-z_]+)\s*}}/gi,(_m,key)=>data[key]||'')}
function money(value:any){return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value||0)/100)}
function datePt(value:any){return new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(value))}
