export type VerticalPackId='general'|'legal'|'health'|'condo'|'commerce';

const CORE_MODULES=['crm','agenda','tasks','erp','collections','documents','service','command-center','agents','growth','usage'];

export const VERTICAL_PACKS:Record<VerticalPackId,any>={
  general:{
    id:'general',label:'NexOffice',description:'Sistema operacional horizontal para serviços e operações empresariais.',modules:CORE_MODULES,
    terminology:{contact:'Cliente',deal:'Oportunidade',appointment:'Compromisso',receivable:'Recebível'},
    recommendedIntegrations:['docwallet','staff','smartbots','nextgen','modo','taxagent'],
    domainOwner:null,excludedObjects:[],privacy:{sensitiveDomainData:false},plannedCapabilities:[]
  },
  legal:{
    id:'legal',label:'NexOffice Legal',description:'Camada operacional e comercial conectável ao NexJud, sem duplicar o domínio jurídico.',modules:[...CORE_MODULES,'legal-pack'],
    terminology:{contact:'Cliente',deal:'Honorários / oportunidade',appointment:'Agenda',receivable:'Honorário a receber'},
    recommendedIntegrations:['docwallet','staff','smartbots','nextgen','modo','taxagent','nexjud'],
    domainOwner:'nexjud',excludedObjects:['processo judicial','prazo processual','petição','jurimetria'],privacy:{sensitiveDomainData:false},plannedCapabilities:['matter-link']
  },
  health:{
    id:'health',label:'NexOffice Health',description:'Camada administrativa e empresarial para organizações de saúde, conectável ao MyDataMed/Health Wallet sem armazenar identidade de paciente ou dado clínico.',modules:[...CORE_MODULES,'health-pack'],
    terminology:{contact:'Contato empresarial / parceiro',deal:'Oportunidade / contrato',appointment:'Agenda operacional',receivable:'Recebível'},
    recommendedIntegrations:['docwallet','staff','smartbots','nextgen','modo','taxagent','mydatamed'],
    domainOwner:'mydatamed',
    excludedObjects:['identidade de paciente','CPF/CNS de paciente','prontuário','diagnóstico','prescrição','medicação','exame clínico bruto','nota clínica','genética','dado de wearable','dados Health Connect'],
    privacy:{sensitiveDomainData:true,forbidRawHealthData:true,forbidPatientIdentity:true,aggregateOperationalSignalsOnly:true},
    plannedCapabilities:['organization-link','aggregate-ops-signals']
  },
  condo:{
    id:'condo',label:'NexOffice Condo',description:'Camada administrativa, financeira e de relacionamento conectável ao SindCopilot.',modules:[...CORE_MODULES,'condo-pack'],
    terminology:{contact:'Morador / fornecedor',deal:'Demanda / contrato',appointment:'Agenda condominial',receivable:'Cobrança'},
    recommendedIntegrations:['docwallet','staff','smartbots','nextgen','modo','taxagent','sindcopilot'],
    domainOwner:'sindcopilot',excludedObjects:['unidade condominial canônica','assembleia canônica','ocorrência condominial canônica'],privacy:{sensitiveDomainData:false},plannedCapabilities:['condo-link']
  },
  commerce:{
    id:'commerce',label:'NexOffice Commerce',description:'Operação comercial para lojas e e-commerce, com CRM, cobrança, atendimento, growth e fiscal no mesmo plano de controle.',modules:[...CORE_MODULES,'commerce-pack'],
    terminology:{contact:'Cliente',deal:'Venda / oportunidade',appointment:'Agenda',receivable:'Pedido / venda a receber'},
    recommendedIntegrations:['smartbots','nextgen','modo','taxagent','docwallet','staff'],
    domainOwner:null,excludedObjects:[],privacy:{sensitiveDomainData:false},plannedCapabilities:['orders','catalog-sync','inventory-signals','commerce-channel-connectors']
  }
};

export function verticalPack(id:string){return VERTICAL_PACKS[id as VerticalPackId]||VERTICAL_PACKS.general}