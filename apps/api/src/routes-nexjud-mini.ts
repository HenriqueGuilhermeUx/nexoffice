import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {ApiError,workspaceContext} from './auth.js';
import {query} from './db.js';
import {auditLog} from './events.js';

function enabled(){return String(process.env.NEXOFFICE_NEXJUD_MINI_ENABLED||'false').toLowerCase()==='true'}
function baseUrl(){return String(process.env.NEXJUD_BASE_URL||'').replace(/\/$/,'')}
function key(){return String(process.env.NEXJUD_MINI_KEY||'').trim()}

export async function registerNexJudMiniRoutes(app:FastifyInstance){
  app.get('/v1/legal/mini/status',async req=>{
    await workspaceContext(req,'workspace.read');
    return {enabled:enabled(),configured:Boolean(baseUrl()&&key()),provider:'nexjud',persistence:'none',defaultContext:'workspace_summary_only',externalEffects:false};
  });

  app.post('/v1/legal/mini',async req=>{
    const ctx=await workspaceContext(req,'workspace.read');
    if(!enabled())throw new ApiError(409,'nexjud_mini_disabled','NexJud Mini ainda não está habilitado neste ambiente.');
    if(!baseUrl()||!key())throw new ApiError(503,'nexjud_mini_not_configured','NexJud Mini ainda não está configurado no servidor.');
    const input=z.object({question:z.string().trim().min(4).max(6000),mode:z.enum(['question','light_analysis']).default('question'),includeBusinessContext:z.boolean().default(false)}).parse(req.body);
    let contextSummary='';
    if(input.includeBusinessContext){
      const workspace=(await query<any>(`select name,vertical,plan,currency,timezone from workspaces where id=$1`,[ctx.workspaceId]))[0];
      if(workspace)contextSummary=`Empresa: ${workspace.name}. Vertical: ${workspace.vertical}. Plano operacional: ${workspace.plan}. Moeda: ${workspace.currency}. Fuso: ${workspace.timezone}. Nenhum cliente, documento, processo, dado financeiro detalhado ou texto jurídico foi compartilhado.`;
    }
    let response:Response;
    try{
      response=await fetch(`${baseUrl()}/api/internal/nexoffice/mini`,{method:'POST',headers:{'content-type':'application/json',accept:'application/json','x-nexoffice-key':key()},body:JSON.stringify({question:input.question,mode:input.mode,contextSummary,workspaceRef:ctx.workspaceId}),signal:AbortSignal.timeout(35_000)});
    }catch(error){throw new ApiError(502,'nexjud_mini_unreachable',error instanceof Error?error.message:'Não foi possível acessar o NexJud Mini.');}
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new ApiError(response.status>=400&&response.status<600?response.status:502,String(payload?.error||'nexjud_mini_failed'),String(payload?.message||payload?.error||'NexJud Mini indisponível.'));
    await auditLog(ctx,'nexjud.mini.asked','workspace',ctx.workspaceId,null,{mode:input.mode,businessContextShared:Boolean(contextSummary),questionLength:input.question.length,externalEffects:false,legalTextPersisted:false});
    return {...payload,persistence:'none',questionPersisted:false,businessContextShared:Boolean(contextSummary)};
  });
}
