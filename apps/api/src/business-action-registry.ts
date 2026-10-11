export type BusinessActionDefinition={
  id:string;
  label:string;
  domain:'crm'|'finance'|'operations'|'inventory'|'purchasing'|'documents'|'growth';
  permission:string;
  risk:'low'|'medium'|'high';
  externalEffect:boolean;
  humanApprovalRequired:boolean;
  executableByAi:boolean;
  description:string;
};

export const BUSINESS_ACTIONS:BusinessActionDefinition[]=[
  {id:'task.followup.create',label:'Criar follow-up',domain:'crm',permission:'crm.write',risk:'low',externalEffect:false,humanApprovalRequired:false,executableByAi:true,description:'Cria uma tarefa interna ligada ao cliente.'},
  {id:'reconciliation.confirm',label:'Confirmar conciliação',domain:'finance',permission:'finance.write',risk:'medium',externalEffect:false,humanApprovalRequired:true,executableByAi:false,description:'Vincula uma movimentação bancária importada a um lançamento e marca o lançamento como pago.'},
  {id:'inventory.adjust',label:'Ajustar estoque',domain:'inventory',permission:'inventory.write',risk:'medium',externalEffect:false,humanApprovalRequired:true,executableByAi:false,description:'Registra ajuste rastreável de entrada ou saída de estoque.'},
  {id:'purchasing.plan',label:'Planejar compra',domain:'purchasing',permission:'purchasing.write',risk:'low',externalEffect:false,humanApprovalRequired:false,executableByAi:true,description:'Cria um rascunho interno de compra; não envia pedido ao fornecedor.'},
  {id:'materials.proposal.prepare',label:'Preparar proposta',domain:'documents',permission:'materials.write',risk:'low',externalEffect:false,humanApprovalRequired:false,executableByAi:true,description:'Prepara o contexto para criação de uma proposta sem publicar ou enviar.'},
  {id:'operations.continue',label:'Continuar operação',domain:'operations',permission:'operations.read',risk:'low',externalEffect:false,humanApprovalRequired:false,executableByAi:true,description:'Abre a operação comercial no contexto certo sem executar efeito externo.'},
  {id:'finance.receivables.review',label:'Revisar recebíveis',domain:'finance',permission:'finance.read',risk:'low',externalEffect:false,humanApprovalRequired:false,executableByAi:true,description:'Abre o financeiro no contexto de recebíveis e cobranças.'},
  {id:'relationship.review',label:'Revisar relacionamento',domain:'crm',permission:'crm.read',risk:'low',externalEffect:false,humanApprovalRequired:false,executableByAi:true,description:'Abre o contexto do cliente para revisão antes da próxima ação.'},
  {id:'profitability.review',label:'Revisar rentabilidade',domain:'finance',permission:'finance.read',risk:'low',externalEffect:false,humanApprovalRequired:false,executableByAi:true,description:'Leva para a análise de rentabilidade sem alterar dados.'},
  {id:'reconciliation.review',label:'Revisar conciliação',domain:'finance',permission:'finance.read',risk:'low',externalEffect:false,humanApprovalRequired:false,executableByAi:true,description:'Leva para a conciliação inteligente sem confirmar correspondências.'},
  {id:'recurrence.activate',label:'Ativar recorrência',domain:'finance',permission:'finance.write',risk:'medium',externalEffect:false,humanApprovalRequired:true,executableByAi:false,description:'Ativa próximos ciclos futuros sem retroagir cobranças.'},
  {id:'message.send',label:'Enviar mensagem',domain:'crm',permission:'crm.write',risk:'high',externalEffect:true,humanApprovalRequired:true,executableByAi:false,description:'Comunicação externa; sempre respeita aprovação/política.'},
  {id:'fiscal.issue',label:'Emitir nota',domain:'finance',permission:'finance.write',risk:'high',externalEffect:true,humanApprovalRequired:true,executableByAi:false,description:'Emissão fiscal externa; usa fluxo dedicado e aprovação humana.'},
  {id:'purchasing.receive',label:'Confirmar recebimento',domain:'purchasing',permission:'inventory.write',risk:'medium',externalEffect:false,humanApprovalRequired:true,executableByAi:false,description:'Confirma recebimento físico e atualiza estoque; exige ação humana.'},
  {id:'purchasing.send_to_supplier',label:'Enviar pedido ao fornecedor',domain:'purchasing',permission:'purchasing.write',risk:'high',externalEffect:true,humanApprovalRequired:true,executableByAi:false,description:'Contato externo com fornecedor; nunca é feito automaticamente pelo pack lite.'}
];

export function businessActionDefinition(id:string){return BUSINESS_ACTIONS.find(action=>action.id===id)||null;}
