export type VerticalPackId='general'|'legal'|'health'|'condo'|'commerce'|'creator';

const CORE_MODULES=['crm','agenda','tasks','erp','collections','documents','service','command-center','agents','growth','usage','flexible-modules'];

export const VERTICAL_PACKS:Record<VerticalPackId,any>={
  general:{
    id:'general',label:'NexOffice',description:'Sistema operacional horizontal para serviços e operações empresariais.',modules:CORE_MODULES,
    terminology:{contact:'Cliente',deal:'Oportunidade',appointment:'Compromisso',receivable:'Recebível'},
    recommendedIntegrations:['docwallet','staff','smartbots','nextgen','modo','taxagent'],
    domainOwner:null,excludedObjects:[],privacy:{sensitiveDomainData:false},plannedCapabilities:['flexible-modules','contact-360']
  },
  legal:{
    id:'legal',label:'NexOffice Legal',description:'Camada operacional e comercial conectável ao NexJud, sem duplicar o domínio jurídico.',modules:[...CORE_MODULES,'legal-pack'],
    terminology:{contact:'Cliente',deal:'Honorários / oportunidade',appointment:'Agenda',receivable:'Honorário a receber'},
    recommendedIntegrations:['docwallet','staff','smartbots','nextgen','modo','taxagent','nexjud'],
    domainOwner:'nexjud',excludedObjects:['processo judicial','prazo processual','petição','jurimetria'],privacy:{sensitiveDomainData:false},plannedCapabilities:['matter-link','flexible-modules','contact-360']
  },
  health:{
    id:'health',label:'NexOffice Health',description:'Camada administrativa e empresarial para organizações de saúde, conectável ao MyDataMed/Health Wallet sem armazenar identidade de paciente ou dado clínico vindo da integração.',modules:[...CORE_MODULES,'health-pack'],
    terminology:{contact:'Contato / atendido',deal:'Oportunidade / contrato',appointment:'Agenda operacional',receivable:'Recebível'},
    recommendedIntegrations:['docwallet','staff','smartbots','nextgen','modo','taxagent','mydatamed'],
    domainOwner:'mydatamed',
    excludedObjects:['identidade de paciente via bridge MyDataMed','CPF/CNS de paciente via bridge','prontuário','diagnóstico','prescrição','medicação','exame clínico bruto','nota clínica','genética','dado de wearable','dados Health Connect'],
    privacy:{sensitiveDomainData:true,forbidRawHealthData:true,forbidPatientIdentity:true,forbidRawHealthDataFromBridge:true,forbidPatientIdentityFromBridge:true,aggregateOperationalSignalsOnly:true,standaloneAdministrativeRecordsAllowed:true},
    plannedCapabilities:['organization-link','aggregate-ops-signals','administrative-service-history','flexible-modules']
  },
  condo:{
    id:'condo',label:'NexOffice Condo',description:'Camada administrativa, financeira e de relacionamento conectável ao SindCopilot.',modules:[...CORE_MODULES,'condo-pack'],
    terminology:{contact:'Morador / fornecedor',deal:'Demanda / contrato',appointment:'Agenda condominial',receivable:'Cobrança'},
    recommendedIntegrations:['docwallet','staff','smartbots','nextgen','modo','taxagent','sindcopilot'],
    domainOwner:'sindcopilot',excludedObjects:['unidade condominial canônica','assembleia canônica','ocorrência condominial canônica'],privacy:{sensitiveDomainData:false},plannedCapabilities:['condo-link','flexible-modules','contact-360']
  },
  commerce:{
    id:'commerce',label:'NexOffice Commerce',description:'Operação comercial para lojas e e-commerce, com CRM, cobrança, atendimento, growth e fiscal no mesmo plano de controle.',modules:[...CORE_MODULES,'commerce-pack'],
    terminology:{contact:'Cliente',deal:'Venda / oportunidade',appointment:'Agenda',receivable:'Pedido / venda a receber'},
    recommendedIntegrations:['smartbots','nextgen','modo','taxagent','docwallet','staff'],
    domainOwner:null,excludedObjects:[],privacy:{sensitiveDomainData:false},plannedCapabilities:['orders','catalog-sync','inventory-signals','commerce-channel-connectors','flexible-modules','contact-360']
  },
  creator:{
    id:'creator',label:'NexOffice Creator',description:'Escritório digital para creators, influenciadores e microinfluenciadores: marcas, campanhas, entregáveis, agenda, financeiro e growth no mesmo fluxo.',modules:[...CORE_MODULES,'creator-pack'],
    terminology:{contact:'Marca / parceiro',deal:'Campanha / oportunidade',appointment:'Gravação / entrega',receivable:'Cachê a receber'},
    recommendedIntegrations:['modo','smartbots','docwallet','staff','taxagent','nextgen'],
    domainOwner:null,excludedObjects:[],privacy:{sensitiveDomainData:false},plannedCapabilities:['brand-deals','editorial-calendar','deliverables','media-kit','campaign-performance','google-ads-via-modo','contact-360']
  }
};

export function verticalPack(id:string){return VERTICAL_PACKS[id as VerticalPackId]||VERTICAL_PACKS.general}