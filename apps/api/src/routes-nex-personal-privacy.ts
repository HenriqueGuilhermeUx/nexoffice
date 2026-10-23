import type {FastifyInstance,FastifyRequest} from 'fastify';
import {authenticate,ApiError} from './auth.js';
import {query} from './db.js';

/**
 * A bounded user-only portability snapshot. Authentication required;
 * no PJ tables, third-party data, token hashes or external API credentials.
 * Explicitly not an E2EE claim or guaranteed complete legal portability export.
 */
const TABLES=['consents','connections','accounts','transactions','budgets','goals','wealth_items','bills','life_preferences','life_intents'] as const;
const MAX_RECORDS_PER_TABLE=5000;

async function owner(req:FastifyRequest){
 const user=await authenticate(req);
 const p=await query('select 1 from nex_personal.profiles where user_id=$1',[user.id]);
 if(!p.length)throw new ApiError(409,'personal_activation_required','Perfil pessoal não ativado.');
 return user;
}
export async function registerNexPersonalPrivacyRoutes(app:FastifyInstance){
 app.get('/v1/personal/privacy/status',async req=>{
  await owner(req);
  return {
   dataControl:'authenticated_owner_only',marketingPersonalization:false,
   linkedProducts:[],externalDataSharing:false,backgroundAgentActions:false,
   thirdPartyLegalAssistant:false,serasaConnected:false,
   cloudStoredData:['identity','manual_accounts','imported_financial_rows','user_preferences','audit_metadata'],
   browserOnlyTools:['public_services','debt_review','legal_support'],
   encryptionScope:'Not independently audited for end-to-end encryption',
   notice:'Dados da conta ficam no servidor isolado da homologação; somente o texto e os valores digitados nos 3 guias locais não são enviados à API. Administradores de infraestrutura e prestadores autorizados podem ter acesso técnico sob controles aplicáveis.',
   externalEffect:false
  };
 });
 app.get('/v1/personal/privacy/export',async(req,reply)=>{
  const user=await owner(req);
  const snapshot:Record<string,unknown[]>={};
  const truncated:string[]=[];
  for(const table of TABLES){
   // Fixed schema/table identifiers from internal constant, never user input.
   const rows=await query<any>('select * from nex_personal.'+table+' where owner_user_id=$1 order by '+(table==='life_preferences'?'owner_user_id':'created_at')+' desc limit $2',[user.id,MAX_RECORDS_PER_TABLE+1]);
   if(rows.length>MAX_RECORDS_PER_TABLE)truncated.push(table);
   snapshot[table]=rows.slice(0,MAX_RECORDS_PER_TABLE);
  }
  const me=await query<{name:string;email:string;created_at:string}>('select name,email,created_at from public.users where id=$1',[user.id]);
  // Audit event but never include passwords or session tokens in response.
  await query("insert into nex_personal.audit_events(owner_user_id,actor_user_id,action,subject_type) values($1,$1,'privacy.export_requested','personal_data')",[user.id]);
  reply.header('cache-control','no-store').header('content-type','application/json; charset=utf-8');
  return {format:'nex_personal_owner_snapshot_v1',generatedAt:new Date().toISOString(),
   owner:{id:user.id,name:me[0]?.name,email:me[0]?.email,created_at:me[0]?.created_at},
   data:snapshot,truncatedTables:truncated,complete:truncated.length===0,
   note:'Exportação parcial se uma categoria superar 5000 registros. Credenciais e sessões não incluídas. Dados locais não enviados ao servidor também não constam.'};
 });
}
