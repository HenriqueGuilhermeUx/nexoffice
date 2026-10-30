import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {workspaceContext} from './auth.js';
import {query} from './db.js';
import {auditLog} from './events.js';

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
