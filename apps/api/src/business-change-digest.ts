import {query} from './db.js';

type ChangeItem={kind:'operation'|'document'|'backup';title:string;detail:string;occurredAt:string;target:'command'|'documents'|'security'};

function humanEvent(type:string,count:number){const map:Record<string,string>={
  'lead.created':'Novo lead registrado','payment.received':'Pagamento recebido','appointment.cancelled':'Compromisso cancelado','document.signed':'Documento assinado','deal.created':'Nova oportunidade registrada','task.completed':'Tarefa concluída'
};const base=map[type]||type.replace(/[._-]+/g,' ');return count>1?`${count}× ${base}`:base}

export async function getBusinessChangeDigest(workspaceId:string,hours=24){
  const safeHours=Math.max(1,Math.min(168,Math.round(hours||24)));
  const [events,documents,backups]=await Promise.all([
    query<any>(`select type,count(*)::int count,max(occurred_at) latest from business_events where workspace_id=$1 and occurred_at>=now()-($2::text||' hours')::interval group by type order by latest desc limit 8`,[workspaceId,safeHours]),
    query<any>(`select id,title,document_type,status,updated_at from document_refs where workspace_id=$1 and updated_at>=now()-($2::text||' hours')::interval order by updated_at desc limit 6`,[workspaceId,safeHours]),
    query<any>(`select r.id,r.status,r.verification_status,r.finished_at,r.created_at,p.name profile_name from backup_runs r left join backup_profiles p on p.id=r.profile_id where r.workspace_id=$1 and r.created_at>=now()-($2::text||' hours')::interval order by r.created_at desc limit 4`,[workspaceId,safeHours]).catch(()=>[])
  ]);
  const items:ChangeItem[]=[];
  for(const e of events)items.push({kind:'operation',title:humanEvent(String(e.type),Number(e.count||1)),detail:`${Number(e.count||1)} ocorrência(s) registrada(s) no período.`,occurredAt:new Date(e.latest).toISOString(),target:'command'});
  for(const d of documents)items.push({kind:'document',title:`Documento atualizado · ${d.title}`,detail:`${d.document_type||'Documento'} · status ${d.status}.`,occurredAt:new Date(d.updated_at).toISOString(),target:'documents'});
  for(const b of backups)items.push({kind:'backup',title:b.status==='success'?'Backup concluído':b.status==='failed'?'Backup precisa de atenção':'Backup iniciado',detail:`${b.profile_name||'Backup principal'} · verificação ${b.verification_status||'pendente'}.`,occurredAt:new Date(b.finished_at||b.created_at).toISOString(),target:'security'});
  items.sort((a,b)=>new Date(b.occurredAt).getTime()-new Date(a.occurredAt).getTime());
  const trimmed=items.slice(0,8);return{windowHours:safeHours,count:trimmed.length,items:trimmed,summary:trimmed.length?`${trimmed.length} mudança${trimmed.length===1?'':'s'} relevante${trimmed.length===1?'':'s'} nas últimas ${safeHours}h.`:`Sem mudança operacional relevante registrada nas últimas ${safeHours}h.`,privacy:{rawDocumentsIncluded:false,eventPayloadsIncluded:false,backupContentsIncluded:false},externalEffect:false};
}
