import {hasPermission,type WorkspaceContext} from './auth.js';
import {query} from './db.js';
import {readDocWalletIntelligence} from './docwallet-intelligence-adapter.js';

type MemoryDomain='crm'|'sales'|'finance'|'agenda'|'documents'|'operations';
type Evidence={domain:MemoryDomain;title:string;text:string;sourceType:string;sourceId:string;observedAt?:string|null;score?:number;metadata?:Record<string,unknown>};

const STOP=new Set('a o os as de da do das dos e em no na nos nas um uma uns umas para por com sem que qual quais quem quanto quantos quanta quantas como onde quando meu minha meus minhas seu sua seus suas nossa nosso isso isto aquele aquela sobre me diga mostra mostre quero saber empresa nexoffice'.split(' '));
const ALIASES:Record<string,string[]>= {
  contrato:['contrato','documento','docwallet','assinatura','clausula','multa','reajuste','renovacao','vigencia','obrigacao'],
  cliente:['cliente','contato','crm','empresa','pessoa'],
  venda:['venda','oportunidade','negocio','deal','proposta','pipeline','receita'],
  financeiro:['financeiro','dinheiro','caixa','receber','pagar','receita','despesa','vencido','vencimento','valor'],
  agenda:['agenda','reuniao','consulta','atendimento','compromisso','horario'],
  tarefa:['tarefa','pendencia','atividade','fazer','prazo'],
  assinatura:['assinatura','assinado','signatario','signatarios'],
};

const norm=(value:unknown)=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9@._-]+/g,' ').trim();
function tokens(question:string){
  const base=norm(question).split(/\s+/).filter(x=>x.length>2&&!STOP.has(x));
  const expanded=new Set(base);
  for(const [key,values] of Object.entries(ALIASES))if(base.some(t=>t===key||values.includes(t)))for(const item of values)expanded.add(item);
  return [...expanded].slice(0,30);
}
function scoreEvidence(item:Evidence,terms:string[]){
  const hay=norm(`${item.title} ${item.text}`);let score=0;
  for(const term of terms){if(hay.includes(term))score+=term.length>=7?4:2;}
  if(item.observedAt){const age=(Date.now()-new Date(item.observedAt).getTime())/86400000;if(Number.isFinite(age)){if(age<=30)score+=1.5;else if(age<=90)score+=.7}}
  return score;
}
function money(minor:unknown,currency='BRL'){const value=Number(minor);if(!Number.isFinite(value))return '';try{return new Intl.NumberFormat('pt-BR',{style:'currency',currency}).format(value/100)}catch{return `${value/100} ${currency}`}}
function compact(value:unknown,max=700){const text=String(value??'').replace(/\s+/g,' ').trim();return text.length>max?`${text.slice(0,max-1)}…`:text}
function safeList(value:any,max=8){return Array.isArray(value)?value.slice(0,max):[]}
function structuredDocText(payload:any){
  const intel=payload?.intelligence||payload||{};const parts:string[]=[];
  if(intel.classification||intel.documentType)parts.push(`Tipo: ${intel.classification||intel.documentType}.`);
  if(intel.summary)parts.push(`Resumo: ${compact(intel.summary,900)}`);
  const parties=safeList(intel.parties).map((x:any)=>compact(x?.name||x?.label||x?.party||x?.text,160)).filter(Boolean);if(parties.length)parts.push(`Partes: ${parties.join('; ')}.`);
  const dates=safeList(intel.dates).map((x:any)=>compact(`${x?.label||x?.type||'Data'} ${x?.date||x?.value||''}`,180)).filter(Boolean);if(dates.length)parts.push(`Datas: ${dates.join('; ')}.`);
  const amounts=safeList(intel.amounts).map((x:any)=>compact(`${x?.label||x?.type||'Valor'} ${x?.amount??x?.value??''}`,180)).filter(Boolean);if(amounts.length)parts.push(`Valores: ${amounts.join('; ')}.`);
  const obligations=safeList(intel.obligations,12).map((x:any)=>compact(x?.description||x?.text||x?.label,260)).filter(Boolean);if(obligations.length)parts.push(`Obrigações: ${obligations.join('; ')}.`);
  return compact(parts.join(' '),2800);
}

