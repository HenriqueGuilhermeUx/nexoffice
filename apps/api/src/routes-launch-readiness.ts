import type {FastifyInstance} from 'fastify';
import {workspaceContext} from './auth.js';
import {query} from './db.js';
import {nextgenFinancialActionsEnabled,nextgenFinancialConfigured} from './nextgen-financial-adapter.js';

type ReadinessStatus='ready'|'needs_setup'|'needs_configuration'|'degraded';
type Item={id:string;label:string;description:string;status:ReadinessStatus;customerReady:boolean;requiredForLaunch:boolean;detail:string;actionLabel?:string};
type Probe={ok:boolean;status:number|null;body:any|null};

const configured=(...names:string[])=>names.every(name=>Boolean(String(process.env[name]||'').trim()));
const integrationHealthy=(row:any)=>!row||!['error','disconnected'].includes(String(row.last_health_status||row.status||'').toLowerCase());
const base=(value:string)=>String(value||'').replace(/\/+$/,'');

async function probeJson(baseUrl:string,path:string,headers:Record<string,string>={}):Promise<Probe>{
  if(!baseUrl)return{ok:false,status:null,body:null};
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),8000);
  try{
    const response=await fetch(`${base(baseUrl)}${path}`,{method:'GET',headers,signal:controller.signal});
    const body=await response.json().catch(()=>null);
    return{ok:response.ok,status:response.status,body};
  }catch{return{ok:false,status:null,body:null}}
  finally{clearTimeout(timer)}
}

