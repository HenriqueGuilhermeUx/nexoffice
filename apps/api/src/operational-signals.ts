export type OperationalSignal={
  id:string;
  source_product:string;
  signal_type:string;
  period_start:string;
  period_end:string;
  metrics:Record<string,unknown>;
  dimensions:Record<string,unknown>;
  created_at:string;
};

export type OperationalPriority={level:'high'|'normal';title:string;detail:string;target:'command'};

function n(value:unknown){const parsed=Number(value);return Number.isFinite(parsed)&&parsed>=0?parsed:0}

export function effectiveOperationalSignal(signals:OperationalSignal[],type:string):OperationalSignal|undefined{
  const matching=signals.filter(signal=>signal.signal_type===type).sort((a,b)=>new Date(b.period_end).getTime()-new Date(a.period_end).getTime());
  if(!matching.length)return undefined;
  const newestDay=matching[0].period_end.slice(0,10);
  const current=matching.filter(signal=>signal.period_end.slice(0,10)===newestDay);
  const workspaceOrTeam=current.find(signal=>String(signal.dimensions?.scope||'workspace')!=='member');
  if(workspaceOrTeam)return workspaceOrTeam;
  const members=current.filter(signal=>String(signal.dimensions?.scope||'')==='member');
  if(!members.length)return current[0];
  const metrics:Record<string,number>={};
  for(const signal of members){
    for(const [key,value] of Object.entries(signal.metrics||{})){
      const parsed=Number(value);
      if(Number.isFinite(parsed)&&parsed>=0)metrics[key]=(metrics[key]||0)+parsed;
    }
  }
  const first=members[0];
  return {...first,id:`aggregate:${type}:${newestDay}`,metrics,dimensions:{window:first.dimensions?.window||'day',scope:'team'}};
}

export function buildOperationalPriorities(vertical:string,signals:OperationalSignal[]):OperationalPriority[]{
  const priorities:OperationalPriority[]=[];

  if(vertical==='legal'){
    const deadlines=effectiveOperationalSignal(signals,'deadlines.summary');
    const overdue=n(deadlines?.metrics?.overdue),dueToday=n(deadlines?.metrics?.dueToday);
    if(overdue>0)priorities.push({level:'high',title:`${overdue} prazo(s) operacional(is) vencido(s) no NexJud`,detail:'Sinal agregado recebido do NexJud. Abra o produto jurídico para revisar os casos correspondentes.',target:'command'});
    if(dueToday>0)priorities.push({level:'high',title:`${dueToday} prazo(s) operacional(is) vencem hoje no NexJud`,detail:'Contagem agregada; nenhum processo, cliente ou conteúdo jurídico foi copiado para o NexOffice.',target:'command'});
    const monitoring=effectiveOperationalSignal(signals,'monitoring.summary');
    const unreviewed=n(monitoring?.metrics?.unreviewedMovements),alerts=n(monitoring?.metrics?.alerts);
    if(unreviewed>0)priorities.push({level:'normal',title:`${unreviewed} movimentação(ões) aguardam revisão no NexJud`,detail:alerts>0?`${alerts} alerta(s) operacional(is) também foram sinalizados.`:'Sinal operacional agregado do NexJud.',target:'command'});
    const workload=effectiveOperationalSignal(signals,'workload.summary');
    const backlog=n(workload?.metrics?.backlog),waitingReview=n(workload?.metrics?.waitingReview);
    if(backlog>0||waitingReview>0)priorities.push({level:'normal',title:'Carga jurídica operacional pede atenção',detail:`Backlog agregado: ${backlog}; aguardando revisão: ${waitingReview}.`,target:'command'});
  }

  if(vertical==='health'){
    const requests=effectiveOperationalSignal(signals,'requests.summary');
    const overdue=n(requests?.metrics?.overdue),escalated=n(requests?.metrics?.escalated);
    if(overdue>0)priorities.push({level:'high',title:`${overdue} solicitação(ões) operacionais vencida(s)`,detail:'Sinal administrativo agregado do ecossistema de saúde; nenhum dado de paciente ou conteúdo clínico está no NexOffice.',target:'command'});
    if(escalated>0)priorities.push({level:'normal',title:`${escalated} solicitação(ões) operacional(is) escalada(s)`,detail:'Contagem agregada para coordenação administrativa.',target:'command'});
    const sla=effectiveOperationalSignal(signals,'sla.summary');
    const breached=n(sla?.metrics?.breached);
    if(breached>0)priorities.push({level:'normal',title:`${breached} atendimento(s) operacional(is) fora do SLA`,detail:'Métrica agregada de operação; sem identidade ou dado clínico.',target:'command'});
    const workload=effectiveOperationalSignal(signals,'workload.summary');
    const dueToday=n(workload?.metrics?.dueToday),waitingReview=n(workload?.metrics?.waitingReview);
    if(dueToday>0||waitingReview>0)priorities.push({level:'normal',title:'Carga operacional de saúde pede atenção',detail:`Itens com vencimento hoje: ${dueToday}; aguardando revisão: ${waitingReview}.`,target:'command'});
  }

  return priorities;
}

