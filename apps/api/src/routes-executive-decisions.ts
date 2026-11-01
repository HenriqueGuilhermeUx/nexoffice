import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {workspaceContext} from './auth.js';
import {query} from './db.js';
import {auditLog} from './events.js';
import {buildExecutiveDecisionFollowup} from './executive-decision-followup.js';
import {buildDecisionEffectiveness} from './decision-effectiveness.js';

let schemaReady=false;
async function ensureExecutiveDecisionWorkspaceSchema(){
  if(schemaReady)return;
  await query(`
    create table if not exists executive_decisions (
      id uuid primary key default gen_random_uuid(),
      workspace_id uuid not null references workspaces(id) on delete cascade,
      priority_code text not null,
      priority_level text not null check(priority_level in ('info','attention','critical')),
      priority_title text not null,
      priority_detail text not null,
      selected_path_id text not null,
      selected_posture text not null check(selected_posture in ('conservative','balanced','active')),
      selected_label text not null,
      suggested_action_family text,
      rationale text not null,
      evidence_snapshot jsonb not null default '[]'::jsonb,
      comparable_cases_snapshot jsonb not null default '[]'::jsonb,
      tradeoffs_snapshot jsonb not null default '[]'::jsonb,
      risks_snapshot jsonb not null default '[]'::jsonb,
      confidence text not null check(confidence in ('low','medium','high')),
      status text not null default 'recorded' check(status in ('recorded','superseded','cancelled')),
      chosen_by uuid not null references users(id) on delete restrict,
      chosen_at timestamptz not null default now(),
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create index if not exists executive_decisions_workspace_chosen_idx
      on executive_decisions(workspace_id,chosen_at desc);
    create index if not exists executive_decisions_priority_idx
      on executive_decisions(workspace_id,priority_code,status,chosen_at desc);

    create table if not exists executive_briefing_reviews (
      id uuid primary key default gen_random_uuid(),
      workspace_id uuid not null references workspaces(id) on delete cascade,
      user_id uuid not null references users(id) on delete cascade,
      review_date date not null,
      briefing_hash text not null,
      reviewed_at timestamptz not null default now(),
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique(workspace_id,user_id,review_date)
    );
    create index if not exists executive_briefing_reviews_workspace_date_idx
      on executive_briefing_reviews(workspace_id,review_date desc);
  `);
  schemaReady=true;
}

const chooseSchema=z.object({
  priority:z.object({
    code:z.string().min(1).max(120),
    level:z.enum(['info','attention','critical']),
    title:z.string().min(1).max(240),
    detail:z.string().min(1).max(2000)
  }),
  path:z.object({
    id:z.string().min(1).max(180),
    posture:z.enum(['conservative','balanced','active']),
    label:z.string().min(1).max(160),
    suggestedActionFamily:z.string().max(160).nullable().optional(),
    confidence:z.enum(['low','medium','high']),
    tradeoffs:z.array(z.string().max(500)).max(12).default([]),
    risks:z.array(z.string().max(500)).max(12).default([]),
    evidence:z.array(z.object({
      source:z.string().max(160),
      label:z.string().max(200),
      value:z.unknown()
    })).max(20).default([]),
    comparableCases:z.array(z.object({
      contactId:z.string().nullable().optional(),
      name:z.string().nullable().optional(),
      similarityScore:z.number().min(0).max(100),
      actionType:z.string().max(180),
      sampleSize:z.number().int().min(0),
      outcomeCoveragePct:z.number().min(0).max(100),
      positiveDecisionPct:z.number().min(0).max(100),
      negativeDecisionPct:z.number().min(0).max(100),
      evidenceLevel:z.string().max(80)
    })).max(10).default([])
  }),
  rationale:z.string().trim().min(8).max(2000)
});

