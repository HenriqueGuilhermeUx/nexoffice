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

export function buildOperationalPriorities(vertical:string,signals:OperationalSignal[]):OperationalPriority[]{
  const priorities:OperationalPriority[]=[];
  const latest=(type:string)=>signals.find(signal=>signal.signal_type===type);

  if(vertical==='legal'){
    const deadlines=latest('deadlines.summary');
    const overdue=n(deadlines?.metrics?.overdue),dueToday=n(deadlines?.metrics?.dueToday);
    if(overdue>0)priorities.push({level:'high',title:`${overdue} prazo(s) operacional(is) vencido(s) no NexJud`,detail:'Sinal agregado recebido do NexJud. Abra o produto jurídico para revisar os casos correspondentes.',target:'command'});
    if(dueToday>0)priorities.push({level:'high',title:`${dueToday} prazo(s) operacional(is) vencem hoje no NexJud`,detail:'Contagem agregada; nenhum processo, cliente ou conteúdo jurídico foi copiado para o NexOffice.',target:'command'});
    const monitoring=latest('monitoring.summary');
    const unreviewed=n(monitoring?.metrics?.unreviewedMovements),alerts=n(monitoring?.metrics?.alerts);
    if(unreviewed>0)priorities.push({level:'normal',title:`${unreviewed} movimentação(ões) aguardam revisão no NexJud`,detail:alerts>0?`${alerts} alerta(s) operacional(is) também foram sinalizados.`:'Sinal operacional agregado do NexJud.',target:'command'});
    const workload=latest('workload.summary');
    const backlog=n(workload?.metrics?.backlog),waitingReview=n(workload?.metrics?.waitingReview);
    if(backlog>0||waitingReview>0)priorities.push({level:'normal',title:'Carga jurídica operacional pede atenção',detail:`Backlog agregado: ${backlog}; aguardando revisão: ${waitingReview}.`,target:'command'});
  }

  if(vertical==='health'){
    const requests=latest('requests.summary');
    const overdue=n(requests?.metrics?.overdue),escalated=n(requests?.metrics?.escalated);
    if(overdue>0)priorities.push({level:'high',title:`${overdue} solicitação(ões) operacionais vencida(s)`,detail:'Sinal administrativo agregado do ecossistema de saúde; nenhum dado de paciente ou conteúdo clínico está no NexOffice.',target:'command'});
    if(escalated>0)priorities.push({level:'normal',title:`${escalated} solicitação(ões) operacional(is) escalada(s)`,detail:'Contagem agregada para coordenação administrativa.',target:'command'});
    const sla=latest('sla.summary');
    const breached=n(sla?.metrics?.breached);
    if(breached>0)priorities.push({level:'normal',title:`${breached} atendimento(s) operacional(is) fora do SLA`,detail:'Métrica agregada de operação; sem identidade ou dado clínico.',target:'command'});
    const workload=latest('workload.summary');
    const dueToday=n(workload?.metrics?.dueToday),waitingReview=n(workload?.metrics?.waitingReview);
    if(dueToday>0||waitingReview>0)priorities.push({level:'normal',title:'Carga operacional de saúde pede atenção',detail:`Itens com vencimento hoje: ${dueToday}; aguardando revisão: ${waitingReview}.`,target:'command'});
  }

  return priorities;
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
