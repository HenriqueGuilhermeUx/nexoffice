import type {FastifyInstance} from 'fastify';
import {workspaceContext} from './auth.js';
import {query} from './db.js';
import {nextgenFinancialActionsEnabled,nextgenFinancialConfigured} from './nextgen-financial-adapter.js';

type ReadinessStatus='ready'|'needs_setup'|'needs_configuration'|'degraded';
type Item={id:string;label:string;description:string;status:ReadinessStatus;customerReady:boolean;requiredForLaunch:boolean;detail:string;actionLabel?:string};

const configured=(...names:string[])=>names.every(name=>Boolean(String(process.env[name]||'').trim()));

export async function registerLaunchReadinessRoutes(app:FastifyInstance){
  app.get('/v1/launch-readiness',async req=>{
    const ctx=await workspaceContext(req,'integrations.read');
    const [taxagent,smartbots,receiving,docRefs,crm,finance,ops]=await Promise.all([
      query<any>(`select status,external_account_ref,secret_ref,last_health_status,last_error from integrations where workspace_id=$1 and provider='taxagent' limit 1`,[ctx.workspaceId]),
      query<any>(`select status,external_account_ref,last_health_status,last_error from integrations where workspace_id=$1 and provider='smartbots' limit 1`,[ctx.workspaceId]),
      query<any>(`select settings from workspaces where id=$1`,[ctx.workspaceId]),
      query<any>(`select count(*)::int count from document_refs where workspace_id=$1`,[ctx.workspaceId]),
      query<any>(`select count(*)::int contacts,(select count(*)::int from crm_deals where workspace_id=$1) deals from crm_contacts where workspace_id=$1`,[ctx.workspaceId]),
      query<any>(`select count(*)::int entries from ledger_entries where workspace_id=$1`,[ctx.workspaceId]),
      query<any>(`select count(*)::int tasks from tasks where workspace_id=$1`,[ctx.workspaceId])
    ]);

    const settings=receiving[0]?.settings||{};
    const receivingState=settings?.receivingAccount||settings?.receiving_account||null;
    const pixAccountReady=Boolean(receivingState?.configured||receivingState?.status==='active'||receivingState?.status==='ready');
    const docwalletConfigured=configured('DOCWALLET_BASE_URL')&&Boolean(String(process.env.DOCWALLET_SERVICE_KEY||process.env.DOCWALLET_API_KEY||'').trim());
    const modoConfigured=configured('MODO_BASE_URL','MODO_API_KEY');
    const taxEngineConfigured=configured('TAXAGENT_BASE_URL','TAXAGENT_API_KEY');
    const taxWorkspaceReady=Boolean(taxagent[0]?.external_account_ref&&taxagent[0]?.secret_ref);
    const smartbotsConfigured=configured('SMARTBOTS_BASE_URL','SMARTBOTS_API_KEY');
    const staffConfigured=String(process.env.NEXOFFICE_STAFF_BRIDGE_ENABLED||'false')==='true'&&configured('STAFF_BASE_URL','STAFF_API_KEY');
    const finsightConfigured=configured('FINSIGHT_BASE_URL','FINSIGHT_SERVICE_KEY');

    const items:Item[]=[
      {id:'crm',label:'Clientes e CRM',description:'Clientes, contatos, oportunidades e pipeline.',status:'ready',customerReady:true,requiredForLaunch:true,detail:`${Number(crm[0]?.contacts||0)} contato(s) · ${Number(crm[0]?.deals||0)} oportunidade(s)`},
      {id:'operations',label:'Operação e tarefas',description:'Agenda, tarefas, prioridades e execução do dia a dia.',status:'ready',customerReady:true,requiredForLaunch:true,detail:`${Number(ops[0]?.tasks||0)} tarefa(s) registradas`},
      {id:'finance',label:'Gestão financeira',description:'Caixa, lançamentos, conciliação e inteligência financeira.',status:'ready',customerReady:true,requiredForLaunch:true,detail:`${Number(finance[0]?.entries||0)} lançamento(s) no ledger`},
      {id:'payments',label:'Cobrança e Pix',description:'Cobranças Pix, conta de recebimento e conciliação via motor financeiro.',status:!nextgenFinancialConfigured()?'needs_configuration':pixAccountReady&&nextgenFinancialActionsEnabled()?'ready':'needs_setup',customerReady:Boolean(nextgenFinancialConfigured()&&pixAccountReady&&nextgenFinancialActionsEnabled()),requiredForLaunch:true,detail:!nextgenFinancialConfigured()?'Motor financeiro não conectado ao homolog.':!pixAccountReady?'Motor conectado; falta concluir/confirmar a conta Pix do workspace.':!nextgenFinancialActionsEnabled()?'Conta pronta; ações financeiras continuam protegidas/desabilitadas.':'Cobrança Pix operacional.',actionLabel:'Abrir Financeiro'},
      {id:'documents',label:'Documentos e assinaturas',description:'Contratos, upload, assinatura eletrônica, ICP-Brasil e inteligência documental.',status:docwalletConfigured?'ready':'needs_configuration',customerReady:docwalletConfigured,requiredForLaunch:true,detail:docwalletConfigured?`${Number(docRefs[0]?.count||0)} documento(s) vinculados; bridge DocWallet configurado.`:'Bridge DocWallet ainda não está completo neste ambiente.',actionLabel:'Abrir Documentos'},
      {id:'fiscal',label:'Fiscal e notas',description:'Preparação e emissão fiscal governada pelo TaxAgent.',status:!taxEngineConfigured?'needs_configuration':taxWorkspaceReady?'ready':'needs_setup',customerReady:Boolean(taxEngineConfigured&&taxWorkspaceReady),requiredForLaunch:true,detail:!taxEngineConfigured?'Motor TaxAgent não está conectado ao homolog.':!taxWorkspaceReady?'TaxAgent conectado; falta vincular a Company/credencial fiscal deste workspace.':'TaxAgent vinculado ao workspace.',actionLabel:'Configurar Fiscal'},
      {id:'marketing',label:'Marketing e crescimento',description:'Conteúdo, campanhas, mídia, prospecção e inteligência via MODO.',status:modoConfigured?'ready':'needs_configuration',customerReady:modoConfigured,requiredForLaunch:true,detail:modoConfigured?'Bridge MODO configurado; publicação continua sujeita a aprovação humana e conta de mídia autorizada.':'Bridge MODO ainda não está conectado ao homolog.',actionLabel:'Abrir Crescimento'},
      {id:'ai',label:'IA operacional',description:'Maya, Theo, Dora, Clara, Nico e Sofia usando o contexto real da empresa.',status:staffConfigured?'ready':'needs_setup',customerReady:true,requiredForLaunch:true,detail:staffConfigured?'Staff Business avançado conectado aos Agents.':'Agents nativos disponíveis; engine Staff avançada ainda não está conectada.',actionLabel:'Abrir Assistentes IA'},
      {id:'communication',label:'Atendimento e WhatsApp',description:'Atendimento, qualificação e follow-up via SmartBots.',status:!smartbotsConfigured?'needs_configuration':smartbots[0]?.external_account_ref?'ready':'needs_setup',customerReady:Boolean(smartbotsConfigured&&smartbots[0]?.external_account_ref),requiredForLaunch:false,detail:!smartbotsConfigured?'Bridge SmartBots não configurado.':!smartbots[0]?.external_account_ref?'Motor conectado; workspace ainda não provisionou o bot.':'SmartBots vinculado ao workspace.'},
      {id:'investments',label:'Inteligência de mercado financeiro',description:'Radar e cálculos informativos via F-Insight, sem recomendação ou execução.',status:finsightConfigured?'ready':'needs_configuration',customerReady:finsightConfigured,requiredForLaunch:false,detail:finsightConfigured?'Bridge F-Insight configurado em modo informativo.':'F-Insight ainda não está conectado neste ambiente.'}
    ];

    const required=items.filter(item=>item.requiredForLaunch);
    const readyRequired=required.filter(item=>item.customerReady).length;
    const launchReady=readyRequired===required.length;
    return{workspace:{id:ctx.workspaceId,name:ctx.workspaceName},launchReady,score:Math.round((readyRequired/required.length)*100),readyRequired,totalRequired:required.length,items,principles:{singleWorkspace:true,humanApprovalForExternalEffects:true,noRawProviderSecretsInBrowser:true,externalActionsGoverned:true},generatedAt:new Date().toISOString()};
  });
}
