import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {ApiError,workspaceContext} from './auth.js';
import {query,transaction} from './db.js';
import {auditLog} from './events.js';

const inputSchema=z.object({contactId:z.string().uuid(),message:z.string().trim().min(1).max(2000),channel:z.literal('whatsapp').default('whatsapp')}).strict();
const digits=(value:unknown)=>String(value||'').replace(/\D/g,'');

export async function registerRevenueRoutes(app:FastifyInstance){
  app.post('/v1/revenue/followups',async req=>{
    const ctx=await workspaceContext(req,'command.decide');
    const input=inputSchema.parse(req.body);
    const contact=(await query<any>(`select id,name,phone,company_name from crm_contacts where workspace_id=$1 and id=$2 limit 1`,[ctx.workspaceId,input.contactId]))[0];
    if(!contact)throw new ApiError(404,'contact_not_found','Contato não encontrado neste workspace.');
    const recipient=digits(contact.phone);
    if(recipient.length<10)throw new ApiError(400,'contact_whatsapp_required','Este contato não possui um WhatsApp válido no CRM.');
    const title=`Follow-up com ${contact.name}`;
    const summary=`Mensagem comercial preparada para ${contact.name}.`;
    const payload={channel:'whatsapp',recipient,contactName:contact.name,message:input.message,contactId:contact.id};
    const created=await transaction(async client=>{
      const approval=await client.query<any>(`insert into approval_requests(workspace_id,action_type,title,description,status,requested_by_agent,subject_type,subject_id,proposed_payload) values($1,'message.send',$2,$3,'pending','crm','crm_contact',$4,$5) returning *`,[ctx.workspaceId,title,summary,contact.id,JSON.stringify(payload)]);
      const action=await client.query<any>(`insert into command_actions(workspace_id,agent_role,title,summary,priority,status,autonomy,approval_id,subject_type,subject_id,primary_action,secondary_actions,metadata) values($1,'crm',$2,$3,'high','open','approval_required',$4,'crm_contact',$5,$6,$7,$8) returning *`,[ctx.workspaceId,title,summary,approval.rows[0].id,contact.id,JSON.stringify({type:'message.send',payload}),JSON.stringify([]),JSON.stringify({source:'revenue-center',provider:'smartbots',humanApprovalRequired:true})]);
      return {approval:approval.rows[0],action:action.rows[0]};
    });
    await auditLog(ctx,'revenue.followup.prepared','command_action',created.action.id,null,{contactId:contact.id,provider:'smartbots',channel:'whatsapp',approvalId:created.approval.id,externalEffect:false},{humanApprovalRequired:true,workspaceScoped:true});
    return {status:'pending_approval',provider:'smartbots',contact:{id:contact.id,name:contact.name,companyName:contact.company_name||null},action:created.action,approval:{id:created.approval.id,status:created.approval.status},governance:{humanApprovalRequired:true,externalActionsEnabled:String(process.env.NEXOFFICE_EXTERNAL_ACTIONS||'false').toLowerCase()==='true'}};
  });
}
