import {getFounderCockpit} from './business-founder-cockpit.js';
import {getComplianceOperationalSnapshot} from './business-compliance.js';
import {getBusinessChangeDigest} from './business-change-digest.js';

type ExecutiveDecision={
  id:string;
  title:string;
  detail:string;
  benefit:string;
  target:string;
  status:string;
  planItemId:string;
  taskId?:string|null;
  dueAt?:string|null;
  priority:number;
};

const money=(minor:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(minor||0)/100);
const shortDate=(value:string)=>new Intl.DateTimeFormat('pt-BR',{dateStyle:'medium'}).format(new Date(value));

function pickTeam(c:any){
  if(Number(c.money?.overdueCount||0)>0)return{name:'Theo',agentRole:'collections',title:'Cobrança',prompt:'Quais recebimentos vencidos devo priorizar hoje e qual sequência de ação você recomenda?'};
  if(Number(c.sales?.openDeals||0)>0)return{name:'Clara',agentRole:'crm',title:'CRM',prompt:'Quais oportunidades abertas merecem meu contato hoje e por quê?'};
  if(Number(c.operations?.overdueTasks||0)>0||Number(c.operations?.appointmentsToday||0)>0)return{name:'Sofia',agentRole:'secretary',title:'Secretária',prompt:'Organize minhas três prioridades executivas de hoje com base na agenda e nas pendências.'};
  return{name:'Nico',agentRole:'erp',title:'Operação',prompt:'Faça uma leitura executiva do meu negócio agora e me diga o próximo movimento mais importante.'};
}

export async function getExecutiveBrief(workspaceId:string){
  const [c,compliance,whatChanged]=await Promise.all([getFounderCockpit(workspaceId),getComplianceOperationalSnapshot(workspaceId),getBusinessChangeDigest(workspaceId,24)]) as [any,Awaited<ReturnType<typeof getComplianceOperationalSnapshot>>,Awaited<ReturnType<typeof getBusinessChangeDigest>>];
  const activeItems=(c.plan?.items||[]).filter((x:any)=>!['done','cancelled','superseded'].includes(String(x.status)));
  const decisions:ExecutiveDecision[]=activeItems.slice(0,3).map((x:any)=>({
    id:String(x.id),title:String(x.title),detail:String(x.rationale||''),benefit:String(x.benefit||''),target:String(x.action_target||'task'),status:String(x.status||'suggested'),planItemId:String(x.id),taskId:x.task_id||null,dueAt:x.due_at||null,priority:Number(x.priority||0)
  }));

  let attention:any=null;
  if(Number(c.money?.overdueCount||0)>0)attention={kind:'receivables',title:`${c.money.overdueCount} recebimento(s) vencido(s)`,detail:`Há ${money(c.money.overdueMinor)} vencido(s). Vale priorizar caixa antes que a pressão aumente.`,target:'finance'};
  else if(compliance.overdueActions>0)attention={kind:'compliance',title:`${compliance.overdueActions} ação(ões) de compliance vencida(s)`,detail:'Há pendências de compliance fora do prazo. O NexOffice mostra apenas o status agregado; detalhes e evidências continuam no produto especializado.',target:'compliance'};
  else if(compliance.dueWithin7Days&&compliance.nextDueAt)attention={kind:'compliance_deadline',title:'Prazo de compliance nesta semana',detail:`Há um próximo prazo em ${shortDate(compliance.nextDueAt)}. Vale conferir o plano de ação antes do vencimento.`,target:'compliance'};
  else if(Number(c.operations?.overdueTasks||0)>0)attention={kind:'execution',title:`${c.operations.overdueTasks} tarefa(s) vencida(s)`,detail:'Há trabalho importante fora do prazo. Limpar essas pendências reduz acúmulo operacional.',target:'agenda'};
  else if(c.changes?.attention?.[0])attention={kind:'business_change',title:String(c.changes.attention[0].title||'Ponto de atenção'),detail:String(c.changes.attention[0].detail||''),target:'trajectory'};

  let opportunity:any=null;
  if(Number(c.sales?.openDeals||0)>0)opportunity={kind:'pipeline',title:`${c.sales.openDeals} oportunidade(s) em aberto`,detail:`O pipeline soma ${money(c.sales.pipelineMinor)}. O próximo contato certo pode virar receita futura.`,target:'crm'};
  else if(c.changes?.wins?.[0])opportunity={kind:'positive_change',title:String(c.changes.wins[0].title||'Movimento positivo'),detail:String(c.changes.wins[0].detail||''),target:'trajectory'};
  else if(Number(c.health?.delta||0)>0)opportunity={kind:'momentum',title:'Saúde do negócio melhorando',detail:`A leitura avançou ${Number(c.health.delta)>0?'+':''}${c.health.delta} ponto(s) desde a referência recente.`,target:'trajectory'};

  const done=(c.plan?.items||[]).filter((x:any)=>x.status==='done').length;
  const total=(c.plan?.items||[]).length;
  const headline=decisions.length
    ?`${decisions.length} decisão${decisions.length===1?'':'ões'} merece${decisions.length===1?'':'m'} sua atenção hoje.`
    :attention?.title?'Há um ponto que merece sua atenção hoje.':'Sua operação está sem urgências críticas agora.';
  const team=pickTeam(c);

  return{
    generatedAt:new Date().toISOString(),
    version:'executive-30s-v1.1',
    headline,
    subheadline:'Veja o que exige decisão, o que mudou, um ponto de atenção e a melhor oportunidade em menos de 30 segundos.',
    health:c.health,
    money:c.money,
    sales:c.sales,
    operations:c.operations,
    compliance,
    decisions,
    attention,
    opportunity,
    whatChanged,
    weeklyProgress:{done,total,pct:total?Math.round(done/total*100):0,summary:c.plan?.plan?.summary||null},
    digitalTeam:team,
    recentResults:(c.results||[]).slice(0,2),
    note:'Leitura executiva baseada na operação registrada no NexOffice. O bloco O que mudou usa somente metadados operacionais, referências documentais e status de backup; não inclui conteúdo bruto de documentos ou arquivos de backup. Compliance aparece apenas por status agregado; dados sensíveis permanecem no produto especializado. Comparações antes/depois não provam causalidade e índices internos de risco não são expostos ao cliente.'
  };
}
