import {query} from './db.js';
import {buildBusinessIntelligence,getBusinessProfile,readBusinessIntelligence} from './business-intelligence.js';

const n=(v:any)=>Number(v||0);
const clamp=(v:number,min=0,max=100)=>Math.max(min,Math.min(max,Math.round(v)));
const round=(v:number,d=1)=>{const p=10**d;return Math.round(v*p)/p};

function knowledgeLevel(value:number){
  if(value>=90)return{key:'advanced',label:'Leitura avançada',message:'O NexOffice já tem uma visão ampla e longitudinal do seu negócio.'};
  if(value>=70)return{key:'solid',label:'Boa leitura',message:'Já existe base suficiente para uma leitura consistente. Continue operando normalmente para aprofundar o histórico.'};
  if(value>=40)return{key:'learning',label:'Aprendendo rápido',message:'A base já começou a ficar útil, mas alguns blocos ainda aumentariam bastante a precisão.'};
  return{key:'starting',label:'Começando',message:'Complete o essencial e use o NexOffice na rotina. A leitura melhora automaticamente conforme a operação acontece.'};
}

export async function getBusinessKnowledge(workspaceId:string){
  const profile=await getBusinessProfile(workspaceId);
  let health=await readBusinessIntelligence(workspaceId);
  if(!health)health=await buildBusinessIntelligence(workspaceId);
  const [row]=await query<any>(`select
    (select count(*) from ledger_entries where workspace_id=$1)::int ledger_entries,
    (select count(*) from crm_contacts where workspace_id=$1)::int contacts,
    (select count(*) from crm_deals where workspace_id=$1)::int deals,
    (select count(*) from tasks where workspace_id=$1 and status not in ('cancelled'))::int tasks,
    (select count(*) from tasks where workspace_id=$1 and status='done' and coalesce(completed_at,updated_at)>=now()-interval '30 days')::int completed_tasks_30,
    (select count(*) from appointments where workspace_id=$1 and starts_at>=now()-interval '90 days' and status<>'cancelled')::int appointments_90,
    (select count(*) from appointments where workspace_id=$1 and starts_at>=now() and status<>'cancelled')::int future_appointments,
    (select count(distinct metric_key) from intelligence_metrics where workspace_id=$1 and source<>'derived')::int manual_metrics,
    (select count(*) from business_events where workspace_id=$1 and occurred_at>=now()-interval '30 days')::int events_30,
    (select max(occurred_at) from business_events where workspace_id=$1) last_event_at,
    (select count(*) from recurring_rules where workspace_id=$1 and active=true and direction='income')::int recurring_income_rules,
    (select source from crm_contacts where workspace_id=$1 and source is not null and btrim(source)<>'' group by source order by count(*) desc,source asc limit 1) top_contact_source,
    (select count(*) from crm_activities where workspace_id=$1 and occurred_at>=now()-interval '30 days')::int interactions_30,
    (select count(*) from document_refs where workspace_id=$1)::int documents
  `,[workspaceId]);

  const profilePct=Number(profile?.completeness_pct||0);
  const official=Number(health?.knowledge?.percent||0);
  const hasOperations=n(row?.tasks)>0||n(row?.completed_tasks_30)>0||n(row?.appointments_90)>0||n(row?.future_appointments)>0||n(row?.events_30)>=3;
  const hasLongitudinalUse=n(row?.events_30)>=5||n(row?.interactions_30)>=3;
  const hasSectorDepth=n(row?.manual_metrics)>0||((Boolean(profile?.uses_agenda)&&n(row?.appointments_90)+n(row?.future_appointments)>=3)||(Boolean(profile?.uses_contracts)&&n(row?.documents)>0)||(Boolean(profile?.recurring_revenue)&&n(row?.recurring_income_rules)>0));

  const coverage=[
    {key:'profile',label:'Contexto do negócio',earned:round(profilePct*.30),max:30,covered:profilePct>=70,source:'Perfil inteligente',why:'Setor, modelo de receita, porte e dependências mudam a forma de interpretar os mesmos números.',action:'Complete o perfil inteligente.'},
    {key:'finance',label:'Movimentação financeira',earned:n(row?.ledger_entries)>0?25:0,max:25,covered:n(row?.ledger_entries)>0,source:'Financeiro',why:'Entradas, saídas, recebíveis e pagamentos mostram capacidade e pressão de caixa.',action:'Registre ou importe movimentações financeiras.'},
    {key:'customers',label:'Base de clientes',earned:n(row?.contacts)>0?12:0,max:12,covered:n(row?.contacts)>0,source:'CRM',why:'Clientes permitem medir concentração, recorrência e origem da demanda.',action:'Cadastre clientes reais da operação.'},
    {key:'sales',label:'Vendas e oportunidades',earned:n(row?.deals)>0?10:0,max:10,covered:n(row?.deals)>0,source:'CRM comercial',why:'O funil ajuda o NexOffice a enxergar receita futura antes que ela chegue ao caixa.',action:'Registre oportunidades ou vendas em andamento.'},
    {key:'operations',label:'Rotina operacional',earned:hasOperations?8:0,max:8,covered:hasOperations,source:'Tarefas, agenda e eventos',why:'A rotina mostra se a operação está ganhando ou perdendo ritmo antes do reflexo financeiro.',action:Boolean(profile?.uses_agenda)?'Use agenda e tarefas no dia a dia.':'Use tarefas e rotinas no dia a dia.'},
    {key:'history',label:'Histórico vivo',earned:hasLongitudinalUse?7:0,max:7,covered:hasLongitudinalUse,source:'Uso do NexOffice',why:'Uma sequência de eventos é mais útil que uma fotografia isolada para detectar mudanças.',action:'Continue usando o NexOffice na rotina para formar histórico.'},
    {key:'sector',label:'Profundidade do setor',earned:hasSectorDepth?8:0,max:8,covered:hasSectorDepth,source:'Indicadores e sinais setoriais',why:'Cada setor tem sinais próprios que antecipam mudança de receita, caixa ou capacidade operacional.',action:Boolean(profile?.uses_agenda)?'Mantenha agenda e indicadores do setor atualizados.':'Adicione um indicador operacional relevante do seu setor.'}
  ];
  const liveEstimate=clamp(coverage.reduce((sum,x)=>sum+Number(x.earned||0),0));
  const nextSteps=coverage.filter(x=>!x.covered).map(x=>({key:x.key,title:x.action,gainPotential:round(x.max-x.earned),why:x.why,source:x.source})).sort((a,b)=>b.gainPotential-a.gainPotential);
  const suggestions:Array<{field:string;value:any;reason:string}>=[];
  if(!profile?.uses_agenda&&(n(row?.appointments_90)+n(row?.future_appointments)>0))suggestions.push({field:'usesAgenda',value:true,reason:'Você já usa compromissos/agenda no NexOffice.'});
  if(!profile?.recurring_revenue&&n(row?.recurring_income_rules)>0)suggestions.push({field:'recurringRevenue',value:true,reason:'Há receitas recorrentes ativas registradas.'});
  if(!profile?.primary_sales_channel&&row?.top_contact_source)suggestions.push({field:'primarySalesChannel',value:String(row.top_contact_source),reason:'Esse é o canal mais frequente nos contatos já registrados.'});
  if(!profile?.sells_services&&(n(row?.appointments_90)+n(row?.future_appointments)>0))suggestions.push({field:'sellsServices',value:true,reason:'A operação registrada contém atendimentos/agendamentos.'});

  const milestones=[40,70,85,95].map(target=>({target,reached:official>=target,label:target===40?'Base útil':target===70?'Boa leitura':target===85?'Leitura forte':'Leitura profunda'}));
  return{
    percent:official,
    liveEstimate,
    level:knowledgeLevel(official),
    profileCompletenessPct:profilePct,
    profile,
    onboarding:{shouldPrompt:profilePct<70,estimatedMinutes:2,steps:3},
    coverage,
    nextSteps:nextSteps.slice(0,5),
    suggestions,
    milestones,
    observed:{ledgerEntries:n(row?.ledger_entries),contacts:n(row?.contacts),deals:n(row?.deals),tasks:n(row?.tasks),appointments90:n(row?.appointments_90),futureAppointments:n(row?.future_appointments),manualMetrics:n(row?.manual_metrics),events30:n(row?.events_30),interactions30:n(row?.interactions_30),documents:n(row?.documents),recurringIncomeRules:n(row?.recurring_income_rules),lastEventAt:row?.last_event_at||null},
    snapshotAt:health?.snapshot?.as_of||null,
    note:'O percentual mede quanto contexto operacional o NexOffice possui para interpretar sua empresa. Não é nota de crédito, não aprova nem nega crédito e aumenta conforme a própria rotina é registrada.'
  };
}
