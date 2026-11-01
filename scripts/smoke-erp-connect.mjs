const base=process.env.SMOKE_API_URL||'http://127.0.0.1:4000';
let token='',workspace='';

async function call(path,{method='GET',body,auth=true}={}){
  const headers={'content-type':'application/json',accept:'application/json'};
  if(auth&&token)headers.authorization='Bearer '+token;
  if(auth&&workspace)headers['x-workspace-id']=workspace;
  const response=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(method+' '+path+' -> '+response.status+' '+JSON.stringify(payload));
  return payload;
}
const assert=(value,message)=>{if(!value)throw new Error('ASSERT: '+message)};

const registered=await call('/v1/auth/register',{method:'POST',auth:false,body:{
  name:'ERP Connect Smoke',
  email:'erp-connect-'+Date.now()+'@nexoffice.test',
  password:'SmokePass123!',
  businessName:'ERP Context Company',
  vertical:'general'
}});
token=registered.token;workspace=registered.workspace.id;

const contact=await call('/v1/crm/contacts',{method:'POST',body:{
  kind:'company',
  name:'Cliente ERP',
  email:'cliente.erp@nexoffice.test',
  source:'smoke'
}});

await call('/v1/onboarding/business/confirm',{method:'PUT',body:{
  sector:'services',
  revenueModel:'mixed',
  sellsServices:true,
  mainDependency:'finance',
  metadata:{
    commercial:{primaryGoal:'cash'},
    operations:{biggestBottleneck:'finance'},
    systems:{currentTools:['erp','accounting'],namedTools:['ERP Smoke']},
    onboarding:{version:'business-v2',primaryGoal:'cash'}
  },
  complete:true
}});

const customers=['Codigo;Cliente;Email;CNPJ;Status','C1;Cliente ERP;cliente.erp@nexoffice.test;12345678000190;Ativo'].join('\n');
const customerPreview=await call('/v1/connect/erp/preview',{method:'POST',body:{
  filename:'clientes.csv',content:customers,resourceKind:'customer',sourceSystem:'ERP Smoke'
}});
assert(customerPreview.safety?.persisted===false&&customerPreview.safety?.rawFileStored===false,'ERP preview must persist nothing');
assert(customerPreview.normalizedSample?.[0]?.email==='cliente.erp@nexoffice.test','ERP customer must normalize email');
assert(customerPreview.mapping?.name==='cliente','ERP customer must map name field');

const customerImport=await call('/v1/connect/erp/import',{method:'POST',body:{
  filename:'clientes.csv',content:customers,resourceKind:'customer',sourceSystem:'ERP Smoke',datasetName:'Clientes ERP',humanConfirmed:true
}});
assert(customerImport.imported===1,'ERP customer import must add one observation');
assert(customerImport.safety?.rawRowsStored===false&&customerImport.safety?.externalEffects===false,'ERP import stores normalized context only');

const receivables=['Numero;Cliente;Email;Valor;Vencimento;Status','R1;Cliente ERP;cliente.erp@nexoffice.test;1.250,50;01/10/2026;Aberto'].join('\n');
const receivablePreview=await call('/v1/connect/erp/preview',{method:'POST',body:{
  filename:'receber.csv',content:receivables,resourceKind:'receivable',sourceSystem:'ERP Smoke'
}});
assert(receivablePreview.normalizedSample?.[0]?.amountMinor===125050,'ERP receivable must normalize BRL amount');
assert(receivablePreview.normalizedSample?.[0]?.partyEmail==='cliente.erp@nexoffice.test','ERP receivable must normalize counterparty email');

const receivableImport=await call('/v1/connect/erp/import',{method:'POST',body:{
  filename:'receber.csv',content:receivables,resourceKind:'receivable',sourceSystem:'ERP Smoke',datasetName:'Contas a receber ERP',humanConfirmed:true
}});
assert(receivableImport.imported===1,'ERP receivable import must add one observation');

const duplicate=await call('/v1/connect/erp/import',{method:'POST',body:{
  filename:'receber.csv',content:receivables,resourceKind:'receivable',sourceSystem:'ERP Smoke',datasetName:'Contas a receber ERP',humanConfirmed:true
}});
assert(duplicate.imported===0&&duplicate.duplicates===1,'ERP reimport must deduplicate unchanged observations');

const sources=await call('/v1/business-graph/sources');
assert(sources.external.some(item=>item.source==='external.erp'&&item.records===2),'source registry must expose semantic ERP context');

const graph=await call('/v1/business-graph/overview?days=90&includeGraph=true');
const customerNode=graph.graph.nodes.find(node=>node.source==='external.erp'&&node.kind==='external_organization'&&node.label==='Cliente ERP');
const receivableNode=graph.graph.nodes.find(node=>node.source==='external.erp'&&node.kind==='financial_entry'&&Number(node.attributes?.amountMinor)===125050);
const crmNode=graph.graph.nodes.find(node=>node.source==='nexoffice.crm'&&node.sourceId===contact.id);
assert(customerNode,'ERP customer must become external organization');
assert(receivableNode,'ERP receivable must become financial entry');
assert(crmNode,'CRM contact must exist in graph');
assert(graph.graph.edges.some(edge=>edge.from===customerNode.id&&edge.kind==='customer_of'&&edge.source==='external.erp'),'ERP customer must be related to workspace organization');
assert(graph.graph.edges.some(edge=>edge.from===crmNode.id&&edge.to===receivableNode.id&&edge.kind==='financial_activity'&&edge.source==='external.erp'),'ERP receivable must link to CRM contact by exact email');
assert(graph.executiveSignals.some(signal=>signal.code==='external_receivables_overdue'&&Number(signal.evidence?.amountMinor)===125050),'overdue ERP receivable must become executive signal');

const diagnosis=await call('/v1/onboarding/business/diagnosis');
assert(diagnosis.connections.connected.some(item=>item.key==='erp'),'ERP recommendation must become connected after semantic import');

const executive=await call('/v1/assistant/executive-context');
const priority=executive.priorities.find(item=>item.code==='external_receivables_overdue');
assert(priority,'Maya must surface overdue ERP receivable');
assert(priority.recommendedNextStep,'ERP overdue priority must carry a next step');
assert(executive.evidencePolicy?.externalEffects===false,'Maya remains read-only');

console.log(JSON.stringify({
  ok:true,
  module:'ERP Universal Import V1',
  workspace,
  imported:customerImport.imported+receivableImport.imported,
  deduplicated:duplicate.duplicates,
  graph:{customer:true,receivable:true,crmLinked:true},
  mayaPriority:priority.code,
  externalEffects:false
},null,2));
