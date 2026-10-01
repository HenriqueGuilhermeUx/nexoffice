import {query} from './db.js';

type ReadinessCheck={key:string;label:string;ready:boolean;required:boolean;detail:string};

const digits=(value:unknown)=>String(value||'').replace(/\D/g,'');
const enabled=(value:unknown)=>String(value||'false').toLowerCase()==='true';

export async function taxAgentFiscalReadiness(workspaceId:string,operationId:string,environment:'test'|'production'='test'){
  const operation=(await query<any>(`select o.*,c.name contact_name,c.document_number,c.custom_fields
    from business_operations o join crm_contacts c on c.id=o.contact_id
    where o.id=$1 and o.workspace_id=$2`,[operationId,workspaceId]))[0];
  if(!operation)return {ok:false as const,error:'operation_not_found'};

  const integration=(await query<any>(`select external_account_ref,status,secret_ref,config
    from integrations where workspace_id=$1 and provider='taxagent' limit 1`,[workspaceId]))[0]||null;
  const custom=operation.custom_fields||{};
  const customerTaxId=digits(operation.document_number);
  const cityCode=digits(custom.cityCode||custom.city_code||custom.ibgeCityCode||'');
  const companyId=String(integration?.external_account_ref||'').trim();
  const secretRef=String(integration?.secret_ref||'').trim();
  const workspaceCredential=secretRef?String(process.env[secretRef]||'').trim():'';
  const fallbackCredential=String(process.env.TAXAGENT_API_KEY||'').trim();
  const baseUrl=String(process.env.TAXAGENT_BASE_URL||'').trim();
  const externalActionsEnabled=enabled(process.env.NEXOFFICE_EXTERNAL_ACTIONS);

  const checks:ReadinessCheck[]=[
    {key:'customer_tax_id',label:'CPF/CNPJ do cliente',ready:Boolean(customerTaxId),required:true,detail:customerTaxId?'Documento fiscal disponível no CRM.':'Informe o documento fiscal do cliente no CRM.'},
    {key:'customer_city_code',label:'Município do cliente',ready:cityCode.length===7,required:true,detail:cityCode.length===7?'Código IBGE de 7 dígitos disponível no CRM.':'Informe o código IBGE de 7 dígitos no cadastro do cliente.'},
    {key:'service_description',label:'Descrição do serviço',ready:String(operation.description||'').trim().length>=3,required:true,detail:'A descrição da Operação Comercial alimenta a preparação fiscal.'},
    {key:'positive_amount',label:'Valor da operação',ready:Number(operation.amount_minor||0)>0,required:true,detail:Number(operation.amount_minor||0)>0?'Valor positivo disponível.':'Informe um valor maior que zero antes de preparar a nota.'},
    {key:'taxagent_integration',label:'Integração TaxAgent',ready:Boolean(integration),required:true,detail:integration?'Integração TaxAgent encontrada para o workspace.':'Conecte o TaxAgent a este workspace.'},
    {key:'taxagent_company',label:'Empresa fiscal mapeada',ready:Boolean(companyId),required:true,detail:companyId?'Empresa TaxAgent mapeada.':'Configure o identificador da empresa TaxAgent.'},
    {key:'taxagent_credential',label:'Credencial TaxAgent',ready:Boolean(workspaceCredential||fallbackCredential),required:true,detail:(workspaceCredential||fallbackCredential)?'Credencial disponível no ambiente.':'Configure a credencial TaxAgent do workspace/ambiente.'},
    {key:'taxagent_base_url',label:'Endpoint TaxAgent',ready:Boolean(baseUrl),required:true,detail:baseUrl?'Endpoint TaxAgent configurado.':'Configure TAXAGENT_BASE_URL.'},
    {key:'production_gate',label:'Ações externas de produção',ready:environment==='test'||externalActionsEnabled,required:environment==='production',detail:environment==='test'?'Teste não exige ativação de ações externas de produção.':externalActionsEnabled?'Gate de ações externas está habilitado; aprovação humana continua obrigatória.':'Produção permanece bloqueada por NEXOFFICE_EXTERNAL_ACTIONS=false.'}
  ];

  const blockers=checks.filter(check=>check.required&&!check.ready);
  const warnings:string[]=[];
  if(operation.invoice_action_id)warnings.push('Já existe uma ação fiscal preparada para esta operação; use o fluxo de aprovação/sincronização existente.');
  if(!operation.document_ref_id)warnings.push('Contrato DocWallet não vinculado. Isso não bloqueia a preparação fiscal, mas reduz a completude da linhagem comercial.');
  warnings.push('Inscrição Municipal não é presumida como requisito universal pelo NexOffice; exigências cadastrais municipais permanecem responsabilidade do motor TaxAgent/município.');

  return {
    ok:true as const,
    operationId,
    environment,
    ready:blockers.length===0&&!operation.invoice_action_id,
    alreadyPrepared:Boolean(operation.invoice_action_id),
    humanApprovalRequired:true,
    checks,
    blockers:blockers.map(item=>({key:item.key,label:item.label,detail:item.detail})),
    warnings,
    suggestedDefaults:{customerCityCode:cityCode.length===7?cityCode:null},
    integration:{connected:Boolean(integration),status:integration?.status||null,companyMapped:Boolean(companyId),credentialConfigured:Boolean(workspaceCredential||fallbackCredential),baseUrlConfigured:Boolean(baseUrl)},
    safety:{externalEffect:false,remoteTaxAgentCall:false,productionExecutionEnabled:environment==='production'&&externalActionsEnabled,municipalRegistrationAssumedRequired:false},
    externalEffect:false
  };
}
