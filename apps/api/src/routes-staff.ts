import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {workspaceContext,ApiError} from './auth.js';
import {query} from './db.js';
import {financeSummary} from './events.js';
import {callStaffBusiness} from './integration-runtime.js';
import {recordExternalUsage} from './usage-meter.js';

const uuid=z.string().uuid();
const roles=['secretary','service','crm','erp','collections','controller','documents','growth'] as const;

export async function registerStaffRoutes(app:FastifyInstance){
  app.post('/v1/assistant/staff',async req=>{
    const ctx=await workspaceContext(req,'command.read');
    if(String(process.env.NEXOFFICE_STAFF_BRIDGE_ENABLED||'false')!=='true')throw new ApiError(409,'staff_bridge_disabled','Staff Business ainda não foi habilitado neste ambiente.');
    if(!process.env.STAFF_BASE_URL||!process.env.STAFF_API_KEY)throw new ApiError(409,'staff_not_configured','Configure o bridge de serviço do Staff antes de usar esta engine.');

    const input=z.object({
      message:z.string().min(1).max(8000),
      conversationId:uuid.optional().nullable(),
      agentRole:z.enum(roles).optional().nullable()
    }).parse(req.body);

    let conversationId=input.conversationId||null;
    if(conversationId){
      const found=(await query<any>(`select id from assistant_conversations where id=$1 and workspace_id=$2 and user_id=$3`,[conversationId,ctx.workspaceId,ctx.user.id]))[0];
      if(!found)throw new ApiError(404,'not_found','Conversa não encontrada.');
    }else{
      const title=`Staff · ${input.message.trim().slice(0,62)}${input.message.trim().length>62?'…':''}`;
      const row=(await query<any>(`insert into assistant_conversations(workspace_id,user_id,agent_role,title,metadata) values($1,$2,$3,$4,$5) returning id`,[ctx.workspaceId,ctx.user.id,input.agentRole||null,title,JSON.stringify({engine:'staff',privacyMode:'workspace_context_only'})]))[0];
      conversationId=row.id;
    }

    await query(`insert into assistant_messages(workspace_id,conversation_id,user_id,role,agent_role,content,metadata) values($1,$2,$3,'user',$4,$5,$6)`,[ctx.workspaceId,conversationId,ctx.user.id,input.agentRole||null,input.message.trim(),JSON.stringify({engine:'staff'})]);

    const [finance,crm,agenda,tasks,documents,command,priorities,historyRows]=await Promise.all([
      financeSummary(ctx.workspaceId),
      query<any>(`select count(*) filter(where stage not in ('won','lost'))::int open_deals,coalesce(sum(value_minor) filter(where stage not in ('won','lost')),0)::bigint open_pipeline_minor,count(*) filter(where stage='lead')::int leads,count(*) filter(where stage='proposal')::int proposals from crm_deals where workspace_id=$1`,[ctx.workspaceId]),
      query<any>(`select count(*)::int today,count(*) filter(where starts_at>=now() and starts_at<now()+interval '7 days' and status<>'cancelled')::int next_7_days from appointments where workspace_id=$1`,[ctx.workspaceId]),
      query<any>(`select count(*) filter(where status in ('todo','doing'))::int open,count(*) filter(where status in ('todo','doing') and due_at<=now()+interval '24 hours')::int due_24h from tasks where workspace_id=$1`,[ctx.workspaceId]),
      query<any>(`select count(*)::int total,count(*) filter(where signature_status not in ('not_requested','signed','completed'))::int signatures_pending,count(*) filter(where intelligence_status in ('queued','processing','error'))::int analysis_attention from document_refs where workspace_id=$1`,[ctx.workspaceId]),
      query<any>(`select count(*) filter(where status in ('open','approved','executing'))::int open_actions,count(*) filter(where approval_id is not null and status='open')::int approval_attention from command_actions where workspace_id=$1`,[ctx.workspaceId]),
      query<any>(`select title,summary,priority,agent_role from command_actions where workspace_id=$1 and status in ('open','approved','executing') order by case priority when 'critical' then 1 when 'high' then 2 else 3 end,created_at desc limit 8`,[ctx.workspaceId]),
      query<any>(`select role,content from assistant_messages where conversation_id=$1 order by created_at desc limit 13`,[conversationId])
    ]);

    const history=historyRows.reverse().map((row:any)=>({role:row.role==='assistant'?'assistant':'user',content:String(row.content||'')}));
    if(history.length&&history[history.length-1].role==='user'&&history[history.length-1].content===input.message.trim())history.pop();

    const pulse={finance,crm:crm[0]||{},agenda:agenda[0]||{},tasks:tasks[0]||{},documents:documents[0]||{},command:command[0]||{}};
    const correlationId=`staff:${conversationId}:${Date.now()}`;
    const result=await callStaffBusiness(ctx.workspaceId,{
      message:input.message.trim(),
      agentRole:input.agentRole||'controller',
      conversationHistory:history,
      context:{workspace:{id:ctx.workspaceId,name:ctx.workspaceName},pulse,priorities},
      correlationId
    });

    if(!result.ok)throw new ApiError(result.httpStatus===401?502:503,'staff_unavailable',String(result.error||'Staff Business indisponível.'));
    const payload=result.payload as any;
    const text=String(payload?.response||'').trim();
    if(!text)throw new ApiError(502,'staff_empty_response','Staff retornou uma resposta vazia.');

    const saved=(await query<any>(`insert into assistant_messages(workspace_id,conversation_id,role,agent_role,content,metadata) values($1,$2,'assistant',$3,$4,$5) returning *`,[ctx.workspaceId,conversationId,input.agentRole||payload?.agentRole||'controller',text,JSON.stringify({engine:'staff',privacyMode:'workspace_context_only',personalMemoryAccess:false,correlationId,usage:payload?.usage||null})]))[0];
    await query(`update assistant_conversations set agent_role=coalesce(agent_role,$2),metadata=metadata||$3::jsonb,updated_at=now() where id=$1`,[conversationId,input.agentRole||payload?.agentRole||'controller',JSON.stringify({engine:'staff',privacyMode:'workspace_context_only'})]);
    await recordExternalUsage(ctx.workspaceId,'staff.assistant.action',{correlationId},result);

    return {conversationId,message:saved,agentRole:input.agentRole||payload?.agentRole||'controller',engine:'staff',privacyMode:'workspace_context_only',personalMemoryAccess:false};
  });
}
