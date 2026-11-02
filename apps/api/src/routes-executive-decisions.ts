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

    create table if not exists executive_decision_plans (
      id uuid primary key default gen_random_uuid(),
      workspace_id uuid not null references workspaces(id) on delete cascade,
      decision_id uuid not null references executive_decisions(id) on delete cascade,
      status text not null default 'draft' check(status in ('draft','archived')),
      objective text not null,
      steps jsonb not null default '[]'::jsonb,
      checkpoints jsonb not null default '[]'::jsonb,
      followup_days int not null default 7 check(followup_days between 1 and 90),
      created_by uuid not null references users(id) on delete restrict,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique(workspace_id,decision_id)
    );
    create index if not exists executive_decision_plans_workspace_idx
      on executive_decision_plans(workspace_id,created_at desc);
  `);
  schemaReady=true;
}

function buildDecisionPlan(decision:any){
  const actionFamily=String(decision.suggested_action_family||'executive.review');
  const posture=String(decision.selected_posture||'balanced');
  const followupDays=posture==='active'?3:posture==='conservative'?14:7;
  const urgency=posture==='active'?'curto prazo':posture==='conservative'?'após validação adicional':'com controle';
  const steps=[
    {
      position:1,
      title:'Confirmar objetivo e critério de sucesso',
      detail:`Traduzir a decisão “${decision.selected_label}” em um resultado observável e definir quem acompanha.`,
      mode:'draft_only',
      requiresHumanAction:true,
      externalEffect:false
    },
    {
      position:2,
      title:'Preparar a ação correspondente',
      detail:`Montar o próximo passo da família ${actionFamily}, ${urgency}, sem disparar nenhuma ação externa.`,
      mode:'draft_only',
      requiresHumanAction:true,
      externalEffect:false
    },
    {
      position:3,
      title:'Checar riscos e trade-offs antes de agir',
      detail:'Revisar os riscos registrados na decisão, limites operacionais e evidências que ainda podem mudar a escolha.',
      mode:'human_review',
      requiresHumanAction:true,
      externalEffect:false
    },
    {
      position:4,
      title:'Acompanhar sinais posteriores',
      detail:`Revisar o contexto após ${followupDays} dia(s) e registrar apenas resultados observados, sem inferir causalidade automaticamente.`,
      mode:'followup',
      requiresHumanAction:true,
      externalEffect:false
    }
  ];
  const checkpoints=[
    {code:'owner_defined',label:'Responsável definido',required:true},
    {code:'success_criterion_defined',label:'Critério de sucesso definido',required:true},
    {code:'risk_reviewed',label:'Riscos revisados',required:true},
    {code:'external_effects_confirmed',label:'Qualquer efeito externo exige ação humana separada',required:true}
  ];
  return{
    objective:`Executar com governança a decisão “${decision.selected_label}” para a prioridade “${decision.priority_title}”.`,
    steps,
    checkpoints,
    followupDays,
    metadata:{
      source:'maya.executive_decision_plan',
      posture,
      actionFamily,
      draftOnly:true,
      humanReviewRequired:true,
      externalEffects:false,
      automaticExecution:false,
      commandActionCreated:false,
      approvalCreated:false
    }
  };
}

async function ensureDecisionPlan(ctx:any,decision:any){
  const draft=buildDecisionPlan(decision);
  const rows=await query<any>(
    `insert into executive_decision_plans(
      workspace_id,decision_id,objective,steps,checkpoints,followup_days,created_by,metadata
    ) values($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8::jsonb)
    on conflict(workspace_id,decision_id) do update
      set objective=excluded.objective,
          steps=excluded.steps,
          checkpoints=excluded.checkpoints,
          followup_days=excluded.followup_days,
          metadata=excluded.metadata,
          updated_at=now()
    returning *`,
    [
      ctx.workspaceId,
      decision.id,
      draft.objective,
      JSON.stringify(draft.steps),
      JSON.stringify(draft.checkpoints),
      draft.followupDays,
      ctx.user.id,
      JSON.stringify(draft.metadata)
    ]
  );
  const plan=rows[0];
  await auditLog(ctx,'executive.decision_plan_prepared','executive_decision_plan',String(plan.id),null,plan,{
    decisionId:decision.id,
    draftOnly:true,
    humanReviewRequired:true,
    externalEffects:false,
    automaticExecution:false
  });
  return plan;
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
      `select ed.*,u.name chosen_by_name,u.email chosen_by_email,
              p.id plan_id,p.status plan_status,p.objective plan_objective,
              p.steps plan_steps,p.checkpoints plan_checkpoints,p.followup_days plan_followup_days
       from executive_decisions ed
       join users u on u.id=ed.chosen_by
       left join executive_decision_plans p on p.workspace_id=ed.workspace_id and p.decision_id=ed.id
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

  app.get('/v1/executive-decisions/:id/plan',async req=>{
    const ctx=await workspaceContext(req,'command.read');
    const id=z.string().uuid().parse((req.params as any).id);
    const rows=await query<any>(
      `select p.*
       from executive_decision_plans p
       join executive_decisions d on d.id=p.decision_id and d.workspace_id=p.workspace_id
       where p.workspace_id=$1 and p.decision_id=$2
       limit 1`,
      [ctx.workspaceId,id]
    );
    return{
      plan:rows[0]||null,
      safety:{draftOnly:true,externalEffects:false,automaticExecution:false,commandActionCreated:false}
    };
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
    const plan=await ensureDecisionPlan(ctx,decision);
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
      plan,
      next:{
        executionCreated:false,
        approvalCreated:false,
        commandActionCreated:false,
        draftPlanCreated:true,
        message:'A decisão foi registrada e um plano interno em rascunho foi preparado. Nenhuma ação foi criada ou executada automaticamente.'
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
