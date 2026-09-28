import type {FastifyInstance} from 'fastify';
import {workspaceContext} from './auth.js';
import {query} from './db.js';
import {nextgenFinancialActionsEnabled,nextgenFinancialConfigured} from './nextgen-financial-adapter.js';

type ReadinessStatus='ready'|'needs_setup'|'needs_configuration'|'degraded';
type Item={id:string;label:string;description:string;status:ReadinessStatus;customerReady:boolean;requiredForLaunch:boolean;detail:string;actionLabel?:string};

const configured=(...names:string[])=>names.every(name=>Boolean(String(process.env[name]||'').trim()));
const integrationHealthy=(row:any)=>!row||!['error','disconnected'].includes(String(row.last_health_status||row.status||'').toLowerCase());

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
    const taxagent=byProvider.taxagent,smartbots=byProvider.smartbots,docwallet=byProvider.docwallet,modo=byProvider.modo,staff=byProvider.staff,nextgen=byProvider.nextgen;
    const settings=receiving[0]?.settings||{};
    const receivingState=settings?.receivingAccount||settings?.receiving_account||null;
    const pixAccountReady=Boolean(receivingState?.configured||receivingState?.status==='active'||receivingState?.status==='ready');
    const paymentDataProtected=configured('NEXOFFICE_PAYMENT_DATA_KEY');

    const docwalletConfigured=configured('DOCWALLET_BASE_URL')&&Boolean(String(process.env.DOCWALLET_SERVICE_KEY||process.env.DOCWALLET_API_KEY||'').trim());
    const docwalletReady=docwalletConfigured&&integrationHealthy(docwallet);
    const modoConfigured=configured('MODO_BASE_URL','MODO_API_KEY');
    const modoReady=modoConfigured&&integrationHealthy(modo);
    const taxBaseConfigured=configured('TAXAGENT_BASE_URL');
    const taxCredentialAvailable=Boolean(String(process.env.TAXAGENT_API_KEY||'').trim()||String(taxagent?.secret_ref||'').trim());
    const taxEngineConfigured=taxBaseConfigured&&taxCredentialAvailable;
    const taxWorkspaceReady=Boolean(taxagent?.external_account_ref&&taxagent?.secret_ref&&integrationHealthy(taxagent));
    const smartbotsConfigured=configured('SMARTBOTS_BASE_URL','SMARTBOTS_API_KEY');
    const smartbotsReady=smartbotsConfigured&&Boolean(smartbots?.external_account_ref)&&integrationHealthy(smartbots);
    const staffConfigured=String(process.env.NEXOFFICE_STAFF_BRIDGE_ENABLED||'false')==='true'&&configured('STAFF_BASE_URL','STAFF_API_KEY');
    const staffReady=staffConfigured&&integrationHealthy(staff);
    const finsightConfigured=configured('FINSIGHT_BASE_URL','FINSIGHT_SERVICE_KEY');
    const nextgenReady=nextgenFinancialConfigured()&&integrationHealthy(nextgen);
    const paymentReady=Boolean(nextgenReady&&paymentDataProtected&&pixAccountReady&&nextgenFinancialActionsEnabled());

    const items:Item[]=[
      {id:'crm',label:'Clientes e CRM',description:'Clientes, contatos, oportunidades e pipeline.',status:'ready',customerReady:true,requiredForLaunch:true,detail:`${Number(crm[0]?.contacts||0)} contato(s) · ${Number(crm[0]?.deals||0)} oportunidade(s)`},
      {id:'operations',label:'Operação e tarefas',description:'Agenda, tarefas, prioridades e execução do dia a dia.',status:'ready',customerReady:true,requiredForLaunch:true,detail:`${Number(ops[0]?.tasks||0)} tarefa(s) registradas`},
      {id:'finance',label:'Gestão financeira',description:'Caixa, lançamentos, conciliação e inteligência financeira.',status:'ready',customerReady:true,requiredForLaunch:true,detail:`${Number(finance[0]?.entries||0)} lançamento(s) no ledger`},
      {id:'payments',label:'Cobrança e Pix',description:'Cobranças Pix, conta de recebimento e conciliação via motor financeiro.',status:!nextgenReady?'needs_configuration':!paymentDataProtected?'needs_configuration':pixAccountReady&&nextgenFinancialActionsEnabled()?'ready':'needs_setup',customerReady:paymentReady,requiredForLaunch:true,detail:!nextgenReady?'Motor financeiro não conectado ou degradado no homolog.':!paymentDataProtected?'Proteção dos dados de pagamento ainda não foi configurada neste ambiente.':!pixAccountReady?'Motor conectado; falta concluir/confirmar a conta Pix do workspace.':!nextgenFinancialActionsEnabled()?'Conta pronta; ações financeiras continuam protegidas/desabilitadas.':'Cobrança Pix operacional e dados sensíveis protegidos.',actionLabel:'Abrir Financeiro'},
      {id:'documents',label:'Documentos e assinaturas',description:'Contratos, upload, assinatura eletrônica, ICP-Brasil e inteligência documental.',status:docwalletReady?'ready':docwalletConfigured?'degraded':'needs_configuration',customerReady:docwalletReady,requiredForLaunch:true,detail:docwalletReady?`${Number(docRefs[0]?.count||0)} documento(s) vinculados; bridge DocWallet saudável.`:docwalletConfigured?'DocWallet configurada, mas o health/vínculo do workspace precisa ser validado.':'Bridge DocWallet ainda não está completo neste ambiente.',actionLabel:'Abrir Documentos'},
      {id:'fiscal',label:'Fiscal e notas',description:'Preparação e emissão fiscal governada pelo TaxAgent.',status:!taxEngineConfigured?'needs_configuration':taxWorkspaceReady?'ready':'needs_setup',customerReady:Boolean(taxEngineConfigured&&taxWorkspaceReady),requiredForLaunch:true,detail:!taxBaseConfigured?'Motor TaxAgent não está conectado ao homolog.':!taxCredentialAvailable?'Credencial fiscal do ambiente/workspace ainda não está disponível.':!taxWorkspaceReady?'TaxAgent conectado; falta vincular e validar Company/credencial fiscal deste workspace.':'TaxAgent vinculado e pronto para fluxo governado.',actionLabel:'Configurar Fiscal'},
      {id:'marketing',label:'Marketing e crescimento',description:'Conteúdo, campanhas, mídia, prospecção e inteligência via MODO.',status:modoReady?'ready':modoConfigured?'degraded':'needs_configuration',customerReady:modoReady,requiredForLaunch:true,detail:modoReady?'Bridge MODO saudável; publicação continua sujeita a aprovação humana e conta de mídia autorizada.':modoConfigured?'MODO configurado, mas o health do bridge precisa ser restabelecido.':'Bridge MODO ainda não está conectado ao homolog.',actionLabel:'Abrir Crescimento'},
      {id:'ai',label:'IA operacional',description:'Maya, Theo, Dora, Clara, Nico e Sofia usando o contexto real da empresa.',status:staffReady?'ready':'needs_setup',customerReady:true,requiredForLaunch:true,detail:staffReady?'Staff Business avançado conectado aos Agents.':'Agents nativos disponíveis; engine Staff avançada ainda não está conectada.',actionLabel:'Abrir Assistentes IA'},
      {id:'communication',label:'Atendimento e WhatsApp',description:'Atendimento, qualificação e follow-up via SmartBots.',status:smartbotsReady?'ready':smartbotsConfigured?'needs_setup':'needs_configuration',customerReady:smartbotsReady,requiredForLaunch:false,detail:smartbotsReady?'SmartBots vinculado e saudável para este workspace.':smartbotsConfigured?'Motor conectado; workspace ainda precisa provisionar/validar o bot.':'Bridge SmartBots não configurado.'},
      {id:'investments',label:'Inteligência de mercado financeiro',description:'Radar e cálculos informativos via F-Insight, sem recomendação ou execução.',status:finsightConfigured?'ready':'needs_configuration',customerReady:finsightConfigured,requiredForLaunch:false,detail:finsightConfigured?'Bridge F-Insight configurado em modo informativo.':'F-Insight ainda não está conectado neste ambiente.'}
    ];

    const required=items.filter(item=>item.requiredForLaunch);
    const readyRequired=required.filter(item=>item.customerReady).length;
    const launchReady=readyRequired===required.length;
    return{workspace:{id:ctx.workspaceId,name:ctx.workspaceName},launchReady,score:Math.round((readyRequired/required.length)*100),readyRequired,totalRequired:required.length,items,principles:{singleWorkspace:true,humanApprovalForExternalEffects:true,noRawProviderSecretsInBrowser:true,externalActionsGoverned:true,paymentDataEncryptedAtRest:paymentDataProtected},generatedAt:new Date().toISOString()};
  });
}
