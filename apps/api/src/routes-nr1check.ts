import type {FastifyInstance} from 'fastify';
import {workspaceContext} from './auth.js';
import {query} from './db.js';
import {auditLog} from './events.js';

const defaultWebUrl='https://nr1check.netlify.app';

function nr1checkBaseUrl(){return String(process.env.NR1CHECK_WEB_URL||defaultWebUrl).trim().replace(/\/$/,'')}

export async function registerNr1CheckRoutes(app:FastifyInstance){
  app.get('/v1/ecosystem/nr1check',async req=>{
    const ctx=await workspaceContext(req,'integrations.read');
    const [workspace]=await query<any>(`select name,vertical from workspaces where id=$1 limit 1`,[ctx.workspaceId]);
    return {
      product:'NR1Check',
      suite:'MindCompliance',
      status:'available',
      workspaceId:ctx.workspaceId,
      businessName:String(workspace?.name||ctx.workspaceName||''),
      vertical:String(workspace?.vertical||'general'),
      capabilities:[
        'Diagnóstico e organização da NR-1',
        'GRO/PGR e inventário de riscos',
        'Plano de ação, responsáveis, prazos e evidências',
        'Avaliação psicossocial com leitura agregada',
        'Documentos e acompanhamento contínuo de compliance'
      ],
      access:{mode:'separate_auth',sso:false,cnpjRequiredForCompanyOnboarding:true},
      privacy:{
        sharedWithNr1Check:['workspaceRef','businessName','sector'],
        neverSharedByThisBridge:['employeeData','cpf','healthData','psychosocialResponses','complaints','medicalData','rawDocuments'],
        note:'Dados individuais, denúncias e respostas psicossociais permanecem no NR1Check/MindCompliance e não são copiados para o NexOffice.'
      },
      externalEffect:false
    };
  });

  app.post('/v1/ecosystem/nr1check/launch',async req=>{
    const ctx=await workspaceContext(req,'integrations.read');
    const [workspace]=await query<any>(`select name,vertical from workspaces where id=$1 limit 1`,[ctx.workspaceId]);
    const params=new URLSearchParams({
      source:'nexoffice',
      workspaceRef:ctx.workspaceId,
      businessName:String(workspace?.name||ctx.workspaceName||'').slice(0,180),
      sector:String(workspace?.vertical||'general').slice(0,120)
    });
    const url=`${nr1checkBaseUrl()}/nexoffice?${params.toString()}`;
    await auditLog(ctx,'ecosystem.nr1check.launch.prepared','external_product','nr1check',null,{externalEffect:false,sharedFields:['workspaceRef','businessName','sector'],sensitiveDataShared:false});
    return {url,product:'NR1Check',suite:'MindCompliance',externalEffect:false,sharedFields:['workspaceRef','businessName','sector'],sso:false};
  });
}