async function operationalEvidence(ctx:WorkspaceContext):Promise<Evidence[]>{
  const jobs:Array<Promise<Evidence[]>>=[];
  if(hasPermission(ctx.role,ctx.permissions,'crm.read')){
    jobs.push(query<any>(`select id,name,company_name,source,tags,updated_at from crm_contacts where workspace_id=$1 order by updated_at desc limit 120`,[ctx.workspaceId]).then(rows=>rows.map(r=>({domain:'crm' as const,title:r.name,text:`Contato ${r.name}. Empresa ${r.company_name||'não informada'}. Origem ${r.source||'não informada'}. Tags ${(r.tags||[]).join(', ')}.`,sourceType:'crm_contact',sourceId:r.id,observedAt:r.updated_at}))));
    jobs.push(query<any>(`select d.id,d.title,d.stage,d.value_minor,d.currency,d.next_action,d.expected_close_at,d.updated_at,c.name contact_name from crm_deals d left join crm_contacts c on c.id=d.contact_id where d.workspace_id=$1 order by d.updated_at desc limit 100`,[ctx.workspaceId]).then(rows=>rows.map(r=>({domain:'sales' as const,title:r.title,text:`Oportunidade ${r.title}. Cliente ${r.contact_name||'não vinculado'}. Etapa ${r.stage}. Valor ${money(r.value_minor,r.currency)}. Próxima ação ${r.next_action||'não informada'}. Fechamento esperado ${r.expected_close_at||'não informado'}.`,sourceType:'crm_deal',sourceId:r.id,observedAt:r.updated_at}))));
  }
  if(hasPermission(ctx.role,ctx.permissions,'finance.read'))jobs.push(query<any>(`select l.id,l.direction,l.category,l.description,l.amount_minor,l.currency,l.status,l.due_at,l.paid_at,l.updated_at,c.name contact_name from ledger_entries l left join crm_contacts c on c.id=l.contact_id where l.workspace_id=$1 order by l.updated_at desc limit 140`,[ctx.workspaceId]).then(rows=>rows.map(r=>({domain:'finance' as const,title:r.description,text:`${r.direction==='income'?'Entrada':'Saída'} ${r.description}. Categoria ${r.category}. Valor ${money(r.amount_minor,r.currency)}. Status ${r.status}. Vencimento ${r.due_at||'não informado'}. Pagamento ${r.paid_at||'não informado'}. Contato ${r.contact_name||'não vinculado'}.`,sourceType:'ledger_entry',sourceId:r.id,observedAt:r.updated_at}))));
  if(hasPermission(ctx.role,ctx.permissions,'agenda.read')){
    jobs.push(query<any>(`select t.id,t.title,t.description,t.status,t.priority,t.due_at,t.completed_at,t.updated_at,c.name contact_name from tasks t left join crm_contacts c on c.id=t.contact_id where t.workspace_id=$1 and t.status<>'cancelled' order by t.updated_at desc limit 120`,[ctx.workspaceId]).then(rows=>rows.map(r=>({domain:'operations' as const,title:r.title,text:`Tarefa ${r.title}. ${r.description||''} Status ${r.status}. Prioridade ${r.priority}. Prazo ${r.due_at||'não informado'}. Concluída ${r.completed_at||'não'}. Contato ${r.contact_name||'não vinculado'}.`,sourceType:'task',sourceId:r.id,observedAt:r.updated_at}))));
    jobs.push(query<any>(`select a.id,a.title,a.starts_at,a.ends_at,a.status,a.updated_at,c.name contact_name from appointments a left join crm_contacts c on c.id=a.contact_id where a.workspace_id=$1 and a.starts_at>=now()-interval '120 days' order by a.starts_at desc limit 100`,[ctx.workspaceId]).then(rows=>rows.map(r=>({domain:'agenda' as const,title:r.title,text:`Compromisso ${r.title}. Início ${r.starts_at}. Fim ${r.ends_at||'não informado'}. Status ${r.status}. Contato ${r.contact_name||'não vinculado'}.`,sourceType:'appointment',sourceId:r.id,observedAt:r.updated_at||r.starts_at}))));
  }
  const groups=await Promise.all(jobs);return groups.flat();
}