export async function registerLaunchReadinessRoutes(app:FastifyInstance){
  app.get('/v1/launch-readiness',async req=>{
    const ctx=await workspaceContext(req,'integrations.read');
    const [integrations,receiving,docRefs,crm,finance,ops]=await Promise.all([
      query<any>(`select provider,status,external_account_ref,secret_ref,last_health_status,last_error from integrations where workspace_id=$1 and provider in ('taxagent','smartbots','docwallet','modo','staff','nextgen')`,[ctx.workspaceId]),
      query<any>(`select settings from workspaces where id=$1`,[ctx.workspaceId]),
      query<any>(`select count(*)::int count from document_refs where workspace_id=$1`,[ctx.workspaceId]),
      query<any>(`select count(*)::int contacts,(select count(*)::int from crm_deals where workspace_id=$1) deals from crm_contacts where workspace_id=$1`,[ctx.workspaceId]),
      query<any>(`select count(*)::int entries from ledger_entries where workspace_id=$1`,[ctx.workspaceId]),
      query<any>(`select count(*)::int tasks from tasks where workspace_id=$1`,[ctx.workspaceId])
    ]);

    const byProvider=Object.fromEntries(integrations.map((row:any)=>[String(row.provider),row]));
    const taxagent=byProvider.taxagent,smartbots=byProvider.smartbots,modo=byProvider.modo,nextgen=byProvider.nextgen;
    const settings=receiving[0]?.settings||{};
    const receivingState=settings?.receivingAccount||settings?.receiving_account||null;
    const pixAccountReady=Boolean(receivingState?.configured||receivingState?.status==='active'||receivingState?.status==='ready');
    const paymentDataProtected=configured('NEXOFFICE_PAYMENT_DATA_KEY');

    const docwalletKey=String(process.env.DOCWALLET_SERVICE_KEY||process.env.DOCWALLET_API_KEY||'').trim();
    const docwalletConfigured=Boolean(String(process.env.DOCWALLET_BASE_URL||'').trim()&&docwalletKey);
    const modoConfigured=configured('MODO_BASE_URL','MODO_API_KEY');
    const smartbotsConfigured=configured('SMARTBOTS_BASE_URL','SMARTBOTS_API_KEY');
    const staffConfigured=String(process.env.NEXOFFICE_STAFF_BRIDGE_ENABLED||'false')==='true'&&configured('STAFF_BASE_URL','STAFF_API_KEY');
    const taxBaseConfigured=configured('TAXAGENT_BASE_URL');
    const taxGlobalCredential=Boolean(String(process.env.TAXAGENT_API_KEY||'').trim());
    const taxWorkspaceSecretRef=String(taxagent?.secret_ref||'').trim();
    const taxWorkspaceCredential=Boolean(taxWorkspaceSecretRef&&String(process.env[taxWorkspaceSecretRef]||'').trim());
    const taxCredentialAvailable=taxGlobalCredential||taxWorkspaceCredential;
    const taxWorkspaceLinked=Boolean(taxagent?.external_account_ref);
    const finsightConfigured=configured('FINSIGHT_BASE_URL','FINSIGHT_SERVICE_KEY');

    const [docProbe,modoProbe,staffProbe,smartbotsProbe,taxProbe]=await Promise.all([
      docwalletConfigured?probeJson(String(process.env.DOCWALLET_BASE_URL),'/api/internal/nexoffice/signature-modes',{'X-NexOffice-Key':docwalletKey,'X-NexOffice-Workspace-Id':ctx.workspaceId}):Promise.resolve({ok:false,status:null,body:null}),
      modoConfigured?probeJson(String(process.env.MODO_BASE_URL),'/api/v1/internal/nexoffice/health',{'X-NexOffice-Key':String(process.env.MODO_API_KEY),'X-NexOffice-Workspace-Id':ctx.workspaceId}):Promise.resolve({ok:false,status:null,body:null}),
      staffConfigured?probeJson(String(process.env.STAFF_BASE_URL),'/.netlify/functions/nexoffice-assistant',{Authorization:`Bearer ${String(process.env.STAFF_API_KEY)}`,'X-NexOffice-Workspace-Id':ctx.workspaceId}):Promise.resolve({ok:false,status:null,body:null}),
      smartbotsConfigured?probeJson(String(process.env.SMARTBOTS_BASE_URL),'/api/internal/nexoffice/health',{'X-NexOffice-Key':String(process.env.SMARTBOTS_API_KEY),'X-NexOffice-Workspace-Id':ctx.workspaceId}):Promise.resolve({ok:false,status:null,body:null}),
      taxBaseConfigured?probeJson(String(process.env.TAXAGENT_BASE_URL),'/v1/health',taxCredentialAvailable?{Authorization:`Bearer ${String(process.env.TAXAGENT_API_KEY||process.env[taxWorkspaceSecretRef]||'')}`}:{ }):Promise.resolve({ok:false,status:null,body:null})
    ]);

    const docwalletReady=Boolean(docwalletConfigured&&docProbe.ok);
    const remoteModes=Array.isArray(docProbe.body?.modes)?docProbe.body.modes:[];
    const icpLocalEnabled=String(process.env.DOCWALLET_ICP_SIGNATURE_ENABLED||'false')==='true'&&String(process.env.NEXOFFICE_EXTERNAL_ACTIONS||'false')==='true';
    const icpRemoteAvailable=remoteModes.some((mode:any)=>String(mode?.id)==='icp_brasil'&&mode?.available===true);
    const icpReady=Boolean(docwalletReady&&icpLocalEnabled&&icpRemoteAvailable);
    const modoReady=Boolean(modoConfigured&&modoProbe.ok&&integrationHealthy(modo));
    const staffReady=Boolean(staffConfigured&&staffProbe.ok);
    const smartbotsReady=Boolean(smartbotsConfigured&&smartbotsProbe.ok&&smartbots?.external_account_ref&&integrationHealthy(smartbots));
    const taxEngineConfigured=Boolean(taxBaseConfigured&&taxCredentialAvailable&&taxProbe.ok);
    const taxWorkspaceReady=Boolean(taxEngineConfigured&&taxWorkspaceLinked&&integrationHealthy(taxagent));
    const nextgenReady=nextgenFinancialConfigured()&&integrationHealthy(nextgen);
    const paymentReady=Boolean(nextgenReady&&paymentDataProtected&&pixAccountReady&&nextgenFinancialActionsEnabled());

    const items:Item[]=[
      {id:'crm',label:'Clientes e CRM',description:'Clientes, contatos, oportunidades e pipeline.',status:'ready',customerReady:true,requiredForLaunch:true,detail:`${Number(crm[0]?.contacts||0)} contato(s) · ${Number(crm[0]?.deals||0)} oportunidade(s)`},
      {id:'operations',label:'Operação e tarefas',description:'Agenda, tarefas, prioridades e execução do dia a dia.',status:'ready',customerReady:true,requiredForLaunch:true,detail:`${Number(ops[0]?.tasks||0)} tarefa(s) registradas`},
      {id:'finance',label:'Gestão financeira',description:'Caixa, lançamentos, conciliação e visão financeira.',status:'ready',customerReady:true,requiredForLaunch:true,detail:`${Number(finance[0]?.entries||0)} lançamento(s) no financeiro`},
      {id:'payments',label:'Cobrança e Pix',description:'Criar cobranças, acompanhar pagamentos e conciliar recebimentos.',status:!nextgenReady?'needs_configuration':!paymentDataProtected?'needs_configuration':paymentReady?'ready':'needs_setup',customerReady:paymentReady,requiredForLaunch:true,detail:!nextgenReady?'A conexão financeira precisa ser restabelecida.':!paymentDataProtected?'A proteção dos dados de pagamento precisa ser concluída.':!pixAccountReady?'A conexão está ativa; falta confirmar a conta Pix desta empresa.':!nextgenFinancialActionsEnabled()?'A conta está pronta; falta habilitar as ações governadas no homolog.':'Cobrança Pix pronta para teste real com aprovação humana.',actionLabel:'Abrir Financeiro'},
      {id:'documents',label:'Documentos e assinaturas',description:'Contratos, upload, assinatura eletrônica e inteligência documental.',status:docwalletReady?'ready':docwalletConfigured?'degraded':'needs_configuration',customerReady:docwalletReady,requiredForLaunch:true,detail:docwalletReady?`${Number(docRefs[0]?.count||0)} documento(s) vinculado(s); serviço documental respondeu ao teste.`:docwalletConfigured?'A conexão documental está configurada, mas não respondeu ao teste agora.':'A conexão de Documentos ainda precisa ser concluída.',actionLabel:'Abrir Documentos'},
      {id:'icp',label:'Assinatura ICP-Brasil',description:'Assinatura digital com certificado ICP-Brasil para documentos que exigem esse nível de identidade.',status:icpReady?'ready':docwalletReady?'needs_configuration':'needs_setup',customerReady:icpReady,requiredForLaunch:true,detail:icpReady?'ICP-Brasil disponível no fluxo de assinatura do homolog.':docwalletReady?'Documentos funcionam, mas o provedor ICP-Brasil ainda não está disponível para este ambiente.':'Primeiro é necessário restabelecer Documentos e Assinaturas.',actionLabel:'Abrir Documentos'},
      {id:'fiscal',label:'Fiscal e notas',description:'Preparar, revisar e emitir notas fiscais com aprovação.',status:!taxBaseConfigured||!taxCredentialAvailable?'needs_configuration':!taxProbe.ok?'degraded':taxWorkspaceReady?'ready':'needs_setup',customerReady:taxWorkspaceReady,requiredForLaunch:true,detail:!taxBaseConfigured?'A conexão fiscal ainda precisa ser configurada.':!taxCredentialAvailable?'A credencial fiscal segura ainda não está disponível.':!taxProbe.ok?'O serviço fiscal não respondeu ao teste agora.':!taxWorkspaceLinked?'A conexão fiscal está ativa; falta vincular a empresa fiscal deste workspace.':'Fiscal conectado e pronto para o smoke governado.',actionLabel:'Abrir Financeiro'},
      {id:'marketing',label:'Marketing e crescimento',description:'Campanhas, conteúdo, criativos, mídia, leads e aprendizado.',status:modoReady?'ready':modoConfigured?'degraded':'needs_configuration',customerReady:modoReady,requiredForLaunch:true,detail:modoReady?'Marketing respondeu ao teste e está pronto para criação/revisão governada.':modoConfigured?'A conexão de Marketing está configurada, mas não respondeu ao teste agora.':'A conexão de Marketing ainda precisa ser concluída.',actionLabel:'Abrir Crescimento'},
      {id:'ai',label:'Equipe de IA',description:'Maya, Theo, Dora, Clara, Nico e Sofia trabalhando com o contexto da empresa.',status:staffReady?'ready':staffConfigured?'degraded':'needs_configuration',customerReady:staffReady,requiredForLaunch:true,detail:staffReady?'Equipe avançada de IA respondeu ao teste de conexão.':staffConfigured?'A equipe avançada está configurada, mas não respondeu ao teste agora.':'A conexão da equipe avançada de IA ainda precisa ser concluída.',actionLabel:'Abrir Assistentes IA'},
      {id:'communication',label:'Bot, atendimento e WhatsApp',description:'Bot da empresa, qualificação, CRM e follow-up por canais de atendimento.',status:smartbotsReady?'ready':smartbotsConfigured&&smartbotsProbe.ok?'needs_setup':smartbotsConfigured?'degraded':'needs_configuration',customerReady:smartbotsReady,requiredForLaunch:true,detail:smartbotsReady?'Bot vinculado ao workspace e conexão de atendimento saudável.':smartbotsConfigured&&smartbotsProbe.ok?'A conexão de atendimento funciona; falta provisionar/vincular o Bot desta empresa.':smartbotsConfigured?'A conexão de atendimento está configurada, mas não respondeu ao teste agora.':'A conexão de Bot e atendimento ainda precisa ser concluída.',actionLabel:'Configurar Bot'},
      {id:'investments',label:'Inteligência de mercado financeiro',description:'Radar e cálculos informativos, sem recomendação ou execução automática.',status:finsightConfigured?'ready':'needs_configuration',customerReady:finsightConfigured,requiredForLaunch:false,detail:finsightConfigured?'Inteligência financeira opcional configurada.':'Integração opcional; não bloqueia o Commercial V1.'}
    ];

    const required=items.filter(item=>item.requiredForLaunch);
    const readyRequired=required.filter(item=>item.customerReady).length;
    const launchReady=readyRequired===required.length;
    return{workspace:{id:ctx.workspaceId,name:ctx.workspaceName},launchReady,score:Math.round((readyRequired/required.length)*100),readyRequired,totalRequired:required.length,items,principles:{singleWorkspace:true,humanApprovalForExternalEffects:true,noRawProviderSecretsInBrowser:true,externalActionsGoverned:true,paymentDataEncryptedAtRest:paymentDataProtected,remoteHealthRequired:true},generatedAt:new Date().toISOString()};
  });
}
