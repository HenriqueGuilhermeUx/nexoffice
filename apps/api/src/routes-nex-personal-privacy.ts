import type {FastifyInstance,FastifyRequest} from 'fastify';
import {authenticate,ApiError} from './auth.js';
import {query} from './db.js';

/**
 * A bounded user-only portability snapshot. Authentication required;
 * no PJ tables, third-party data, token hashes or external API credentials.
 * Explicitly not an E2EE claim or guaranteed complete legal portability export.
 */
/**
 * Export projections are purpose-built and fail closed. NEVER use "select *":
 * a future provider_secret, access_token or provider credential column must not
 * silently become part of the downloadable user snapshot.
 * Amounts use text to preserve integer centavos without JSON float rounding.
 */
const EXPORT_FIELDS={
 consents:'id,purpose,status,provider,partner_ref,data_scopes,granted_at,expires_at,revoked_at,created_at',
 connections:'id,consent_id,provider,institution_name,status,last_synced_at,created_at,updated_at',
 accounts:'id,connection_id,provider,institution_name,name,account_type,currency,current_minor::text current_minor,available_minor::text available_minor,balance_as_of,last_synced_at,status,created_at,updated_at',
 transactions:'id,account_id,description,amount_minor::text amount_minor,currency,category,booked_at,imported_at,source,analysis_role,analysis_confidence,category_origin,analysis_rule',
 budgets:'id,month,category,limit_minor::text limit_minor,created_at,updated_at',
 goals:'id,name,target_minor::text target_minor,saved_minor::text saved_minor,due_on,status,created_at,updated_at',
 wealth_items:'id,name,kind,category,amount_minor::text amount_minor,currency,updated_at,created_at',
 bills:'id,name,amount_minor::text amount_minor,category,next_due_on,interval_months,active,created_at,updated_at',
 life_preferences:'focus_areas,proactive_mode,updated_at',
 life_intents:'id,kind,status,created_at,updated_at',
 audit_events:'id,action,subject_type,subject_id,created_at'
} as const;
const TABLES=Object.keys(EXPORT_FIELDS) as Array<keyof typeof EXPORT_FIELDS>;
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
   const orderBy=table==='life_preferences'?'owner_user_id':table==='transactions'?'booked_at':'created_at';
   // All identifiers are from the above closed, in-code table and column lists.
   const rows=await query<any>(
     'select '+EXPORT_FIELDS[table]+' from nex_personal.'+table+
     ' where owner_user_id=$1 order by '+orderBy+' desc limit $2',
     [user.id,MAX_RECORDS_PER_TABLE+1]
   );
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
   note:'Exportação parcial se uma categoria superar 5000 registros. Campos técnicos secretos, referências privadas de provedores, credenciais e sessões não são incluídos. Inclui ações de auditoria do próprio titular; dados locais não enviados ao servidor também não constam.'};
 });
}
