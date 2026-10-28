import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {ApiError,authenticate} from './auth.js';
import {query,transaction} from './db.js';

// Explicitly nonfinancial. Drafts are never scheduled or executed.
async function ownerOf(req:Parameters<typeof authenticate>[0]){
  const user=await authenticate(req);
  const profile=await query('select 1 from nex_personal.profiles where user_id=$1',[user.id]);
  if(!profile.length)throw new ApiError(409,'personal_activation_required','Ative seu espaço Nexa.');
  return user.id;
}
export async function registerNexaAgenticsRoutes(app:FastifyInstance){
  app.get('/v1/personal/agentics/status',async req=>{
    const owner=await ownerOf(req);
    const entitled=await query<{owner_user_id:string}>(`select owner_user_id from nex_personal.agentic_entitlements
      where owner_user_id=$1 and status='active' and valid_until>now() and verified_at<=now() and verified_reference<>'' limit 1`,[owner]);
    return {assistant:'maya',missionCreationEnabled:entitled.length>0&&process.env.NEXA_PF_AGENTICS_DRAFTS_ENABLED==='true',
      missionMonitoringEnabled:false,alertsEnabled:false,financialExecutionEnabled:false,
      premiumVerification:entitled.length?'verified':'required',externalEffect:false};
  });
  app.get('/v1/personal/agentics/missions',async req=>{
    const owner=await ownerOf(req);
    const missions=await query('select id,title,description,status,created_at,updated_at from nex_personal.agentic_missions where owner_user_id=$1 order by created_at desc limit 100',[owner]);
    return {missions,executionEnabled:false,monitoringEnabled:false,externalEffect:false};
  });
  app.post('/v1/personal/agentics/missions',async req=>{
    const owner=await ownerOf(req);
    const input=z.object({
      title:z.string().trim().min(1).max(160),
      description:z.string().trim().max(1000).default('')
    }).strict().parse(req.body);
    if(process.env.NEXA_PF_AGENTICS_DRAFTS_ENABLED!=='true')
      throw new ApiError(403,'agentics_not_enabled','Missões ainda não estão disponíveis.');
    // Serialize draft creation per owner to enforce the 20-draft cap under concurrent requests.
    const inserted=await transaction(async client=>{
      await client.query('select pg_advisory_xact_lock(hashtext($1))',['nexa-agentics-drafts:'+owner]);
      const entitlement=await client.query(`select owner_user_id from nex_personal.agentic_entitlements
        where owner_user_id=$1 and status='active' and valid_until>now()
        and verified_at<=now() and verified_reference<>'' limit 1`,[owner]);
      if(!entitlement.rowCount)
        throw new ApiError(403,'premium_required','Assinatura Premium ativa e verificada necessária.');
      const existing=await client.query<{qty:number}>(
        "select count(*)::int qty from nex_personal.agentic_missions where owner_user_id=$1 and status='draft'",[owner]);
      if(existing.rows[0].qty>=20)throw new ApiError(409,'mission_limit','Limite de 20 rascunhos ativos.');
      const created=await client.query<{id:string;title:string;description:string;status:string;created_at:string}>(
        "insert into nex_personal.agentic_missions(owner_user_id,title,description) values($1,$2,$3) returning id,title,description,status,created_at",
        [owner,input.title,input.description]);
      return created.rows[0];
    });
    return {mission:inserted,executionEnabled:false,externalEffect:false};
  });
  app.post('/v1/personal/agentics/missions/:id/cancel',async req=>{
    const owner=await ownerOf(req);
    const id=z.string().uuid().parse((req.params as {id:string}).id);
    const updated=await query<{id:string}>("update nex_personal.agentic_missions set status='cancelled',updated_at=now() where owner_user_id=$1 and id=$2 and status='draft' returning id",[owner,id]);
    if(!updated.length)throw new ApiError(404,'mission_not_found','Missão não encontrada.');
    return {cancelled:true,externalEffect:false};
  });
}
