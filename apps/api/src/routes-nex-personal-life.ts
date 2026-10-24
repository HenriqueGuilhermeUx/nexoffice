import type {FastifyInstance,FastifyRequest} from 'fastify';
import {z} from 'zod';
import {ApiError,authenticate} from './auth.js';
import {query} from './db.js';

// Deliberately minimal: only self-selected areas and non-sensitive intent types.
// No automatic product-to-product data access, marketing, payment or AI model calls.
const areas=['money','health','education','family','documents','work','shopping','travel','vehicle','investments','crypto','marketing','offers','public_services','debt_review','legal_support'] as const;
const kinds=['buy_car','trip','email','family_study','health_organize','investment_review','publish','documents','buy_phone','family_planning'] as const;
async function personalOwner(req:FastifyRequest){
 const user=await authenticate(req);
 const profile=await query('select user_id from nex_personal.profiles where user_id=$1',[user.id]);
 if(!profile.length)throw new ApiError(409,'personal_activation_required','Ative seu espaço Nex Personal.');
 return user.id;
}
export async function registerNexPersonalLifeRoutes(app:FastifyInstance){
 app.get('/v1/personal/life',async req=>{
  const owner=await personalOwner(req);
  const [preferences,intents]=await Promise.all([
   query<{focus_areas:string[];proactive_mode:'off'|'on_open'}>(
    'select focus_areas,proactive_mode from nex_personal.life_preferences where owner_user_id=$1',[owner]),
   query<{id:string;kind:string;status:string;created_at:string}>(
    'select id,kind,status,created_at from nex_personal.life_intents where owner_user_id=$1 order by created_at desc limit 30',[owner])
  ]);
  return {preferences:preferences[0]||{focus_areas:[],proactive_mode:'off'},
   intents,proactiveDeliveryActive:false,marketingPersonalization:false,
   connectedProducts:[],partnerDataShared:false,externalEffect:false,
   note:'Somente interesses e nomes de tarefas fornecidos por voce. Nenhum dado de saúde, menores ou outros aplicativos é importado.'};
 });
 app.put('/v1/personal/life/preferences',async req=>{
  const owner=await personalOwner(req);
  const input=z.object({focusAreas:z.array(z.enum(areas)).max(6).refine(v=>new Set(v).size===v.length),
   proactiveMode:z.enum(['off','on_open'])}).strict().parse(req.body);
  const rows=await query<{focus_areas:string[];proactive_mode:string}>(
   'insert into nex_personal.life_preferences(owner_user_id,focus_areas,proactive_mode) values($1,$2,$3) on conflict(owner_user_id) do update set focus_areas=excluded.focus_areas,proactive_mode=excluded.proactive_mode,updated_at=now() returning focus_areas,proactive_mode',
   [owner,input.focusAreas,input.proactiveMode]
  );
  await query("insert into nex_personal.audit_events(owner_user_id,actor_user_id,action,subject_type) values($1,$1,'life.preferences_updated','life_preferences')",[owner]);
  return {preferences:rows[0],proactiveDeliveryActive:false,externalEffect:false};
 });
 app.post('/v1/personal/life/intents',async req=>{
  const owner=await personalOwner(req);
  const input=z.object({kind:z.enum(kinds)}).strict().parse(req.body);
  const existing=await query<{qty:number}>("select count(*)::int qty from nex_personal.life_intents where owner_user_id=$1 and status='planned'",[owner]);
  if(existing[0].qty>=20)throw new ApiError(409,'too_many_open_intents','Conclua algumas jornadas antes de iniciar outras.');
  const inserted=await query<{id:string;kind:string;status:string;created_at:string}>(
   "insert into nex_personal.life_intents(owner_user_id,kind) values($1,$2) returning id,kind,status,created_at",
   [owner,input.kind]
  );
  await query("insert into nex_personal.audit_events(owner_user_id,actor_user_id,action,subject_type,subject_id) values($1,$1,'life.intent_created','life_intent',$2)",[owner,inserted[0].id]);
  return {intent:inserted[0],externalEffect:false};
 });
 app.post('/v1/personal/life/intents/:id/complete',async req=>{
  const owner=await personalOwner(req);
  const id=z.string().uuid().parse((req.params as {id:string}).id);
  const updated=await query<{id:string}>(
   "update nex_personal.life_intents set status='done',updated_at=now() where owner_user_id=$1 and id=$2 and status='planned' returning id",
   [owner,id]
  );
  if(!updated.length)throw new ApiError(404,'intent_not_found','Jornada não encontrada.');
  await query("insert into nex_personal.audit_events(owner_user_id,actor_user_id,action,subject_type,subject_id) values($1,$1,'life.intent_completed','life_intent',$2)",[owner,id]);
  return {completed:true,externalEffect:false};
 });
}
