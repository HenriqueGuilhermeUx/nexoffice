import type {FastifyInstance} from 'fastify';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {workspaceContext} from './auth.js';
import {query,transaction} from './db.js';
import {auditLog} from './events.js';

function firstName(value:string){return String(value||'').trim().split(/\s+/)[0]||'Olá'}
function dateTimePt(value:string){return new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(value))}
function key(parts:Array<string|number|null|undefined>){return createHash('sha256').update(parts.map(x=>String(x??'')).join('|')).digest('hex').slice(0,40)}

async function existingAction(workspaceId:string,automationKey:string){return (await query<any>(`select id,status,approval_id from command_actions where workspace_id=$1 and metadata->>'automationKey'=$2 limit 1`,[workspaceId,automationKey]))[0]||null}

async function createOutboundApproval(input:{workspaceId:string;agentRole:'secretary'|'crm';title:string;summary:string;subjectType:string;subjectId:string;automationKey:string;recipient:string;contactName:string;message:string;actionType:string;metadata?:Record<string,unknown>}){
  const found=await existingAction(input.workspaceId,input.automationKey);if(found)return {created:false,action:found};
  return transaction(async client=>{
    const approval=(await client.query(`insert into approval_requests(workspace_id,action_type,title,description,status,requested_by_agent,subject_type,subject_id,proposed_payload) values($1,$2,$3,$4,'pending',$5,$6,$7,$8) returning id,status`,[input.workspaceId,input.actionType,input.title,input.summary,input.agentRole,input.subjectType,input.subjectId,JSON.stringify({channel:'whatsapp',recipient:input.recipient,contactName:input.contactName,message:input.message})])).rows[0];
    const primary={type:input.actionType,payload:{channel:'whatsapp',recipient:input.recipient,contactName:input.contactName,message:input.message,...input.metadata}};
    const action=(await client.query(`insert into command_actions(workspace_id,agent_role,title,summary,priority,status,autonomy,approval_id,subject_type,subject_id,primary_action,secondary_actions,metadata) values($1,$2,$3,$4,'high','open','approval_required',$5,$6,$7,$8,'[]'::jsonb,$9) returning *`,[input.workspaceId,input.agentRole,input.title,input.summary,approval.id,input.subjectType,input.subjectId,JSON.stringify(primary),JSON.stringify({source:'proactive_automation',automationKey:input.automationKey,channel:'whatsapp',humanApprovalRequired:true})])).rows[0];
    return {created:true,action};
  });
}

async function createInternalReview(input:{workspaceId:string;agentRole:'secretary'|'crm';title:string;summary:string;subjectType:string;subjectId:string;automationKey:string;metadata?:Record<string,unknown>}){
  const found=await existingAction(input.workspaceId,input.automationKey);if(found)return {created:false,action:found};
  const rows=await query<any>(`insert into command_actions(workspace_id,agent_role,title,summary,priority,status,autonomy,subject_type,subject_id,primary_action,secondary_actions,metadata) values($1,$2,$3,$4,'normal','open','notify',$5,$6,$7,'[]'::jsonb,$8) returning *`,[input.workspaceId,input.agentRole,input.title,input.summary,input.subjectType,input.subjectId,JSON.stringify({type:'operational.review',payload:{...input.metadata}}),JSON.stringify({source:'proactive_automation',automationKey:input.automationKey,internalOnly:true})]);
  return {created:true,action:rows[0]};
}