export async function registerExecutiveDecisionWorkspaceRoutes(app:FastifyInstance){
  await ensureExecutiveDecisionWorkspaceSchema();
  app.get('/v1/executive-decisions',async req=>{
    const ctx=await workspaceContext(req,'command.read');
    const rows=await query<any>(
      `select ed.*,u.name chosen_by_name,u.email chosen_by_email
       from executive_decisions ed
       join users u on u.id=ed.chosen_by
       where ed.workspace_id=$1
       order by ed.chosen_at desc
       limit 100`,
      [ctx.workspaceId]
    );
    return{
      decisions:rows,
      safety:{readOnly:true,externalEffects:false,automaticExecution:false}
    };
  });

  app.get('/v1/executive-decisions/followup',async req=>{
    const ctx=await workspaceContext(req,'command.read');
    return buildExecutiveDecisionFollowup(ctx.workspaceId,90);
  });

  app.get('/v1/executive-decisions/effectiveness',async req=>{
    const ctx=await workspaceContext(req,'command.read');
    const followup=await buildExecutiveDecisionFollowup(ctx.workspaceId,90);
    return buildDecisionEffectiveness(followup,3);
  });

  app.get('/v1/executive-briefing/review',async req=>{
    const ctx=await workspaceContext(req,'command.read');
    const q=z.object({date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}).parse(req.query||{});
    const rows=await query<any>(
      `select review_date::text,briefing_hash,reviewed_at,metadata
       from executive_briefing_reviews
       where workspace_id=$1 and user_id=$2 and review_date=$3::date
       limit 1`,
      [ctx.workspaceId,ctx.user.id,q.date]
    );
    return{review:rows[0]||null,safety:{readOnly:true,externalEffects:false}};
  });

  app.get('/v1/executive-briefing/history',async req=>{
    const ctx=await workspaceContext(req,'command.read');
    const q=z.object({
      before:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      limit:z.coerce.number().int().min(1).max(30).default(7)
    }).parse(req.query||{});
    const rows=await query<any>(
      `select review_date::text,briefing_hash,reviewed_at,metadata
       from executive_briefing_reviews
       where workspace_id=$1 and user_id=$2 and review_date<$3::date
       order by review_date desc,reviewed_at desc
       limit $4`,
      [ctx.workspaceId,ctx.user.id,q.before,q.limit]
    );
    return{reviews:rows,safety:{readOnly:true,externalEffects:false}};
  });

  app.post('/v1/executive-briefing/review',async req=>{
    const ctx=await workspaceContext(req,'command.decide');
    const input=z.object({
      date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      briefingHash:z.string().min(8).max(256),
      snapshot:z.object({
        priorities:z.array(z.object({
          code:z.string().max(120),
          level:z.enum(['info','attention','critical']),
          title:z.string().max(240)
        })).max(3),
        decisions:z.array(z.object({
          code:z.string().max(120),
          path:z.string().max(180).nullable()
        })).max(2),
        risk:z.object({
          code:z.string().max(120),
          level:z.enum(['info','attention','critical']),
          title:z.string().max(240)
        }).nullable(),
        overdueCount:z.number().int().min(0),
        projectedCash30Minor:z.number().nullable()
      })
    }).parse(req.body||{});
    const rows=await query<any>(
      `insert into executive_briefing_reviews(workspace_id,user_id,review_date,briefing_hash,metadata)
       values($1,$2,$3::date,$4,$5::jsonb)
       on conflict(workspace_id,user_id,review_date)
       do update set briefing_hash=excluded.briefing_hash,reviewed_at=now(),updated_at=now(),metadata=excluded.metadata
       returning review_date::text,briefing_hash,reviewed_at,metadata`,
      [ctx.workspaceId,ctx.user.id,input.date,input.briefingHash,JSON.stringify({
        source:'maya.executive_briefing',
        humanReviewed:true,
        externalEffects:false,
        snapshot:input.snapshot
      })]
    );
    await auditLog(ctx,'executive.briefing_reviewed','executive_briefing_review',`${ctx.workspaceId}:${ctx.user.id}:${input.date}`,null,rows[0],{
      reviewDate:input.date,humanReviewed:true,externalEffects:false
    });
    return{review:rows[0],safety:{humanReviewed:true,externalEffects:false,automaticExecution:false}};
  });

  app.delete('/v1/executive-briefing/review',async req=>{
    const ctx=await workspaceContext(req,'command.decide');
    const q=z.object({date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}).parse(req.query||{});
    await query(
      `delete from executive_briefing_reviews where workspace_id=$1 and user_id=$2 and review_date=$3::date`,
      [ctx.workspaceId,ctx.user.id,q.date]
    );
    await auditLog(ctx,'executive.briefing_reopened','executive_briefing_review',`${ctx.workspaceId}:${ctx.user.id}:${q.date}`,null,null,{
      reviewDate:q.date,humanReviewed:true,externalEffects:false
    });
    return{reopened:true,safety:{externalEffects:false,automaticExecution:false}};
  });

  app.post('/v1/executive-decisions',async req=>{
    const ctx=await workspaceContext(req,'command.decide');
    const input=chooseSchema.parse(req.body||{});

    const rows=await query<any>(
      `insert into executive_decisions(
        workspace_id,priority_code,priority_level,priority_title,priority_detail,
        selected_path_id,selected_posture,selected_label,suggested_action_family,
        rationale,evidence_snapshot,comparable_cases_snapshot,tradeoffs_snapshot,risks_snapshot,
        confidence,chosen_by,metadata
      ) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      returning *`,
      [
        ctx.workspaceId,
        input.priority.code,
        input.priority.level,
        input.priority.title,
        input.priority.detail,
        input.path.id,
        input.path.posture,
        input.path.label,
        input.path.suggestedActionFamily||null,
        input.rationale,
        JSON.stringify(input.path.evidence),
        JSON.stringify(input.path.comparableCases),
        JSON.stringify(input.path.tradeoffs),
        JSON.stringify(input.path.risks),
        input.path.confidence,
        ctx.user.id,
        JSON.stringify({
          source:'maya.executive_recommendation_stack',
          humanSelected:true,
          externalEffects:false,
          automaticExecution:false,
          automaticAutonomyChange:false
        })
      ]
    );

    const decision=rows[0];
    await auditLog(ctx,'executive.decision_recorded','executive_decision',String(decision.id),null,decision,{
      priorityCode:input.priority.code,
      selectedPathId:input.path.id,
      selectedPosture:input.path.posture,
      rationale:input.rationale,
      humanSelected:true,
      externalEffects:false,
      automaticExecution:false
    });

    return{
      decision,
      next:{
        executionCreated:false,
        approvalCreated:false,
        commandActionCreated:false,
        message:'A decisão foi registrada. Nenhuma ação foi criada ou executada automaticamente.'
      },
      safety:{
        humanSelected:true,
        externalEffects:false,
        automaticExecution:false,
        automaticPolicyChange:false,
        automaticAutonomyChange:false
      }
    };
  });
}
