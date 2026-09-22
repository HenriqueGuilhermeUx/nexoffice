import type {FastifyInstance} from 'fastify';
import {ApiError,workspaceContext} from './auth.js';
import {query} from './db.js';
import {auditLog} from './events.js';
import {AGENT_ROLES,CAPABILITY_REGISTRY,capabilitiesForRole,capabilityDefinition} from './capability-registry.js';
import {providerCatalog} from './integration-runtime.js';

type IntegrationState={provider:string;status:string;last_health_status?:string|null;last_health_at?:string|null;last_error?:string|null};
const defaultNr1CheckWebUrl='https://nr1check.netlify.app';
function nr1checkBaseUrl(){return String(process.env.NR1CHECK_WEB_URL||defaultNr1CheckWebUrl).trim().replace(/\/$/,'')}

export async function registerCapabilityRoutes(app:FastifyInstance){
  app.get('/v1/capabilities',async req=>{
    const ctx=await workspaceContext(req,'integrations.read');
    return workspaceCapabilityGraph(ctx.workspaceId);
  });

  app.get('/v1/capabilities/:id',async req=>{
    const ctx=await workspaceContext(req,'integrations.read');
    const id=decodeURIComponent(String((req.params as any).id||''));
    if(!capabilityDefinition(id))throw new ApiError(404,'capability_not_found','Capability não encontrada.');
    const graph=await workspaceCapabilityGraph(ctx.workspaceId);
    return graph.capabilities.find(item=>item.id===id);
  });

  app.get('/v1/ecosystem/nr1check',async req=>{
    const ctx=await workspaceContext(req,'integrations.read');
    const [workspace]=await query<any>(`select name,vertical from workspaces where id=$1 limit 1`,[ctx.workspaceId]);
    return {
      product:'NR1Check',suite:'MindCompliance',status:'available',workspaceId:ctx.workspaceId,
      businessName:String(workspace?.name||ctx.workspaceName||''),vertical:String(workspace?.vertical||'general'),
      capabilities:['Diagnóstico e organização da NR-1','GRO/PGR e inventário de riscos','Plano de ação, responsáveis, prazos e evidências','Avaliação psicossocial com leitura agregada','Documentos e acompanhamento contínuo de compliance'],
      access:{mode:'separate_auth',sso:false,cnpjRequiredForCompanyOnboarding:true},
      privacy:{sharedWithNr1Check:['workspaceRef','businessName','sector'],neverSharedByThisBridge:['employeeData','cpf','healthData','psychosocialResponses','complaints','medicalData','rawDocuments'],note:'Dados individuais, denúncias e respostas psicossociais permanecem no NR1Check/MindCompliance e não são copiados para o NexOffice.'},
      externalEffect:false
    };
  });

  app.post('/v1/ecosystem/nr1check/launch',async req=>{
    const ctx=await workspaceContext(req,'integrations.read');
    const [workspace]=await query<any>(`select name,vertical from workspaces where id=$1 limit 1`,[ctx.workspaceId]);
    const params=new URLSearchParams({source:'nexoffice',workspaceRef:ctx.workspaceId,businessName:String(workspace?.name||ctx.workspaceName||'').slice(0,180),sector:String(workspace?.vertical||'general').slice(0,120)});
    const url=`${nr1checkBaseUrl()}/nexoffice?${params.toString()}`;
    await auditLog(ctx,'ecosystem.nr1check.launch.prepared','external_product','nr1check',null,{externalEffect:false,sharedFields:['workspaceRef','businessName','sector'],sensitiveDataShared:false});
    return {url,product:'NR1Check',suite:'MindCompliance',externalEffect:false,sharedFields:['workspaceRef','businessName','sector'],sso:false};
  });
}

export async function workspaceCapabilityGraph(workspaceId:string){
  const [states,workspace,signalSources]=await Promise.all([
    query<IntegrationState>(`select provider,status,last_health_status,last_health_at,last_error from integrations where workspace_id=$1`,[workspaceId]),
    query<{vertical:string}>(`select vertical from workspaces where id=$1 limit 1`,[workspaceId]),
    query<{source_product:string}>(`select distinct source_product from workspace_operational_signals where workspace_id=$1`,[workspaceId])
  ]);
  const vertical=String(workspace[0]?.vertical||'general');
  const sources=new Set(signalSources.map(item=>String(item.source_product||'').toLowerCase()));
  const runtimes=new Map(providerCatalog().map(item=>[item.provider,item]));
  const stateMap=new Map(states.map(item=>[item.provider,item]));
  const externalActionsEnabled=String(process.env.NEXOFFICE_EXTERNAL_ACTIONS||'false').toLowerCase()==='true';

  const capabilities=CAPABILITY_REGISTRY.map(def=>{
    const runtime=runtimes.get(def.provider as any) as any;
    const integration=stateMap.get(def.provider);
    const verticalNative=def.provider==='nexjud'?vertical==='legal'||sources.has('nexjud'):def.provider==='sindcopilot'?vertical==='condo'||sources.has('sindcopilot'):true;
    const builtIn=def.provider==='nexoffice'||def.provider==='nexjud'||def.provider==='sindcopilot';
    const runtimeConfigured=builtIn?true:Boolean(runtime?.baseUrlConfigured&&runtime?.credentialConfigured);
    const staffEnabled=def.provider!=='staff'||String(process.env.NEXOFFICE_STAFF_BRIDGE_ENABLED||'false').toLowerCase()==='true';
    const docwalletLinked=def.provider!=='docwallet'||!integration||integration.status==='connected';

    let availability='ready';
    if(def.maturity==='planned')availability='planned';
    else if(!verticalNative)availability='inactive_for_workspace';
    else if(!runtimeConfigured)availability='provider_not_configured';
    else if(!staffEnabled)availability='feature_disabled';
    else if(!docwalletLinked)availability='workspace_not_connected';
    else if(def.effect==='external'&&!externalActionsEnabled)availability='external_actions_disabled';
    else if(def.approvalRequired)availability='approval_required';

    return {...def,availability,usableNow:availability==='ready'||availability==='approval_required',runtimeConfigured,workspaceIntegration:integration?{status:integration.status,lastHealthStatus:integration.last_health_status||null,lastHealthAt:integration.last_health_at||null,lastError:integration.last_error||null}:null,governance:{externalActionsEnabled,approvalRequired:def.approvalRequired,effect:def.effect}};
  });

  const byAgent=Object.fromEntries(AGENT_ROLES.map(role=>[
    role,
    capabilitiesForRole(role).map(def=>{
      const live=capabilities.find(item=>item.id===def.id)!;
      return {id:live.id,label:live.label,provider:live.provider,source:live.source,availability:live.availability,usableNow:live.usableNow,effect:live.effect};
    })
  ]));

  return {version:'2026-09-17.2',workspaceId,vertical,externalActionsEnabled,summary:{total:capabilities.length,ready:capabilities.filter(item=>item.availability==='ready').length,approvalRequired:capabilities.filter(item=>item.availability==='approval_required').length,planned:capabilities.filter(item=>item.availability==='planned').length},capabilities,byAgent};
}
