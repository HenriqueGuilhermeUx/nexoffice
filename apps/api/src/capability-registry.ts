export const AGENT_ROLES=['secretary','service','crm','erp','collections','controller','documents','growth'] as const;
export type AgentRole=typeof AGENT_ROLES[number];

export const CAPABILITY_PROVIDERS=['nexoffice','docwallet','staff','smartbots','nextgen','modo','taxagent','nexjud','sindcopilot'] as const;
export type CapabilityProvider=typeof CAPABILITY_PROVIDERS[number];
export type CapabilityEffect='read'|'prepare'|'external';
export type CapabilityMaturity='active'|'guarded'|'planned';

export type CapabilityDefinition={
  id:string;
  label:string;
  provider:CapabilityProvider;
  source:string;
  description:string;
  effect:CapabilityEffect;
  maturity:CapabilityMaturity;
  approvalRequired:boolean;
  roles:AgentRole[];
  actionTypes?:string[];
};

export const CAPABILITY_REGISTRY:CapabilityDefinition[]=[
  {id:'business.context.read',label:'Contexto empresarial',provider:'nexoffice',source:'NexOffice Core',description:'Lê o contexto operacional compartilhado do workspace sem misturar memória pessoal.',effect:'read',maturity:'active',approvalRequired:false,roles:[...AGENT_ROLES]},
  {id:'finance.interpret',label:'Inteligência financeira',provider:'nexoffice',source:'NexOffice + metodologia F-Insight',description:'Transforma caixa, recebíveis, despesas, concentração e tendência em explicações e próximos passos.',effect:'read',maturity:'active',approvalRequired:false,roles:['erp','collections','controller']},
  {id:'automation.rule.evaluate',label:'Regras operacionais',provider:'nexoffice',source:'NexOffice + padrão de execução NextGen',description:'Avalia condições, prioridades e gatilhos antes de qualquer execução externa.',effect:'read',maturity:'active',approvalRequired:false,roles:['secretary','crm','erp','collections','controller','growth']},

  {id:'documents.analyze',label:'Analisar documento',provider:'docwallet',source:'DocWallet Intelligence',description:'Extrai e estrutura inteligência documental mantendo o arquivo bruto no DocWallet.',effect:'read',maturity:'active',approvalRequired:false,roles:['documents','service','controller'],actionTypes:['document.analyze']},
  {id:'documents.intelligence.read',label:'Ler inteligência documental',provider:'docwallet',source:'DocWallet Intelligence',description:'Lê classificação, resumo, partes, datas, valores e obrigações estruturadas sem retornar arquivo ou texto bruto.',effect:'read',maturity:'active',approvalRequired:false,roles:['documents','service','controller','secretary']},
  {id:'documents.alerts.read',label:'Alertas documentais',provider:'docwallet',source:'DocWallet Intelligence',description:'Traz alertas documentais autorizados para a operação do workspace.',effect:'read',maturity:'active',approvalRequired:false,roles:['documents','secretary','controller']},
  {id:'documents.expirations.read',label:'Vencimentos documentais',provider:'docwallet',source:'DocWallet Intelligence',description:'Traz vencimentos e obrigações com data para a rotina operacional, sem replicar arquivos no NexOffice.',effect:'read',maturity:'active',approvalRequired:false,roles:['documents','secretary','controller']},
  {id:'documents.signature.request',label:'Solicitar assinatura',provider:'docwallet',source:'DocWallet Signatures',description:'Prepara e envia fluxo de assinatura para um documento referenciado pelo workspace.',effect:'external',maturity:'guarded',approvalRequired:true,roles:['documents','secretary','controller'],actionTypes:['document.signature_request']},

  {id:'assistant.business.conversation',label:'Conversa empresarial',provider:'staff',source:'Staff Business Bridge',description:'Interpreta linguagem natural usando somente o snapshot empresarial autorizado pelo NexOffice.',effect:'read',maturity:'active',approvalRequired:false,roles:['secretary','service','crm','erp','collections','controller','documents','growth'],actionTypes:['assistant.','voice.']},
  {id:'assistant.voice.capture',label:'Voz empresarial',provider:'staff',source:'Staff Voice',description:'Captura comando por voz e o converte em intenção operacional sem importar memória pessoal.',effect:'prepare',maturity:'planned',approvalRequired:false,roles:['secretary','service','crm','erp','collections','controller','documents','growth']},

  {id:'communication.message.send',label:'Enviar mensagem',provider:'smartbots',source:'SmartBots',description:'Envia comunicação operacional por canal conectado somente depois da governança exigida.',effect:'external',maturity:'guarded',approvalRequired:true,roles:['service','crm','collections','secretary'],actionTypes:['message.send','collection.reminder.send']},
  {id:'communication.followup.prepare',label:'Preparar follow-up',provider:'smartbots',source:'SmartBots Assistido',description:'Prepara abordagem e próximo passo para lead, cliente ou cobrança antes do envio.',effect:'prepare',maturity:'planned',approvalRequired:false,roles:['service','crm','collections']},

  {id:'payments.charge.create',label:'Criar cobrança',provider:'nextgen',source:'NextGen',description:'Cria cobrança financeira idempotente quando o rail estiver habilitado e a ação aprovada.',effect:'external',maturity:'guarded',approvalRequired:true,roles:['collections','controller'],actionTypes:['payment.charge','collection.charge']},
  {id:'payments.reconciliation.read',label:'Reconciliar cobrança',provider:'nextgen',source:'NextGen',description:'Consulta e normaliza confirmação de cobrança e reconciliação sem virar banco do usuário.',effect:'read',maturity:'planned',approvalRequired:false,roles:['collections','controller']},

  {id:'growth.plan',label:'Plano de growth',provider:'modo',source:'MODO Growth Engine',description:'Cria brief, plano de mídia e campanha em modo de preparação, sem ativar gasto externo.',effect:'prepare',maturity:'active',approvalRequired:false,roles:['growth','crm']},
  {id:'growth.insights.read',label:'Insights de marketing',provider:'modo',source:'MODO Intelligence',description:'Lê performance, funil e sinais de marketing conectados ao workspace.',effect:'read',maturity:'active',approvalRequired:false,roles:['growth','crm','controller']},
  {id:'growth.google_ads.metrics.read',label:'Métricas Google Ads',provider:'modo',source:'MODO Google Ads',description:'Lê métricas da conta Google Ads autorizada sem criar ou alterar campanhas.',effect:'read',maturity:'active',approvalRequired:false,roles:['growth','controller']},
  {id:'growth.media.oauth.prepare',label:'Conectar mídia',provider:'modo',source:'MODO Media Connections',description:'Prepara OAuth oficial para conexão de mídia do workspace.',effect:'prepare',maturity:'active',approvalRequired:false,roles:['growth']},
  {id:'growth.landing.prepare',label:'Preparar landing page',provider:'modo',source:'MODO Demand',description:'Prepara landing vinculada à campanha e ao funil de demanda.',effect:'prepare',maturity:'active',approvalRequired:false,roles:['growth','crm']},
  {id:'growth.market_intelligence.read',label:'Radar de mercado',provider:'modo',source:'MODO Intelligence Engine',description:'Pesquisa concorrentes, reputação, ofertas e sinais de demanda para transformar dados em próximos passos.',effect:'read',maturity:'planned',approvalRequired:false,roles:['growth','crm','controller']},
  {id:'growth.prospecting.b2b',label:'Prospecção B2B',provider:'modo',source:'MODO Prospector',description:'Estrutura ICPs, campanhas de prospecção e priorização de leads no contexto do workspace, sem enviar abordagem automaticamente.',effect:'read',maturity:'active',approvalRequired:false,roles:['growth','crm']},
  {id:'growth.prospecting.discovery',label:'Descoberta B2B',provider:'modo',source:'MODO Prospector + Apify',description:'Executa discovery externo controlado para encontrar empresas e contatos aderentes ao ICP; exige aprovação explícita e não envia outreach.',effect:'prepare',maturity:'guarded',approvalRequired:true,roles:['growth','crm']},
  {id:'growth.content.create',label:'Criar conteúdo',provider:'modo',source:'MODO Content Engine',description:'Cria conteúdo contextual usando memória de marca e objetivo comercial.',effect:'prepare',maturity:'planned',approvalRequired:false,roles:['growth']},
  {id:'growth.publish',label:'Publicar conteúdo',provider:'modo',source:'MODO Publisher',description:'Publica em canal autorizado somente após aprovação explícita.',effect:'external',maturity:'planned',approvalRequired:true,roles:['growth']},
  {id:'growth.campaign.activate',label:'Ativar campanha',provider:'modo',source:'MODO Ads Copilot',description:'Ativação ou alteração de orçamento permanece fora do rollout atual do NexOffice.',effect:'external',maturity:'planned',approvalRequired:true,roles:['growth','controller']},

  {id:'fiscal.invoice.issue',label:'Emitir NFS-e',provider:'taxagent',source:'TaxAgent',description:'Emite documento fiscal pelo motor dedicado somente após aprovação e readiness fiscal.',effect:'external',maturity:'guarded',approvalRequired:true,roles:['erp','controller'],actionTypes:['invoice.issue']},

  {id:'legal.operational_signals.read',label:'Sinais jurídicos agregados',provider:'nexjud',source:'NexJud',description:'Consome somente sinais operacionais agregados do domínio jurídico; processos e peças permanecem no NexJud.',effect:'read',maturity:'active',approvalRequired:false,roles:['controller','secretary']},
  {id:'condo.operational_signals.read',label:'Sinais condominiais agregados',provider:'sindcopilot',source:'SindCopilot',description:'Consome somente sinais operacionais agregados; moradores, ocorrências e documentos brutos permanecem no SindCopilot.',effect:'read',maturity:'active',approvalRequired:false,roles:['controller','secretary']}
];

export function capabilityDefinition(id:string){return CAPABILITY_REGISTRY.find(item=>item.id===id)||null}
export function capabilityIdsForProvider(provider:string){return CAPABILITY_REGISTRY.filter(item=>item.provider===provider&&item.maturity!=='planned').map(item=>item.id)}
export function capabilitiesForRole(role:string){return CAPABILITY_REGISTRY.filter(item=>item.roles.includes(role as AgentRole))}

export function capabilityForAction(actionType:string){
  const normalized=String(actionType||'').trim();
  const exact=CAPABILITY_REGISTRY.find(item=>item.actionTypes?.includes(normalized));
  if(exact)return exact;
  if(normalized.startsWith('payment.charge')||normalized.startsWith('collection.charge'))return capabilityDefinition('payments.charge.create');
  if(normalized.startsWith('message.send'))return capabilityDefinition('communication.message.send');
  if(normalized.startsWith('campaign.')||normalized.startsWith('growth.'))return capabilityDefinition('growth.plan');
  if(normalized.startsWith('assistant.')||normalized.startsWith('voice.'))return capabilityDefinition('assistant.business.conversation');
  return null;
}