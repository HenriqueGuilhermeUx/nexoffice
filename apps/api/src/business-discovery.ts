import {getBusinessProfile} from './business-intelligence.js';
import {buildExecutiveContext} from './executive-context.js';
import {query} from './db.js';

type ConnectionRecommendation={
  key:string;
  label:string;
  priority:'high'|'normal'|'later';
  reason:string;
  unlocks:string[];
  status:'connected'|'available'|'planned';
  providerHint?:string|null;
};

const asObject=(value:any):Record<string,any>=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
const asList=(value:any)=>Array.isArray(value)?value.map(String).filter(Boolean):[];
const n=(value:unknown)=>Number(value||0);

function recommendation(key:string,label:string,priority:ConnectionRecommendation['priority'],reason:string,unlocks:string[],status:ConnectionRecommendation['status']='planned',providerHint?:string|null):ConnectionRecommendation{
  return{key,label,priority,reason,unlocks,status,providerHint:providerHint||null};
}

export async function buildBusinessDiscoveryDiagnosis(workspaceId:string,workspaceName:string){
  const [profile,executive,integrations,externalSignals,counts]=await Promise.all([
    getBusinessProfile(workspaceId),
    buildExecutiveContext(workspaceId,workspaceName),
    query<any>(`select provider,status,capabilities,connected_at,last_health_status from integrations where workspace_id=$1 order by provider`,[workspaceId]),
    query<any>(`select source_product,count(*)::int signals,max(period_end) last_signal_at from workspace_operational_signals where workspace_id=$1 group by source_product order by source_product`,[workspaceId]),
    query<any>(`select
      (select count(*) from crm_contacts where workspace_id=$1)::int contacts,
      (select count(*) from crm_deals where workspace_id=$1)::int deals,
      (select count(*) from ledger_entries where workspace_id=$1)::int ledger,
      (select count(*) from document_refs where workspace_id=$1)::int documents,
      (select count(*) from appointments where workspace_id=$1)::int appointments,
      (select count(*) from tasks where workspace_id=$1)::int tasks`,[workspaceId])
  ]);

  const metadata=asObject(profile.metadata);
  const systems=asObject(metadata.systems);
  const commercial=asObject(metadata.commercial);
  const operations=asObject(metadata.operations);
  const digital=asObject(metadata.digital);
  const offer=asObject(metadata.offer);
  const currentTools=asList(systems.currentTools);
  const namedTools=asList(systems.namedTools);
  const primaryGoal=String(commercial.primaryGoal||asObject(metadata.onboarding).primaryGoal||'');
  const bottleneck=String(operations.biggestBottleneck||profile.main_dependency||'');
  const connected=new Set(integrations.filter((item:any)=>String(item.status)==='connected').map((item:any)=>String(item.provider).toLowerCase()));
  const hasExternalSignals=externalSignals.length>0;
  const c=counts[0]||{};

  const recommendations:ConnectionRecommendation[]=[];
  const add=(item:ConnectionRecommendation)=>{if(!recommendations.some(existing=>existing.key===item.key))recommendations.push(item)};

  const hasOpenFinance=[...connected].some(provider=>provider.includes('belvo')||provider.includes('open')||provider.includes('bank'));
  add(recommendation(
    'open_finance','Contas bancárias / Open Finance',
    ['cash','late','organize'].includes(primaryGoal)||['finance','collections'].includes(bottleneck)?'high':'normal',
    hasOpenFinance?'A realidade bancária já está conectada ao contexto.':'Conectar bancos permite comparar o que o sistema espera receber/pagar com o que realmente aconteceu nas contas.',
    ['saldos consolidados','conciliação automática','fluxo de caixa real','inadimplência confirmada','liquidez e risco'],
    hasOpenFinance?'connected':'planned',
    'Belvo / Open Finance'
  ));

  const wantsEmail=currentTools.includes('email')||['sales','service'].includes(bottleneck)||['sell','leads'].includes(primaryGoal);
  if(wantsEmail)add(recommendation(
    'email','E-mail',
    ['sales','service'].includes(bottleneck)?'high':'normal',
    'Conversas comerciais e decisões importantes costumam ficar fora do CRM.',
    ['histórico de relacionamento','compromissos assumidos','follow-ups esquecidos','memória de decisões'],
    [...connected].some(provider=>provider.includes('gmail')||provider.includes('microsoft'))?'connected':'planned',
    'Google / Microsoft'
  ));

  const wantsCalendar=currentTools.includes('calendar')||Boolean(profile.uses_agenda)||bottleneck==='agenda';
  if(wantsCalendar)add(recommendation(
    'calendar','Calendário',
    bottleneck==='agenda'?'high':'normal',
    'Agenda conectada permite relacionar reuniões, clientes, oportunidades e atrasos operacionais.',
    ['reuniões ligadas a clientes','follow-up pós-reunião','capacidade da agenda','sinais de no-show e atraso'],
    [...connected].some(provider=>provider.includes('calendar'))?'connected':'planned',
    'Google Calendar / Microsoft 365'
  ));

  if(currentTools.includes('erp')||currentTools.includes('accounting'))add(recommendation(
    'erp','ERP / sistema contábil',
    'high',
    'Se o cliente já opera em outro ERP, a Nex deve entender esses registros sem exigir migração imediata.',
    ['pedidos e faturamento','custos','estoque','fornecedores','contas a pagar/receber'],
    [...connected].some(provider=>provider.includes('erp'))?'connected':'planned'
  ));

  if(currentTools.includes('crm'))add(recommendation(
    'external_crm','CRM atual',
    'high',
    'O histórico comercial existente deve entrar no Business Graph antes de pedir que a equipe recrie tudo.',
    ['pipeline histórico','clientes e contatos','origem de vendas','atividades e follow-ups'],
    [...connected].some(provider=>provider.includes('crm'))?'connected':'planned'
  ));

  if(currentTools.includes('spreadsheets'))add(recommendation(
    'spreadsheets','Planilhas',
    'normal',
    'Planilhas normalmente carregam controles críticos que ainda não viraram sistema.',
    ['metas','orçamentos','cadastros auxiliares','controles operacionais e financeiros'],
    'planned'
  ));

  if(currentTools.includes('whatsapp')||digital.whatsapp||bottleneck==='service')add(recommendation(
    'messaging','WhatsApp / atendimento',
    bottleneck==='service'?'high':'normal',
    'Conversas com clientes são parte da operação e precisam gerar contexto, tarefas e oportunidades.',
    ['atendimento','qualificação','follow-up','motivos de perda','sinais de satisfação'],
    [...connected].some(provider=>provider.includes('smartbots')||provider.includes('whatsapp'))?'connected':'planned',
    'SmartBots'
  ));

  if(Boolean(profile.uses_contracts)||n(c.documents)>0||bottleneck==='documents')add(recommendation(
    'documents','Documentos e contratos',
    bottleneck==='documents'?'high':'normal',
    'Contratos e documentos explicam obrigações, valores, prazos e decisões que não aparecem no financeiro.',
    ['obrigações','prazos','renovações','assinaturas','evidência de decisões'],
    n(c.documents)>0?'connected':'available',
    'DocWallet'
  ));

  if(primaryGoal==='marketing'||primaryGoal==='leads'||bottleneck==='marketing')add(recommendation(
    'marketing','Marketing e aquisição',
    'high',
    'Para ligar investimento em marketing a receita e margem, a Nex precisa receber sinais de campanhas e demanda.',
    ['CAC','origem de leads','conversão real','campanha → venda → recebimento'],
    hasExternalSignals?'connected':'available',
    'MODO'
  ));

  const rank=(priority:ConnectionRecommendation['priority'])=>priority==='high'?0:priority==='normal'?1:2;
  recommendations.sort((a,b)=>rank(a.priority)-rank(b.priority));

  const findings=executive.priorities.slice(0,5).map(item=>({
    code:item.code,
    level:item.level,
    title:item.title,
    detail:item.detail,
    hypothesis:item.hypothesis||null,
    recommendedNextStep:item.recommendedNextStep||null,
    evidence:item.evidence
  }));

  const nativeSignals=n(c.contacts)+n(c.deals)+n(c.ledger)+n(c.documents)+n(c.appointments)+n(c.tasks);
  const knowledge=executive.indicators.businessKnowledgePct;
  const connectionGap=recommendations.filter(item=>item.status!=='connected');
  const firstGap=connectionGap[0]||null;
  const firstFinding=findings[0]||null;

  const firstDiagnosis=firstFinding
    ?{
      state:'finding',
      title:firstFinding.title,
      detail:firstFinding.detail,
      nextStep:firstFinding.recommendedNextStep||'Abra a Visão Executiva para revisar as evidências e decidir o próximo passo.'
    }
    :nativeSignals<3
      ?{
        state:'learning',
        title:'Ainda faltam sinais para um diagnóstico forte',
        detail:'O perfil inicial já ajuda a personalizar a Nex, mas conectar as fontes do dia a dia vai permitir encontrar relações reais entre vendas, caixa e operação.',
        nextStep:firstGap?`Prioridade de conexão: ${firstGap.label}.`:'Comece registrando clientes, vendas e financeiro.'
      }
      :{
        state:'healthy',
        title:'A base inicial não mostra uma prioridade crítica',
        detail:'A Nex já possui contexto suficiente para começar a acompanhar mudanças entre vendas, financeiro e operação.',
        nextStep:firstGap?`A próxima conexão que mais amplia a leitura é ${firstGap.label}.`:'Continue usando a operação para aumentar o histórico.'
      };

  return{
    generatedAt:new Date().toISOString(),
    workspace:{id:workspaceId,name:workspaceName},
    profile:{
      completenessPct:Number(profile.completeness_pct||0),
      sector:profile.sector,
      subsector:profile.subsector||null,
      primaryGoal:primaryGoal||null,
      biggestBottleneck:bottleneck||null,
      businessType:offer.businessType||null,
      currentTools,
      namedTools
    },
    firstDiagnosis,
    findings,
    context:{
      businessGraph:executive.businessGraph,
      indicators:executive.indicators,
      knowledgePct:knowledge,
      nativeSignals,
      alternativeVenturesSources:externalSignals.map((row:any)=>({sourceProduct:row.source_product,signals:n(row.signals),lastSignalAt:row.last_signal_at||null}))
    },
    connections:{
      connected:recommendations.filter(item=>item.status==='connected'),
      recommended:connectionGap,
      all:recommendations
    },
    principles:{
      connectWhatExists:true,
      migrationNotRequired:true,
      evidenceBeforeCausality:true,
      correlationsAreHypotheses:true,
      noExternalEffects:true,
      readOnlyDiagnosis:true
    }
  };
}