export async function registerAutomationRoutes(app:FastifyInstance){
  app.get('/v1/automations/overview',async req=>{
    const ctx=await workspaceContext(req,'command.read');
    const [appointments,staleDeals,actions]=await Promise.all([
      query<any>(`select count(*)::int n from appointments a join crm_contacts c on c.id=a.contact_id where a.workspace_id=$1 and a.status='scheduled' and a.starts_at between now()+interval '2 hours' and now()+interval '30 hours'`,[ctx.workspaceId]),
      query<any>(`select count(*)::int n from crm_deals d where d.workspace_id=$1 and d.stage not in ('won','lost') and d.updated_at<now()-interval '2 days'`,[ctx.workspaceId]),
      query<any>(`select count(*)::int n from command_actions where workspace_id=$1 and metadata->>'source'='proactive_automation' and status not in ('done','dismissed','rejected')`,[ctx.workspaceId])
    ]);
    return {appointmentConfirmationsDue:appointments[0]?.n||0,staleDeals:staleDeals[0]?.n||0,openAutomationActions:actions[0]?.n||0,firstOutboundRequiresHumanApproval:true};
  });

  app.post('/v1/automations/scan',async req=>{
    const ctx=await workspaceContext(req,'command.manage');
    const input=z.object({appointments:z.boolean().default(true),crm:z.boolean().default(true),maxPerType:z.number().int().min(1).max(100).default(30)}).parse(req.body||{});
    const stats={appointmentCandidates:0,crmCandidates:0,created:0,reused:0,outboundApprovals:0,internalReviews:0};

    if(input.appointments){
      const appointments=await query<any>(`select a.id,a.title,a.starts_at,a.status,c.id contact_id,c.name contact_name,c.phone,c.email from appointments a join crm_contacts c on c.id=a.contact_id where a.workspace_id=$1 and a.status='scheduled' and a.starts_at between now()+interval '2 hours' and now()+interval '30 hours' order by a.starts_at limit $2`,[ctx.workspaceId,input.maxPerType]);
      stats.appointmentCandidates=appointments.length;
      for(const item of appointments){
        const automationKey=`appointment-confirm:${item.id}:${new Date(item.starts_at).toISOString().slice(0,13)}`;
        if(item.phone){
          const message=`Olá, ${firstName(item.contact_name)}! Passando para confirmar ${item.title} em ${dateTimePt(item.starts_at)}. Pode confirmar por aqui?`;
          const result=await createOutboundApproval({workspaceId:ctx.workspaceId,agentRole:'secretary',title:`Confirmar: ${item.title}`,summary:`A Secretária preparou uma confirmação para ${item.contact_name} antes do compromisso de ${dateTimePt(item.starts_at)}.`,subjectType:'appointment',subjectId:item.id,automationKey,recipient:item.phone,contactName:item.contact_name,message,actionType:'message.send.appointment_confirmation',metadata:{appointmentId:item.id}});
          result.created?(stats.created++,stats.outboundApprovals++):stats.reused++;
        }else{
          const result=await createInternalReview({workspaceId:ctx.workspaceId,agentRole:'secretary',title:`Confirmar compromisso: ${item.contact_name}`,summary:`${item.title} acontece em ${dateTimePt(item.starts_at)}, mas o contato não possui WhatsApp/telefone no CRM.`,subjectType:'appointment',subjectId:item.id,automationKey,metadata:{appointmentId:item.id,target:'agenda'}});
          result.created?(stats.created++,stats.internalReviews++):stats.reused++;
        }
      }
    }

    if(input.crm){
      const deals=await query<any>(`select d.id,d.title,d.stage,d.value_minor,d.updated_at,d.next_action,c.id contact_id,c.name contact_name,c.phone,c.email,(select max(a.occurred_at) from crm_activities a where a.workspace_id=d.workspace_id and a.deal_id=d.id) last_activity from crm_deals d left join crm_contacts c on c.id=d.contact_id where d.workspace_id=$1 and d.stage not in ('won','lost') and greatest(d.updated_at,coalesce((select max(a2.occurred_at) from crm_activities a2 where a2.workspace_id=d.workspace_id and a2.deal_id=d.id),d.created_at)) < now() - case when d.stage in ('proposal','meeting') then interval '3 days' else interval '2 days' end order by d.value_minor desc,d.updated_at asc limit $2`,[ctx.workspaceId,input.maxPerType]);
      stats.crmCandidates=deals.length;
      for(const deal of deals){
        const staleDay=new Date(deal.last_activity||deal.updated_at).toISOString().slice(0,10);
        const automationKey=`crm-followup:${deal.id}:${staleDay}`;
        if(deal.phone){
          const message=deal.stage==='proposal'
            ?`Olá, ${firstName(deal.contact_name)}! Passando para saber se conseguiu avaliar ${deal.title}. Se fizer sentido, posso esclarecer os pontos e alinhar o próximo passo.`
            :`Olá, ${firstName(deal.contact_name)}! Retomando nosso contato sobre ${deal.title}. Posso ajudar com alguma dúvida ou avançamos para o próximo passo?`;
          const result=await createOutboundApproval({workspaceId:ctx.workspaceId,agentRole:'crm',title:`Follow-up: ${deal.title}`,summary:`A oportunidade de ${deal.contact_name||'CRM'} está sem atividade recente. O CRM Agent preparou uma retomada por WhatsApp.`,subjectType:'crm_deal',subjectId:deal.id,automationKey,recipient:deal.phone,contactName:deal.contact_name||'',message,actionType:'message.send.crm_followup',metadata:{dealId:deal.id,stage:deal.stage}});
          result.created?(stats.created++,stats.outboundApprovals++):stats.reused++;
        }else{
          const result=await createInternalReview({workspaceId:ctx.workspaceId,agentRole:'crm',title:`Retomar oportunidade: ${deal.title}`,summary:`Oportunidade sem atividade recente${deal.contact_name?` com ${deal.contact_name}`:''}. ${deal.email?'Há e-mail cadastrado, mas o bridge outbound atual está restrito ao WhatsApp.':'Não há telefone disponível no CRM.'}`,subjectType:'crm_deal',subjectId:deal.id,automationKey,metadata:{dealId:deal.id,stage:deal.stage,target:'crm'}});
          result.created?(stats.created++,stats.internalReviews++):stats.reused++;
        }
      }
    }

    await auditLog(ctx,'automation.scan','workspace',ctx.workspaceId,null,stats,{firstOutboundRequiresHumanApproval:true});
    return {ok:true,...stats,firstOutboundRequiresHumanApproval:true};
  });
}