export function operationalSignalNarrative(vertical:string,signals:OperationalSignal[]){
  if(!signals.length)return {text:'Ainda não recebi sinais operacionais agregados deste produto.',facts:{privacy:'aggregate_only',signals:[]}};

  if(vertical==='legal'){
    const parts:string[]=[];
    const activity=effectiveOperationalSignal(signals,'activity.summary');
    if(activity)parts.push(`atividade recente: ${n(activity.metrics.strategicAnalyses)} análise(s) estratégica(s), ${n(activity.metrics.drafts)} minuta(s), ${n(activity.metrics.judgeSessions)} sessão(ões) Judge e ${n(activity.metrics.agentRuns)} execução(ões) de agentes`);
    const deadlines=effectiveOperationalSignal(signals,'deadlines.summary');
    if(deadlines)parts.push(`prazos agregados: ${n(deadlines.metrics.dueToday)} para hoje, ${n(deadlines.metrics.due7Days)} nos próximos 7 dias, ${n(deadlines.metrics.overdue)} vencido(s) e ${n(deadlines.metrics.completed)} concluído(s)`);
    const monitoring=effectiveOperationalSignal(signals,'monitoring.summary');
    if(monitoring)parts.push(`monitoramento: ${n(monitoring.metrics.monitoredCases)} caso(s) monitorado(s), ${n(monitoring.metrics.newMovements)} nova(s) movimentação(ões), ${n(monitoring.metrics.unreviewedMovements)} aguardando revisão e ${n(monitoring.metrics.alerts)} alerta(s)`);
    const workload=effectiveOperationalSignal(signals,'workload.summary');
    if(workload)parts.push(`carga operacional: ${n(workload.metrics.activeMatters)} assunto(s) ativo(s), ${n(workload.metrics.dueToday)} item(ns) para hoje, ${n(workload.metrics.waitingReview)} aguardando revisão e backlog de ${n(workload.metrics.backlog)}`);
    const matters=effectiveOperationalSignal(signals,'matters.summary');
    if(matters)parts.push(`carteira operacional: ${n(matters.metrics.active)} ativo(s), ${n(matters.metrics.opened)} aberto(s), ${n(matters.metrics.closed)} encerrado(s) e ${n(matters.metrics.attentionRequired)} pedindo atenção`);
    const suffix=' Estes são somente agregados operacionais do NexJud; o NexOffice não recebe número de processo, cliente, peça, tese, prova ou conteúdo jurídico.';
    return {text:parts.length?`No NexJud, ${parts.join('; ')}.${suffix}`:`Recebi sinais agregados do NexJud, mas nenhum dos tipos que resumo aqui.${suffix}`,facts:{privacy:'aggregate_only',source:'nexjud',signals}};
  }

  if(vertical==='health'){
    const parts:string[]=[];
    const appointments=effectiveOperationalSignal(signals,'appointments.summary');
    if(appointments)parts.push(`agenda operacional: ${n(appointments.metrics.scheduled)} agendado(s), ${n(appointments.metrics.completed)} concluído(s), ${n(appointments.metrics.cancelled)} cancelado(s), ${n(appointments.metrics.noShow)} ausência(s) e ${n(appointments.metrics.pending)} pendente(s)`);
    const requests=effectiveOperationalSignal(signals,'requests.summary');
    if(requests)parts.push(`solicitações: ${n(requests.metrics.open)} aberta(s), ${n(requests.metrics.overdue)} vencida(s), ${n(requests.metrics.escalated)} escalada(s) e ${n(requests.metrics.resolved)} resolvida(s)`);
    const sla=effectiveOperationalSignal(signals,'sla.summary');
    if(sla)parts.push(`SLA: ${n(sla.metrics.withinSla)} dentro, ${n(sla.metrics.breached)} fora e resposta inicial média de ${n(sla.metrics.avgFirstResponseMinutes)} minuto(s)`);
    const workload=effectiveOperationalSignal(signals,'workload.summary');
    if(workload)parts.push(`carga operacional: ${n(workload.metrics.activeCases)} item(ns) ativo(s), ${n(workload.metrics.waitingReview)} aguardando revisão, ${n(workload.metrics.waitingPatientReply)} aguardando retorno e ${n(workload.metrics.dueToday)} para hoje`);
    const programs=effectiveOperationalSignal(signals,'programs.summary');
    if(programs)parts.push(`programas: ${n(programs.metrics.enrolled)} inscrito(s), ${n(programs.metrics.active)} ativo(s), ${n(programs.metrics.completed)} concluído(s) e ${n(programs.metrics.paused)} pausado(s)`);
    const suffix=' Estes são somente agregados administrativos; o NexOffice não recebe identidade de paciente, prontuário, diagnóstico, exame, prescrição ou dado de wearable.';
    return {text:parts.length?`Na operação de saúde, ${parts.join('; ')}.${suffix}`:`Recebi sinais agregados da operação de saúde, mas nenhum dos tipos que resumo aqui.${suffix}`,facts:{privacy:'aggregate_only',source:'health',signals}};
  }

  return {text:'Há sinais operacionais agregados disponíveis para este workspace.',facts:{privacy:'aggregate_only',signals}};
}

export function safeOperationalSignal(signal:any):OperationalSignal{
  return {
    id:String(signal.id),
    source_product:String(signal.source_product),
    signal_type:String(signal.signal_type),
    period_start:new Date(signal.period_start).toISOString(),
    period_end:new Date(signal.period_end).toISOString(),
    metrics:signal.metrics&&typeof signal.metrics==='object'?signal.metrics:{},
    dimensions:signal.dimensions&&typeof signal.dimensions==='object'?signal.dimensions:{},
    created_at:new Date(signal.created_at).toISOString()
  };
}
