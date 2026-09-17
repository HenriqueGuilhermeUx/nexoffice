import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {ApiError,workspaceContext} from './auth.js';
import {query} from './db.js';
import {auditLog} from './events.js';

const uuid=z.string().uuid();
const fieldType=z.enum(['text','textarea','number','currency','date','datetime','boolean','select','email','phone','url','document_ref']);
const fieldSchema=z.object({key:z.string().regex(/^[a-z][a-z0-9_]{1,60}$/),label:z.string().min(1).max(120),type:fieldType,required:z.boolean().default(false),options:z.array(z.string()).max(100).optional(),placeholder:z.string().max(240).optional()});
const moduleConfig=z.object({fields:z.array(fieldSchema).max(40).default([]),contactRequired:z.boolean().default(false),occurredAtLabel:z.string().max(100).optional(),sensitivePolicy:z.enum(['standard','administrative_only']).default('standard')}).passthrough();

export const FLEXIBLE_TEMPLATES={
  visits:{key:'visits',name:'Visitas',singularLabel:'Visita',pluralLabel:'Visitas',description:'Registre visitas, retornos, responsáveis, observações e próximos passos vinculados ao cliente.',icon:'◎',config:{contactRequired:true,occurredAtLabel:'Data da visita',fields:[{key:'visit_type',label:'Tipo de visita',type:'select',options:['Presencial','Online','Retorno','Técnica']},{key:'responsible',label:'Responsável',type:'text'},{key:'notes',label:'Observações',type:'textarea'},{key:'outcome',label:'Resultado',type:'text'},{key:'next_step',label:'Próximo passo',type:'text'}]}},
  service_history:{key:'service-history',name:'Atendimentos',singularLabel:'Atendimento',pluralLabel:'Atendimentos',description:'Histórico administrativo de atendimentos, consultas, retornos e no-shows. Não substitui prontuário clínico.',icon:'◷',config:{contactRequired:true,occurredAtLabel:'Data do atendimento',sensitivePolicy:'administrative_only',fields:[{key:'service_type',label:'Tipo',type:'text'},{key:'responsible',label:'Responsável',type:'text'},{key:'status_detail',label:'Status / resultado administrativo',type:'text'},{key:'notes',label:'Anotação administrativa',type:'textarea'},{key:'next_step',label:'Próximo passo',type:'text'}]}},
  purchase_notes:{key:'purchase-notes',name:'Notas de compra',singularLabel:'Nota de compra',pluralLabel:'Notas de compra',description:'Controle notas e documentos de compra vinculados a fornecedor, despesa e referência documental.',icon:'▤',config:{contactRequired:false,occurredAtLabel:'Emissão',fields:[{key:'supplier',label:'Fornecedor',type:'text',required:true},{key:'invoice_number',label:'Número da nota',type:'text'},{key:'amount',label:'Valor',type:'currency',required:true},{key:'category',label:'Categoria',type:'text'},{key:'document_ref',label:'Documento / referência',type:'document_ref'},{key:'notes',label:'Observações',type:'textarea'}]}},
  client_notes:{key:'client-notes',name:'Anotações do cliente',singularLabel:'Anotação',pluralLabel:'Anotações',description:'Registre contexto, preferências, ocorrências e próximos passos em uma linha do tempo única.',icon:'✎',config:{contactRequired:true,occurredAtLabel:'Data',fields:[{key:'category',label:'Categoria',type:'text'},{key:'note',label:'Anotação',type:'textarea',required:true},{key:'next_step',label:'Próximo passo',type:'text'}]}},
  brand_deals:{key:'brand-deals',name:'Brand Deals',singularLabel:'Parceria',pluralLabel:'Brand Deals',description:'Oportunidades e contratos com marcas para creators.',icon:'◇',config:{contactRequired:true,occurredAtLabel:'Início',fields:[{key:'brand',label:'Marca',type:'text',required:true},{key:'campaign',label:'Campanha',type:'text',required:true},{key:'fee',label:'Cachê',type:'currency'},{key:'deliverables',label:'Entregáveis',type:'textarea'},{key:'approval_status',label:'Aprovação',type:'select',options:['Briefing','Produção','Aguardando aprovação','Aprovado','Publicado']},{key:'payment_terms',label:'Condição de pagamento',type:'text'}]}},
  creator_deliverables:{key:'creator-deliverables',name:'Entregáveis',singularLabel:'Entregável',pluralLabel:'Entregáveis',description:'Controle posts, reels, stories, vídeos e demais entregas de campanhas.',icon:'▱',config:{contactRequired:true,occurredAtLabel:'Prazo',fields:[{key:'format',label:'Formato',type:'select',options:['Post','Reel','Story','Vídeo','Live','UGC','Outro']},{key:'channel',label:'Canal',type:'text'},{key:'brief',label:'Briefing',type:'textarea'},{key:'approval',label:'Status',type:'select',options:['Planejado','Em produção','Enviado','Aprovado','Publicado']},{key:'url',label:'URL publicado',type:'url'}]}},
  content_calendar:{key:'content-calendar',name:'Calendário editorial',singularLabel:'Conteúdo',pluralLabel:'Conteúdos',description:'Planejamento editorial conectado à rotina, marca e growth.',icon:'◫',config:{contactRequired:false,occurredAtLabel:'Data de publicação',fields:[{key:'channel',label:'Canal',type:'text'},{key:'format',label:'Formato',type:'text'},{key:'theme',label:'Tema',type:'text'},{key:'cta',label:'CTA',type:'text'},{key:'status',label:'Status editorial',type:'select',options:['Ideia','Roteiro','Produção','Aprovação','Agendado','Publicado']}]}}
} as const;

