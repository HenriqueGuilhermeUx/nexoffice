import {randomUUID} from 'node:crypto';
import type {BusinessEvent} from '@nexoffice/domain';
import {query} from './db.js';
import {processBusinessEvent} from './orchestrator.js';

export async function emitBusinessEvent(workspaceId:string,type:string,source:string,subjectType:string|null,subjectId:string|null,payload:Record<string,unknown>,correlationId:string|null=null){
  const id=randomUUID();const occurredAt=new Date().toISOString();
  const rows=await query<any>(`insert into business_events(id,workspace_id,type,source,subject_type,subject_id,payload,correlation_id,occurred_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,[id,workspaceId,type,source,subjectType,subjectId,JSON.stringify(payload),correlationId,occurredAt]);
  await projectEvent(workspaceId,type,subjectType,subjectId,payload).catch(()=>null);
  const event:BusinessEvent={id,workspaceId,type,source,subjectType,subjectId,payload,correlationId,occurredAt};
  const action=await processBusinessEvent(event).catch(error=>({error:error instanceof Error?error.message:String(error)}));
  return {event:rows[0],action};
}

async function projectEvent(workspaceId:string,type:string,subjectType:string|null,subjectId:string|null,payload:Record<string,unknown>){
  if(type==='payment.received'&&subjectType==='ledger_entry'&&subjectId){
    await query(`update collection_attempts set status='paid',updated_at=now() where workspace_id=$1 and ledger_entry_id=$2 and status not in ('paid','cancelled')`,[workspaceId,subjectId]);
  }
  if(type==='document.signed'&&subjectId){
    await query(`update document_refs set status='signed',signature_status='signed',last_synced_at=now(),sync_error=null,updated_at=now() where workspace_id=$1 and id=$2`,[workspaceId,subjectId]);
  }
  if(type==='document.analysis_completed'&&subjectId){
    await query(`update document_refs set intelligence_status='completed',last_synced_at=now(),sync_error=null,metadata=metadata||$3::jsonb,updated_at=now() where workspace_id=$1 and id=$2`,[workspaceId,subjectId,JSON.stringify({intelligenceSummary:payload.summary||null,intelligenceFields:payload.fields||null})]);
  }
}

export async function auditLog(ctx:{workspaceId:string;user:{id:string}},action:string,subjectType:string,subjectId:string,before:unknown,after:unknown,metadata:Record<string,unknown>={}){
  await query(`insert into audit_log(workspace_id,actor_type,actor_ref,action,subject_type,subject_id,before_state,after_state,metadata) values($1,'user',$2,$3,$4,$5,$6,$7,$8)`,[ctx.workspaceId,ctx.user.id,action,subjectType,subjectId,before?JSON.stringify(before):null,after?JSON.stringify(after):null,JSON.stringify(metadata)]).catch(()=>null);
}

export async function financeSummary(workspaceId:string){
  const rows=await query<any>(`select coalesce(sum(amount_minor) filter(where direction='income' and status='paid'),0)::bigint income_paid_minor,coalesce(sum(amount_minor) filter(where direction='expense' and status='paid'),0)::bigint expense_paid_minor,coalesce(sum(amount_minor) filter(where direction='income' and status in ('open','overdue')),0)::bigint receivable_minor,coalesce(sum(amount_minor) filter(where direction='expense' and status in ('open','overdue')),0)::bigint payable_minor,count(*) filter(where status='overdue')::int overdue_count from ledger_entries where workspace_id=$1`,[workspaceId]);
  return rows[0];
}

export function advanceRecurrence(date:Date,frequency:string,count:number){const next=new Date(date);if(frequency==='weekly')next.setUTCDate(next.getUTCDate()+7*count);else if(frequency==='yearly')next.setUTCFullYear(next.getUTCFullYear()+count);else next.setUTCMonth(next.getUTCMonth()+count);return next}
