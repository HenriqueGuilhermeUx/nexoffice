import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {query,transaction} from './db.js';
import {ApiError,workspaceContext} from './auth.js';
import {CAPABILITIES,dispatchOutbox,probeProvider,providerCatalog,routeForAction,type Provider} from './integration-runtime.js';

const uuid=z.string().uuid();

export async function registerRuntimeRoutes(app:FastifyInstance){
  // Document references keep NexOffice horizontal: raw files/content remain in the owning engine.
  app.get('/v1/documents',async req=>{
    const ctx=await workspaceContext(req,'documents.read');
    const contactId=String((req.query as any)?.contactId||'');
    return query<any>(`select d.*,c.name contact_name from document_refs d left join crm_contacts c on c.id=d.contact_id where d.workspace_id=$1 and ($2='' or d.contact_id::text=$2) order by d.updated_at desc limit 500`,[ctx.workspaceId,contactId]);
  });
  app.post('/v1/documents',async req=>{
    const ctx=await workspaceContext(req,'documents.write');
    const input=z.object({contactId:uuid.optional().nullable(),provider:z.string().default('docwallet'),externalRef:z.string().min(1),title:z.string().min(1),status:z.string().default('draft'),documentType:z.string().optional().nullable(),metadata:z.record(z.string(),z.unknown()).default({})}).parse(req.body);
    const rows=await query<any>(`insert into document_refs(workspace_id,contact_id,provider,external_ref,title,status,document_type,metadata) values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(workspace_id,provider,external_ref) do update set contact_id=excluded.contact_id,title=excluded.title,status=excluded.status,document_type=excluded.document_type,metadata=excluded.metadata,updated_at=now() returning *`,[ctx.workspaceId,input.contactId||null,input.provider,input.externalRef,input.title,input.status,input.documentType||null,JSON.stringify(input.metadata)]);
    await log(ctx.workspaceId,ctx.user.id,'document.ref.upserted','document_ref',rows[0].id,null,rows[0]);return rows[0];
  });
  app.patch('/v1/documents/:id',async req=>{
    const ctx=await workspaceContext(req,'documents.write');const id=uuid.parse((req.params as any).id);
    const input=z.object({contactId:uuid.optional().nullable(),title:z.string().min(1).optional(),status:z.string().optional(),documentType:z.string().optional().nullable(),metadata:z.record(z.string(),z.unknown()).optional()}).parse(req.body);
    const before=(await query<any>(`select * from document_refs where id=$1 and workspace_id=$2`,[id,ctx.workspaceId]))[0];if(!before)throw new ApiError(404,'not_found','Documento não encontrado.');
    const rows=await query<any>(`update document_refs set contact_id=$3,title=$4,status=$5,document_type=$6,metadata=$7,updated_at=now() where id=$1 and workspace_id=$2 returning *`,[id,ctx.workspaceId,input.contactId===undefined?before.contact_id:input.contactId,input.title??before.title,input.status??before.status,input.documentType===undefined?before.document_type:input.documentType,JSON.stringify(input.metadata??before.metadata)]);
    await log(ctx.workspaceId,ctx.user.id,'document.ref.updated','document_ref',id,before,rows[0]);return rows[0];
  });

  app.get('/v1/integrations/catalog',async req=>{
    const ctx=await workspaceContext(req,'integrations.read');
    const states=await query<any>(`select provider,status,capabilities,last_health_at,last_health_status,last_error from integrations where workspace_id=$1`,[ctx.workspaceId]);
    return providerCatalog().map(c=>({...c,state:states.find(x=>x.provider===c.provider)||null}));
  });
  app.post('/v1/integrations/:provider/probe',async req=>{
    const ctx=await workspaceContext(req,'integrations.manage');const provider=String((req.params as any).provider) as Provider;
    if(!(provider in CAPABILITIES))throw new ApiError(400,'invalid_provider','Provider desconhecido.');
    return probeProvider(ctx.workspaceId,provider);
  });

  // Approved action execution is idempotent. External effects enter the outbox; they never run twice.
  app.post('/v1/command/actions/:id/execute',async req=>{
    const ctx=await workspaceContext(req,'command.decide');const id=uuid.parse((req.params as any).id);
    const action=(await query<any>(`select a.*,p.status approval_status from command_actions a left join approval_requests p on p.id=a.approval_id where a.id=$1 and a.workspace_id=$2`,[id,ctx.workspaceId]))[0];
    if(!action)throw new ApiError(404,'not_found','Ação não encontrada.');
    if(action.autonomy==='approval_required'&&action.approval_status!=='approved'&&action.status!=='approved')throw new ApiError(409,'approval_required','A ação precisa ser aprovada antes da execução.');
    const executionKey=`command:${id}`;
    const existing=(await query<any>(`select * from agent_runs where workspace_id=$1 and execution_key=$2 limit 1`,[ctx.workspaceId,executionKey]))[0];
    if(existing)return {reused:true,run:existing};
    const primary=action.primary_action||{};const actionType=String(primary.type||'');const topic=routeForAction(actionType);
    const result=await transaction(async client=>{
      const run=(await client.query(`insert into agent_runs(workspace_id,agent_role,action_id,status,input,execution_key,started_at) values($1,$2,$3,'running',$4,$5,now()) returning *`,[ctx.workspaceId,action.agent_role,id,JSON.stringify(primary),executionKey])).rows[0];
      if(topic){
        await client.query(`insert into outbox_messages(workspace_id,topic,payload) values($1,$2,$3)`,[ctx.workspaceId,topic,JSON.stringify({...primary.payload,correlationId:executionKey,commandActionId:id})]);
        await client.query(`update agent_runs set status='queued_external',output=$3,finished_at=now() where id=$1 and workspace_id=$2`,[run.id,ctx.workspaceId,JSON.stringify({topic})]);
        await client.query(`update command_actions set status='executing',updated_at=now() where id=$1 and workspace_id=$2`,[id,ctx.workspaceId]);
        return {...run,status:'queued_external',output:{topic}};
      }
      await client.query(`update agent_runs set status='succeeded',output=$3,finished_at=now() where id=$1 and workspace_id=$2`,[run.id,ctx.workspaceId,JSON.stringify({observed:true,note:'Evento informacional processado pelo NexOffice Core.'})]);
      await client.query(`update command_actions set status='done',updated_at=now() where id=$1 and workspace_id=$2`,[id,ctx.workspaceId]);
      return {...run,status:'succeeded',output:{observed:true}};
    });
    await log(ctx.workspaceId,ctx.user.id,'command.executed','command_action',id,null,{runId:result.id,status:result.status});return {reused:false,run:result};
  });

  app.get('/v1/outbox',async req=>{
    const ctx=await workspaceContext(req,'integrations.read');return query<any>(`select id,topic,status,attempts,next_attempt_at,last_error,created_at,sent_at from outbox_messages where workspace_id=$1 order by created_at desc limit 200`,[ctx.workspaceId]);
  });
  app.post('/v1/outbox/process',async req=>{
    const ctx=await workspaceContext(req,'integrations.manage');const limit=Math.min(50,Math.max(1,Number((req.body as any)?.limit||10)));
    const messages=await query<any>(`select * from outbox_messages where workspace_id=$1 and status in ('pending','failed') and next_attempt_at<=now() order by created_at for update skip locked limit $2`,[ctx.workspaceId,limit]);
    const results=[];
    for(const msg of messages){
      await query(`update outbox_messages set status='processing',locked_at=now(),attempts=attempts+1 where id=$1`,[msg.id]);
      let result:any;try{result=await dispatchOutbox(msg.topic,msg.payload)}catch(error){result={ok:false,error:error instanceof Error?error.message:String(error)}}
      if(result.ok){await query(`update outbox_messages set status='sent',sent_at=now(),last_error=null where id=$1`,[msg.id]);const actionId=msg.payload?.commandActionId;if(actionId){await query(`update command_actions set status='done',updated_at=now() where id=$1 and workspace_id=$2`,[actionId,ctx.workspaceId]);await query(`update agent_runs set status='succeeded',output=$3,finished_at=now() where action_id=$1 and workspace_id=$2 and status='queued_external'`,[actionId,ctx.workspaceId,JSON.stringify(result)])}}
      else{const nextMinutes=Math.min(360,Math.pow(2,Math.min(Number(msg.attempts||0)+1,8)));await query(`update outbox_messages set status=case when attempts>=8 then 'dead' else 'failed' end,last_error=$2,next_attempt_at=now()+($3::text||' minutes')::interval where id=$1`,[msg.id,String(result.error||'dispatch_failed'),String(nextMinutes)])}
      results.push({id:msg.id,topic:msg.topic,...result});
    }
    await log(ctx.workspaceId,ctx.user.id,'outbox.processed','workspace',ctx.workspaceId,null,{count:results.length});return {processed:results.length,results};
  });
}

async function log(workspaceId:string,userId:string,action:string,subjectType:string,subjectId:string,before:unknown,after:unknown){
  await query(`insert into audit_log(workspace_id,actor_type,actor_ref,action,subject_type,subject_id,before_state,after_state) values($1,'user',$2,$3,$4,$5,$6,$7)`,[workspaceId,userId,action,subjectType,subjectId,before?JSON.stringify(before):null,after?JSON.stringify(after):null]).catch(()=>null);
}
