import type {FastifyInstance,FastifyRequest} from 'fastify';
import {randomBytes} from 'node:crypto';
import {z} from 'zod';
import {ApiError,hashOpaqueToken,workspaceContext} from './auth.js';
import {query,transaction} from './db.js';
import {auditLog} from './events.js';

const createAgentSchema=z.object({
  name:z.string().trim().min(2).max(120).default('Computador principal'),
  sourceLabels:z.array(z.string().trim().min(1).max(160)).max(20).default([]),
  targetLabel:z.string().trim().min(1).max(160).optional().nullable(),
  scheduleLabel:z.string().trim().min(1).max(80).default('Diário')
}).strict();
const heartbeatSchema=z.object({hostname:z.string().trim().max(200).optional().nullable(),platform:z.string().trim().max(120).optional().nullable(),resticVersion:z.string().trim().max(80).optional().nullable(),capabilities:z.record(z.string(),z.unknown()).optional()}).strict();
const runSchema=z.object({profileId:z.string().uuid(),runRef:z.string().trim().min(4).max(120),status:z.enum(['started','success','failed']),snapshotId:z.string().trim().max(200).optional().nullable(),filesNew:z.number().int().min(0).optional().nullable(),filesChanged:z.number().int().min(0).optional().nullable(),filesUnmodified:z.number().int().min(0).optional().nullable(),bytesAdded:z.number().int().min(0).optional().nullable(),verificationStatus:z.enum(['ok','warning','failed']).optional().nullable(),errorCode:z.string().trim().max(120).optional().nullable(),startedAt:z.string().datetime().optional().nullable(),finishedAt:z.string().datetime().optional().nullable()}).strict();

function ownerOnly(ctx:any){if(!['owner','admin'].includes(String(ctx.role)))throw new ApiError(403,'owner_or_admin_required','Somente proprietário ou administrador pode configurar o backup.');}
function agentToken(req:FastifyRequest){const direct=req.headers['x-backup-agent-token'];const value=Array.isArray(direct)?direct[0]:direct;if(!value)throw new ApiError(401,'backup_agent_token_required','Token do agente de backup necessário.');return String(value).trim();}
async function authenticateAgent(req:FastifyRequest){const hash=hashOpaqueToken(agentToken(req));const row=(await query<any>(`select a.id,a.workspace_id,a.name,a.status from backup_agents a join workspaces w on w.id=a.workspace_id where a.token_hash=$1 and a.status='active' limit 1`,[hash]))[0];if(!row)throw new ApiError(401,'invalid_backup_agent','Agente de backup inválido ou revogado.');return row;}
function publicAgent(row:any){return{id:row.id,name:row.name,status:row.status,hostname:row.hostname||null,platform:row.platform||null,resticVersion:row.restic_version||null,lastSeenAt:row.last_seen_at||null,createdAt:row.created_at};}
function publicProfile(row:any){return{id:row.id,agentId:row.agent_id||null,name:row.name,status:row.status,sourceLabels:row.source_labels||[],targetKind:row.target_kind,targetLabel:row.target_label||null,scheduleLabel:row.schedule_label,retentionLabel:row.retention_label||null,lastSnapshotId:row.last_snapshot_id||null,lastBackupAt:row.last_backup_at||null,lastVerifiedAt:row.last_verified_at||null,verificationStatus:row.verification_status||null,updatedAt:row.updated_at};}

