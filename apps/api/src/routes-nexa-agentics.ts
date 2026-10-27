import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {ApiError,authenticate} from './auth.js';
import {query} from './db.js';

// Explicitly nonfinancial. Drafts are never scheduled or executed.
async function ownerOf(req:Parameters<typeof authenticate>[0]){
  const user=await authenticate(req);
  const profile=await query('select 1 from nex_personal.profiles where user_id=$1',[user.id]);
  if(!profile.length)throw new ApiError(409,'personal_activation_required','Ative seu espaço Nexa.');
  return user.id;
}
export async function registerNexaAgenticsRoutes(app:FastifyInstance){
  app.get('/v1/personal/agentics/missions',async req=>{
    const owner=await ownerOf(req);
    const missions=await query('select id,title,description,status,created_at,updated_at from nex_personal.agentic_missions where owner_user_id=$1 order by created_at desc limit 100',[owner]);
    return {missions,executionEnabled:false,monitoringEnabled:false,externalEffect:false};
  });
  app.post('/v1/personal/agentics/missions',async req=>{
    await ownerOf(req);
    // No Premium subscription source has been verified for this PF identity yet.
    // Fail closed rather than granting an unentitled user access.
    if(process.env.NEXA_PF_AGENTICS_DRAFTS_ENABLED!=='true')
      throw new ApiError(403,'agentics_not_enabled','Missões ainda não estão disponíveis.');
    throw new ApiError(403,'premium_verification_pending','A assinatura Premium precisa ser validada no servidor antes de criar missões.');
  });
  app.post('/v1/personal/agentics/missions/:id/cancel',async req=>{
    const owner=await ownerOf(req);
    const id=z.string().uuid().parse((req.params as {id:string}).id);
    const updated=await query<{id:string}>("update nex_personal.agentic_missions set status='cancelled',updated_at=now() where owner_user_id=$1 and id=$2 and status='draft' returning id",[owner,id]);
    if(!updated.length)throw new ApiError(404,'mission_not_found','Missão não encontrada.');
    return {cancelled:true,externalEffect:false};
  });
}