const moduleInput=z.object({templateKey:z.string().optional(),key:z.string().regex(/^[a-z][a-z0-9-]{1,60}$/).optional(),name:z.string().min(2).max(120).optional(),singularLabel:z.string().min(1).max(80).optional(),pluralLabel:z.string().min(1).max(80).optional(),description:z.string().max(500).optional().nullable(),icon:z.string().max(12).optional().nullable(),config:moduleConfig.optional()});
const recordInput=z.object({contactId:uuid.optional().nullable(),title:z.string().min(1).max(240),status:z.string().min(1).max(60).default('active'),occurredAt:z.string().datetime().optional().nullable(),data:z.record(z.string(),z.unknown()).default({})});

function template(key:string){return (FLEXIBLE_TEMPLATES as Record<string,any>)[key]||null}
function cleanModule(row:any){return {...row,config:row.config||{fields:[]}}}

export async function registerFlexibleRoutes(app:FastifyInstance){
  app.get('/v1/flexible-modules/templates',async req=>{await workspaceContext(req,'workspace.read');return Object.values(FLEXIBLE_TEMPLATES)});
  app.get('/v1/flexible-modules',async req=>{const ctx=await workspaceContext(req,'workspace.read');return (await query<any>(`select * from flexible_modules where workspace_id=$1 order by active desc,updated_at desc,name`,[ctx.workspaceId])).map(cleanModule)});
  app.post('/v1/flexible-modules',async req=>{
    const ctx=await workspaceContext(req,'workspace.manage'),input=moduleInput.parse(req.body),preset=input.templateKey?template(input.templateKey):null;
    if(input.templateKey&&!preset)throw new ApiError(400,'template_not_found','Modelo de módulo não encontrado.');
    const key=String(input.key||preset?.key||'').trim(),name=String(input.name||preset?.name||'').trim();
    if(!key||!name)throw new ApiError(400,'module_identity_required','Informe o nome e a chave do módulo.');
    const config=moduleConfig.parse(input.config||preset?.config||{});
    const rows=await query<any>(`insert into flexible_modules(workspace_id,key,name,singular_label,plural_label,description,icon,config) values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(workspace_id,key) do update set name=excluded.name,singular_label=excluded.singular_label,plural_label=excluded.plural_label,description=excluded.description,icon=excluded.icon,config=excluded.config,active=true,updated_at=now() returning *`,[ctx.workspaceId,key,name,input.singularLabel||preset?.singularLabel||'Registro',input.pluralLabel||preset?.pluralLabel||'Registros',input.description??preset?.description??null,input.icon??preset?.icon??null,JSON.stringify(config)]);
    await auditLog(ctx,'flexible_module.created','flexible_module',rows[0].id,null,{key,name,templateKey:input.templateKey||null});return cleanModule(rows[0]);
  });
  app.patch('/v1/flexible-modules/:id',async req=>{
    const ctx=await workspaceContext(req,'workspace.manage'),id=uuid.parse((req.params as any).id),input=z.object({name:z.string().min(2).max(120).optional(),singularLabel:z.string().min(1).max(80).optional(),pluralLabel:z.string().min(1).max(80).optional(),description:z.string().max(500).optional().nullable(),icon:z.string().max(12).optional().nullable(),active:z.boolean().optional(),config:moduleConfig.optional()}).parse(req.body),before=(await query<any>(`select * from flexible_modules where id=$1 and workspace_id=$2`,[id,ctx.workspaceId]))[0];
    if(!before)throw new ApiError(404,'not_found','Módulo não encontrado.');
    const after=(await query<any>(`update flexible_modules set name=$3,singular_label=$4,plural_label=$5,description=$6,icon=$7,active=$8,config=$9,updated_at=now() where id=$1 and workspace_id=$2 returning *`,[id,ctx.workspaceId,input.name??before.name,input.singularLabel??before.singular_label,input.pluralLabel??before.plural_label,input.description===undefined?before.description:input.description,input.icon===undefined?before.icon:input.icon,input.active??before.active,JSON.stringify(input.config??before.config)]))[0];
    await auditLog(ctx,'flexible_module.updated','flexible_module',id,before,after);return cleanModule(after);
  });
  app.get('/v1/flexible-modules/:id/records',async req=>{
    const ctx=await workspaceContext(req,'workspace.read'),id=uuid.parse((req.params as any).id),q=String((req.query as any)?.q||'').trim(),contactId=String((req.query as any)?.contactId||'').trim();
    if(!(await query<any>(`select 1 from flexible_modules where id=$1 and workspace_id=$2`,[id,ctx.workspaceId])).length)throw new ApiError(404,'not_found','Módulo não encontrado.');
    return query<any>(`select r.*,c.name contact_name from flexible_records r left join crm_contacts c on c.id=r.contact_id where r.workspace_id=$1 and r.module_id=$2 and ($3='' or r.title ilike '%'||$3||'%' or r.data::text ilike '%'||$3||'%') and ($4='' or r.contact_id::text=$4) order by coalesce(r.occurred_at,r.created_at) desc limit 1000`,[ctx.workspaceId,id,q,contactId]);
  });
  app.post('/v1/flexible-modules/:id/records',async req=>{
    const ctx=await workspaceContext(req,'crm.write'),id=uuid.parse((req.params as any).id),input=recordInput.parse(req.body),module=(await query<any>(`select * from flexible_modules where id=$1 and workspace_id=$2 and active=true`,[id,ctx.workspaceId]))[0];
    if(!module)throw new ApiError(404,'not_found','Módulo não encontrado.');
    if(module.config?.contactRequired&&!input.contactId)throw new ApiError(400,'contact_required','Vincule este registro a um contato.');
    if(input.contactId&&!(await query<any>(`select 1 from crm_contacts where id=$1 and workspace_id=$2`,[input.contactId,ctx.workspaceId])).length)throw new ApiError(404,'contact_not_found','Contato não encontrado.');
    const rows=await query<any>(`insert into flexible_records(workspace_id,module_id,contact_id,title,status,occurred_at,data,created_by) values($1,$2,$3,$4,$5,$6,$7,$8) returning *`,[ctx.workspaceId,id,input.contactId||null,input.title,input.status,input.occurredAt||null,JSON.stringify(input.data),ctx.user.id]);
    await auditLog(ctx,'flexible_record.created','flexible_record',rows[0].id,null,{moduleId:id,moduleKey:module.key,contactId:input.contactId||null});return rows[0];
  });
  app.patch('/v1/flexible-records/:id',async req=>{
    const ctx=await workspaceContext(req,'crm.write'),id=uuid.parse((req.params as any).id),input=recordInput.partial().parse(req.body),before=(await query<any>(`select * from flexible_records where id=$1 and workspace_id=$2`,[id,ctx.workspaceId]))[0];
    if(!before)throw new ApiError(404,'not_found','Registro não encontrado.');
    const after=(await query<any>(`update flexible_records set contact_id=$3,title=$4,status=$5,occurred_at=$6,data=$7,updated_at=now() where id=$1 and workspace_id=$2 returning *`,[id,ctx.workspaceId,input.contactId===undefined?before.contact_id:input.contactId,input.title??before.title,input.status??before.status,input.occurredAt===undefined?before.occurred_at:input.occurredAt,JSON.stringify(input.data??before.data)]))[0];
    await auditLog(ctx,'flexible_record.updated','flexible_record',id,before,after);return after;
  });
  app.get('/v1/contacts/:id/360',async req=>{
    const ctx=await workspaceContext(req,'crm.read'),id=uuid.parse((req.params as any).id),contact=(await query<any>(`select * from crm_contacts where id=$1 and workspace_id=$2`,[id,ctx.workspaceId]))[0];
    if(!contact)throw new ApiError(404,'not_found','Contato não encontrado.');
    const [activities,deals,tasks,appointments,documents,ledger,custom]=await Promise.all([
      query<any>(`select * from crm_activities where workspace_id=$1 and contact_id=$2 order by occurred_at desc limit 300`,[ctx.workspaceId,id]),
      query<any>(`select * from crm_deals where workspace_id=$1 and contact_id=$2 order by updated_at desc limit 200`,[ctx.workspaceId,id]),
      query<any>(`select * from tasks where workspace_id=$1 and contact_id=$2 order by coalesce(due_at,created_at) desc limit 200`,[ctx.workspaceId,id]),
      query<any>(`select * from appointments where workspace_id=$1 and contact_id=$2 order by starts_at desc limit 200`,[ctx.workspaceId,id]),
      query<any>(`select * from document_refs where workspace_id=$1 and contact_id=$2 order by updated_at desc limit 200`,[ctx.workspaceId,id]),
      query<any>(`select * from ledger_entries where workspace_id=$1 and contact_id=$2 order by coalesce(paid_at,due_at,created_at) desc limit 300`,[ctx.workspaceId,id]),
      query<any>(`select r.*,m.name module_name,m.singular_label from flexible_records r join flexible_modules m on m.id=r.module_id where r.workspace_id=$1 and r.contact_id=$2 order by coalesce(r.occurred_at,r.created_at) desc limit 400`,[ctx.workspaceId,id])
    ]);
    const timeline=[
      ...activities.map((x:any)=>({kind:'activity',at:x.occurred_at,title:x.subject||x.type,detail:x.body||null,data:x})),
      ...appointments.map((x:any)=>({kind:'appointment',at:x.starts_at,title:x.title,detail:x.status,data:x})),
      ...tasks.map((x:any)=>({kind:'task',at:x.due_at||x.created_at,title:x.title,detail:x.status,data:x})),
      ...documents.map((x:any)=>({kind:'document',at:x.updated_at||x.created_at,title:x.title,detail:x.status,data:x})),
      ...ledger.map((x:any)=>({kind:'finance',at:x.paid_at||x.due_at||x.created_at,title:x.description,detail:x.status,data:x})),
      ...custom.map((x:any)=>({kind:'custom',at:x.occurred_at||x.created_at,title:x.title,detail:x.module_name,data:x}))
    ].sort((a:any,b:any)=>new Date(b.at||0).getTime()-new Date(a.at||0).getTime()).slice(0,800);
    const received=ledger.filter((x:any)=>x.direction==='income'&&x.status==='paid').reduce((s:number,x:any)=>s+Number(x.amount_minor||0),0),open=ledger.filter((x:any)=>x.direction==='income'&&['open','overdue'].includes(x.status)).reduce((s:number,x:any)=>s+Number(x.amount_minor||0),0);
    return {contact,summary:{activities:activities.length,deals:deals.length,tasks:tasks.length,appointments:appointments.length,documents:documents.length,customRecords:custom.length,receivedMinor:received,openReceivableMinor:open,lastInteractionAt:timeline[0]?.at||null},timeline,deals,tasks,appointments,documents,ledger,customRecords:custom};
  });
}