export async function registerBackupSecurityRoutes(app:FastifyInstance){
  app.get('/v1/security/backups',async req=>{
    const ctx=await workspaceContext(req,'workspace.read');
    const [agents,profiles,runs]=await Promise.all([
      query<any>(`select * from backup_agents where workspace_id=$1 order by created_at desc`,[ctx.workspaceId]),
      query<any>(`select * from backup_profiles where workspace_id=$1 order by updated_at desc`,[ctx.workspaceId]),
      query<any>(`select id,agent_id,profile_id,run_ref,status,snapshot_id,files_new,files_changed,files_unmodified,bytes_added,verification_status,error_summary,started_at,finished_at,created_at from backup_runs where workspace_id=$1 order by created_at desc limit 30`,[ctx.workspaceId])
    ]);
    return{agents:agents.map(publicAgent),profiles:profiles.map(publicProfile),runs:runs.map(r=>({id:r.id,agentId:r.agent_id,profileId:r.profile_id,runRef:r.run_ref,status:r.status,snapshotId:r.snapshot_id||null,filesNew:r.files_new??null,filesChanged:r.files_changed??null,filesUnmodified:r.files_unmodified??null,bytesAdded:r.bytes_added??null,verificationStatus:r.verification_status||null,errorCode:r.error_summary||null,startedAt:r.started_at||null,finishedAt:r.finished_at||null,createdAt:r.created_at})),policy:{customerOwnedStorage:true,repositoryCredentialsStoredInNexOffice:false,resticPasswordStoredInNexOffice:false,backupBytesStoredInNexOffice:false,remoteExecution:false},externalEffect:false};
  });

  app.post('/v1/security/backups/agents',async req=>{
    const ctx=await workspaceContext(req,'workspace.read');ownerOnly(ctx);const input=createAgentSchema.parse(req.body||{});const token=`nxbak_${randomBytes(32).toString('base64url')}`;const tokenHash=hashOpaqueToken(token);
    const created=await transaction(async client=>{const agent=(await client.query(`insert into backup_agents(workspace_id,name,token_hash,created_by) values($1,$2,$3,$4) returning *`,[ctx.workspaceId,input.name,tokenHash,ctx.user.id])).rows[0];const profile=(await client.query(`insert into backup_profiles(workspace_id,agent_id,name,status,source_labels,target_kind,target_label,schedule_label,created_by) values($1,$2,'Backup principal','setup',$3,'customer_owned',$4,$5,$6) returning *`,[ctx.workspaceId,agent.id,input.sourceLabels,input.targetLabel||null,input.scheduleLabel,ctx.user.id])).rows[0];return{agent,profile}});
    await auditLog(ctx,'security.backup.agent_created','backup_agent',created.agent.id,null,{agentId:created.agent.id,profileId:created.profile.id,sourceCount:input.sourceLabels.length,customerOwnedStorage:true,secretReturnedOnce:true},{externalEffect:false});
    return{agent:publicAgent(created.agent),profile:publicProfile(created.profile),pairing:{token,tokenShownOnce:true,profileId:created.profile.id},policy:{keepRepositoryCredentialsOnAgent:true,keepResticPasswordOnAgent:true,remoteExecution:false},externalEffect:false};
  });

  app.post('/v1/security/backups/agents/:id/revoke',async req=>{
    const ctx=await workspaceContext(req,'workspace.read');ownerOnly(ctx);const id=z.string().uuid().parse((req.params as any).id);const before=(await query<any>(`select * from backup_agents where id=$1 and workspace_id=$2`,[id,ctx.workspaceId]))[0];if(!before)throw new ApiError(404,'backup_agent_not_found','Agente não encontrado.');const after=(await query<any>(`update backup_agents set status='revoked',updated_at=now() where id=$1 and workspace_id=$2 returning *`,[id,ctx.workspaceId]))[0];await auditLog(ctx,'security.backup.agent_revoked','backup_agent',id,{status:before.status},{status:'revoked'},{externalEffect:false});return{agent:publicAgent(after),externalEffect:false};
  });

  app.post('/v1/security/backups/agent/heartbeat',async req=>{
    const agent=await authenticateAgent(req);const input=heartbeatSchema.parse(req.body||{});await query(`update backup_agents set hostname=$2,platform=$3,restic_version=$4,capabilities=$5,last_seen_at=now(),updated_at=now() where id=$1`,[agent.id,input.hostname||null,input.platform||null,input.resticVersion||null,JSON.stringify(input.capabilities||{})]);return{ok:true,agentId:agent.id,workspaceId:agent.workspace_id,serverTime:new Date().toISOString()};
  });

  app.post('/v1/security/backups/agent/runs',async req=>{
    const agent=await authenticateAgent(req);const input=runSchema.parse(req.body||{});const profile=(await query<any>(`select * from backup_profiles where id=$1 and workspace_id=$2 and agent_id=$3`,[input.profileId,agent.workspace_id,agent.id]))[0];if(!profile)throw new ApiError(404,'backup_profile_not_found','Perfil de backup não pertence a este agente.');
    const errorCode=input.status==='failed'?String(input.errorCode||'backup_failed').replace(/[^a-zA-Z0-9_.-]/g,'').slice(0,120):null;
    const run=(await query<any>(`insert into backup_runs(workspace_id,agent_id,profile_id,run_ref,status,snapshot_id,files_new,files_changed,files_unmodified,bytes_added,verification_status,error_summary,started_at,finished_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) on conflict(agent_id,run_ref) do update set status=excluded.status,snapshot_id=excluded.snapshot_id,files_new=excluded.files_new,files_changed=excluded.files_changed,files_unmodified=excluded.files_unmodified,bytes_added=excluded.bytes_added,verification_status=excluded.verification_status,error_summary=excluded.error_summary,started_at=coalesce(backup_runs.started_at,excluded.started_at),finished_at=excluded.finished_at returning *`,[agent.workspace_id,agent.id,input.profileId,input.runRef,input.status,input.snapshotId||null,input.filesNew??null,input.filesChanged??null,input.filesUnmodified??null,input.bytesAdded??null,input.verificationStatus||null,errorCode,input.startedAt||null,input.finishedAt||null]))[0];
    if(input.status==='success')await query(`update backup_profiles set status='active',last_snapshot_id=$2,last_backup_at=coalesce($3::timestamptz,now()),last_verified_at=case when $4='ok' then coalesce($3::timestamptz,now()) else last_verified_at end,verification_status=$4,updated_at=now() where id=$1`,[input.profileId,input.snapshotId||null,input.finishedAt||null,input.verificationStatus||null]);
    if(input.status==='failed')await query(`update backup_profiles set status='attention',verification_status=coalesce($2,verification_status),updated_at=now() where id=$1`,[input.profileId,input.verificationStatus||'failed']);
    return{ok:true,runId:run.id,status:run.status,externalEffect:false};
  });
}
