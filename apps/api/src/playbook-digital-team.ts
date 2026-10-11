export type DigitalAgentRole='secretary'|'service'|'crm'|'erp'|'collections'|'controller'|'documents'|'growth';

export type DigitalAgent={
  name:'Maya'|'Sofia'|'Clara'|'Nico'|'Theo'|'Dora'|'Alex';
  role:DigitalAgentRole;
  specialty:string;
};

const agents:Record<string,DigitalAgent>={
  maya:{name:'Maya',role:'growth',specialty:'Orquestração & Growth'},
  sofia:{name:'Sofia',role:'secretary',specialty:'Agenda & Rotina'},
  clara:{name:'Clara',role:'crm',specialty:'CRM & Relacionamento'},
  nico:{name:'Nico',role:'erp',specialty:'Operação & ERP'},
  theoCollections:{name:'Theo',role:'collections',specialty:'Cobrança & Recebíveis'},
  theoController:{name:'Theo',role:'controller',specialty:'Controller & Financeiro'},
  dora:{name:'Dora',role:'documents',specialty:'Documentos & Propostas'},
  alex:{name:'Alex',role:'service',specialty:'Atendimento'}
};

export const MAYA_ORCHESTRATOR=agents.maya;

export function agentForPlaybookAction(actionId:string):DigitalAgent{
  if(actionId==='task.followup.create')return agents.sofia;
  if(actionId==='relationship.review'||actionId==='message.send')return agents.clara;
  if(actionId==='materials.proposal.prepare')return agents.dora;
  if(actionId==='operations.continue'||actionId==='inventory.adjust'||actionId.startsWith('purchasing.'))return agents.nico;
  if(actionId==='finance.receivables.review'||actionId.startsWith('reconciliation.'))return agents.theoCollections;
  if(actionId==='profitability.review'||actionId==='recurrence.activate'||actionId==='fiscal.issue')return agents.theoController;
  return agents.maya;
}

export function teamForPlaybookSteps(steps:Array<{action_id?:string;actionId?:string}>){
  const byKey=new Map<string,DigitalAgent>();
  for(const step of steps){
    const actionId=String(step.action_id||step.actionId||'');
    const agent=agentForPlaybookAction(actionId);
    byKey.set(agent.name+':'+agent.role,agent);
  }
  return [...byKey.values()];
}


const templateActions:Record<string,string[]>={
  commercial_to_cash:['materials.proposal.prepare','operations.continue','fiscal.issue','finance.receivables.review','profitability.review','recurrence.activate'],
  relationship_recovery:['task.followup.create','relationship.review','materials.proposal.prepare','message.send'],
  renewal_expansion:['relationship.review','materials.proposal.prepare','task.followup.create','message.send'],
  stock_replenishment:['purchasing.plan','purchasing.send_to_supplier','purchasing.receive']
};

export function teamForPlaybookTemplate(templateKey:string){
  return teamForPlaybookSteps((templateActions[templateKey]||[]).map(actionId=>({actionId})));
}