async function documentEvidence(ctx:WorkspaceContext):Promise<Evidence[]>{
  if(!hasPermission(ctx.role,ctx.permissions,'documents.read'))return [];
  const refs=await query<any>(`select id,external_ref,title,document_type,status,updated_at from document_refs where workspace_id=$1 and provider='docwallet' order by updated_at desc limit 16`,[ctx.workspaceId]);
  const results=await Promise.all(refs.map(async ref=>{
    const result=await readDocWalletIntelligence(ctx.workspaceId,String(ref.external_ref));
    if(!result?.ok)return {domain:'documents' as const,title:ref.title,text:`Documento ${ref.title}. Tipo ${ref.document_type||'não informado'}. Status ${ref.status}. Inteligência estruturada indisponível agora.`,sourceType:'document_ref',sourceId:ref.id,observedAt:ref.updated_at,metadata:{provider:'docwallet',intelligenceAvailable:false}};
    const text=structuredDocText(result.payload);
    return {domain:'documents' as const,title:ref.title,text:text||`Documento ${ref.title}. Tipo ${ref.document_type||'não informado'}.`,sourceType:'document_ref',sourceId:ref.id,observedAt:ref.updated_at,metadata:{provider:'docwallet',externalRef:ref.external_ref,intelligenceAvailable:Boolean(text)}};
  }));
  return results;
}

function answerFromEvidence(question:string,evidence:Evidence[]){
  const top=evidence.slice(0,7);if(!top.length)return `Não encontrei informação suficiente no NexOffice para responder “${compact(question,180)}”. Tente citar um cliente, contrato, tarefa, valor ou período mais específico.`;
  if(top.length===1)return `Encontrei uma evidência relevante: ${compact(top[0].text,1000)}`;
  return `Encontrei ${top.length} evidências relevantes:\n${top.map((item,index)=>`${index+1}. ${compact(item.text,650)}`).join('\n')}`;
}

export async function askBusinessMemory(ctx:WorkspaceContext,question:string){
  const terms=tokens(question);
  const [operational,documents]=await Promise.all([operationalEvidence(ctx),documentEvidence(ctx)]);
  const ranked=[...operational,...documents].map(item=>({...item,score:scoreEvidence(item,terms)})).filter(item=>(item.score||0)>0).sort((a,b)=>(b.score||0)-(a.score||0)).slice(0,12);
  const domains=[...new Set(ranked.map(x=>x.domain))];
  const best=ranked[0]?.score||0;
  const confidence=best>=10?'high':best>=5?'medium':ranked.length?'low':'insufficient';
  return{
    question,
    answer:answerFromEvidence(question,ranked),
    confidence,
    insufficientContext:ranked.length===0,
    sources:ranked.slice(0,7).map(item=>({domain:item.domain,title:item.title,sourceType:item.sourceType,sourceId:item.sourceId,observedAt:item.observedAt||null,score:item.score,metadata:item.metadata||{}})),
    evidence:ranked.slice(0,7).map(item=>({domain:item.domain,title:item.title,text:item.text,sourceType:item.sourceType,sourceId:item.sourceId})),
    coverage:{domains,crm:hasPermission(ctx.role,ctx.permissions,'crm.read'),finance:hasPermission(ctx.role,ctx.permissions,'finance.read'),agenda:hasPermission(ctx.role,ctx.permissions,'agenda.read'),documents:hasPermission(ctx.role,ctx.permissions,'documents.read')},
    privacy:{workspaceScoped:true,permissionScoped:true,rawDocumentsUsed:false,rawDocumentTextStored:false,docWalletStructuredIntelligenceOnly:true},
    engine:{retrieval:'structured_lexical_v1',externalLLMUsed:false,embeddingsUsed:false,generativeCompletionUsed:false},
    externalEffect:false
  };
}
