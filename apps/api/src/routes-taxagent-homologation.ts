import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {ApiError,workspaceContext} from './auth.js';
import {query} from './db.js';
import {auditLog} from './events.js';

const uuid=z.string().uuid();
const registrationContext=z.enum(['available','not_applicable','unavailable','unknown']);
const status=z.enum(['planned','ready','blocked','passed','failed','skipped']);
const safeReferenceValue=z.union([z.string().trim().max(200),z.null()]);

const createInput=z.object({
  operationId:uuid.nullable().optional(),
  municipalityName:z.string().trim().min(2).max(160),
  municipalityIbge:z.string().regex(/^\d{7}$/),
  providerHint:z.string().trim().max(160).nullable().optional(),
  municipalRegistrationContext:registrationContext.default('unknown'),
  integrationPath:z.string().trim().max(200).nullable().optional(),
  scenarioLabel:z.string().trim().min(3).max(240),
  notes:z.string().trim().max(3000).nullable().optional()
});

const resultInput=z.object({
  status:status.refine(value=>['ready','blocked','passed','failed','skipped'].includes(value)),
  resultCode:z.string().trim().max(120).nullable().optional(),
  resultMessage:z.string().trim().max(2000).nullable().optional(),
  safeReferences:z.object({accessKey:safeReferenceValue.optional(),providerReference:safeReferenceValue.optional()}).strict().default({}),
  evidence:z.record(z.string().trim().min(1).max(80),z.union([z.string().trim().max(500),z.number().finite(),z.boolean(),z.null()])).default({}),
  notes:z.string().trim().max(3000).nullable().optional()
});

export async function registerTaxAgentHomologationRoutes(app:FastifyInstance){
  app.get('/v1/fiscal/homologation/cases',async req=>{
    const ctx=await workspaceContext(req,'workspace.read');
    const cases=await query<any>(`select id,operation_id,municipality_name,municipality_ibge,provider_hint,municipal_registration_context,integration_path,scenario_label,status,environment,result_code,result_message,safe_references,evidence,notes,created_at,updated_at
      from taxagent_homologation_cases where workspace_id=$1 order by created_at desc`,[ctx.workspaceId]);
    const summary=cases.reduce((acc:any,item:any)=>{acc.total++;acc.byStatus[item.status]=(acc.byStatus[item.status]||0)+1;acc.byMunicipality[item.municipality_ibge]=(acc.byMunicipality[item.municipality_ibge]||0)+1;return acc},{total:0,byStatus:{},byMunicipality:{}});
    return {cases,summary,policy:{environment:'test',executionAvailable:false,manualEvidenceOnly:true,productionEnabled:false,municipalRegistrationUniversallyRequired:false},externalEffect:false};
  });

  app.post('/v1/fiscal/homologation/cases',async req=>{
    const ctx=await workspaceContext(req,'workspace.write');
    const input=createInput.parse(req.body||{});
    if(input.operationId){
      const operation=(await query<any>(`select id from business_operations where id=$1 and workspace_id=$2`,[input.operationId,ctx.workspaceId]))[0];
      if(!operation)throw new ApiError(404,'operation_not_found','Operação não encontrada neste workspace.');
    }
    const rows=await query<any>(`insert into taxagent_homologation_cases(workspace_id,operation_id,municipality_name,municipality_ibge,provider_hint,municipal_registration_context,integration_path,scenario_label,status,environment,notes,recorded_by)
      values($1,$2,$3,$4,$5,$6,$7,$8,'planned','test',$9,$10)
      returning id,operation_id,municipality_name,municipality_ibge,provider_hint,municipal_registration_context,integration_path,scenario_label,status,environment,result_code,result_message,safe_references,evidence,notes,created_at,updated_at`,[ctx.workspaceId,input.operationId||null,input.municipalityName,input.municipalityIbge,input.providerHint||null,input.municipalRegistrationContext,input.integrationPath||null,input.scenarioLabel,input.notes||null,ctx.userId]);
    await auditLog(ctx,'taxagent.homologation_case.created','taxagent_homologation_case',rows[0].id,null,{municipalityIbge:input.municipalityIbge,municipalRegistrationContext:input.municipalRegistrationContext,environment:'test',executionAvailable:false,externalEffect:false});
    return {case:rows[0],policy:{executionAvailable:false,productionEnabled:false},externalEffect:false};
  });

  app.patch('/v1/fiscal/homologation/cases/:id/result',async req=>{
    const ctx=await workspaceContext(req,'workspace.write');
    const id=uuid.parse((req.params as any).id),input=resultInput.parse(req.body||{});
    const existing=(await query<any>(`select id from taxagent_homologation_cases where id=$1 and workspace_id=$2`,[id,ctx.workspaceId]))[0];
    if(!existing)throw new ApiError(404,'homologation_case_not_found','Caso de homologação não encontrado.');
    const rows=await query<any>(`update taxagent_homologation_cases set status=$3,result_code=$4,result_message=$5,safe_references=$6::jsonb,evidence=$7::jsonb,notes=coalesce($8,notes),updated_at=now()
      where id=$1 and workspace_id=$2
      returning id,operation_id,municipality_name,municipality_ibge,provider_hint,municipal_registration_context,integration_path,scenario_label,status,environment,result_code,result_message,safe_references,evidence,notes,created_at,updated_at`,[id,ctx.workspaceId,input.status,input.resultCode||null,input.resultMessage||null,JSON.stringify(input.safeReferences),JSON.stringify(input.evidence),input.notes||null]);
    await auditLog(ctx,'taxagent.homologation_case.result_recorded','taxagent_homologation_case',id,null,{status:input.status,resultCode:input.resultCode||null,safeReferenceKeys:Object.keys(input.safeReferences),evidenceKeys:Object.keys(input.evidence),rawFiscalPayloadLogged:false,credentialLogged:false,externalEffect:false});
    return {case:rows[0],policy:{manualEvidenceOnly:true,executionAvailable:false,productionEnabled:false},externalEffect:false};
  });
}
