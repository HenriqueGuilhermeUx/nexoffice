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
function moneyMinor(value:unknown){return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n(value)/100)}

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

  if(vertical==='condo'){
    const compliance=effectiveOperationalSignal(signals,'compliance.summary');
    const overdue=n(compliance?.metrics?.overdue),upcoming=n(compliance?.metrics?.upcoming),alertsFailed=n(compliance?.metrics?.alertsFailed);
    if(overdue>0)priorities.push({level:'high',title:`${overdue} obrigação(ões) condominial(is) vencida(s) no SindCopilot`,detail:'Contagem operacional agregada. Abra o SindCopilot para revisar os condomínios e obrigações correspondentes.',target:'command'});
    if(upcoming>0)priorities.push({level:'normal',title:`${upcoming} obrigação(ões) de compliance próxima(s)`,detail:'Sinal agregado do SindCopilot; nenhum condomínio, unidade ou morador foi copiado para o NexOffice.',target:'command'});
    if(alertsFailed>0)priorities.push({level:'normal',title:`${alertsFailed} alerta(s) de compliance falharam`,detail:'Métrica operacional agregada do SindCopilot.',target:'command'});
    const documents=effectiveOperationalSignal(signals,'documents.summary');
    const ocrFailed=n(documents?.metrics?.ocrFailed),indexingFailed=n(documents?.metrics?.indexingFailed),pendingReview=n(documents?.metrics?.pendingReview);
    if(ocrFailed+indexingFailed>0)priorities.push({level:'normal',title:'Documentos condominiais precisam de atenção técnica',detail:`Falhas de OCR: ${ocrFailed}; falhas de indexação: ${indexingFailed}.`,target:'command'});
    else if(pendingReview>0)priorities.push({level:'normal',title:`${pendingReview} documento(s) aguardam revisão no SindCopilot`,detail:'Somente a contagem operacional foi compartilhada.',target:'command'});
    const notices=effectiveOperationalSignal(signals,'notices.summary');
    const drafts=n(notices?.metrics?.drafts);
    if(drafts>0)priorities.push({level:'normal',title:`${drafts} comunicado(s)/minuta(s) em rascunho`,detail:'O conteúdo permanece exclusivamente no SindCopilot até revisão humana.',target:'command'});
  }

  if(vertical==='commerce'){
    const fulfillment=effectiveOperationalSignal(signals,'fulfillment.summary');
    const delayed=n(fulfillment?.metrics?.delayed),pending=n(fulfillment?.metrics?.pending),returnsRequested=n(fulfillment?.metrics?.returnsRequested);
    if(delayed>0)priorities.push({level:'high',title:`${delayed} pedido(s) com atraso operacional`,detail:'Sinal agregado do canal de vendas. Abra a plataforma de origem para identificar os pedidos correspondentes.',target:'command'});
    if(pending>0)priorities.push({level:'normal',title:`${pending} pedido(s) aguardam fulfillment`,detail:returnsRequested>0?`${returnsRequested} devolução(ões) também foram solicitadas.`:'Contagem agregada, sem pedido ou cliente individual no NexOffice.',target:'command'});
    const inventory=effectiveOperationalSignal(signals,'inventory.summary');
    const out=n(inventory?.metrics?.outOfStockSkus),low=n(inventory?.metrics?.lowStockSkus);
    if(out>0)priorities.push({level:'high',title:`${out} SKU(s) sem estoque`,detail:'Inventário agregado do canal conectado; nenhum catálogo bruto foi copiado para o NexOffice.',target:'command'});
    else if(low>0)priorities.push({level:'normal',title:`${low} SKU(s) com estoque baixo`,detail:'Sinal agregado para reposição e planejamento.',target:'command'});
    const support=effectiveOperationalSignal(signals,'support.summary');
    const supportOverdue=n(support?.metrics?.overdue),supportOpen=n(support?.metrics?.open);
    if(supportOverdue>0)priorities.push({level:'high',title:`${supportOverdue} atendimento(s) de commerce vencido(s)`,detail:`Há ${supportOpen} atendimento(s) aberto(s) no total.`,target:'command'});
    const customers=effectiveOperationalSignal(signals,'customers.summary');
    const abandoned=n(customers?.metrics?.abandonedCarts),recovered=n(customers?.metrics?.recoveredCarts);
    if(abandoned>recovered&&abandoned>0)priorities.push({level:'normal',title:`${abandoned} carrinho(s) abandonado(s) no período`,detail:`${recovered} foram recuperado(s). O Growth Agent pode preparar uma ação de recuperação sem receber identidade de cliente.`,target:'command'});
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

  if(vertical==='condo'){
    const parts:string[]=[];
    const portfolio=effectiveOperationalSignal(signals,'portfolio.summary');
    if(portfolio)parts.push(`portfólio: ${n(portfolio.metrics.totalCondominiums)} condomínio(s), ${n(portfolio.metrics.activeCondominiums)} ativo(s) e ${n(portfolio.metrics.activeAssistants)} assistente(s) ativo(s)`);
    const compliance=effectiveOperationalSignal(signals,'compliance.summary');
    if(compliance)parts.push(`compliance: ${n(compliance.metrics.pending)} pendente(s), ${n(compliance.metrics.upcoming)} próximo(s), ${n(compliance.metrics.overdue)} vencido(s) e ${n(compliance.metrics.completed)} concluído(s)`);
    const documents=effectiveOperationalSignal(signals,'documents.summary');
    if(documents)parts.push(`documentos: ${n(documents.metrics.pendingReview)} aguardando revisão, ${n(documents.metrics.ocrPending)} em OCR, ${n(documents.metrics.ocrFailed)} falha(s) de OCR, ${n(documents.metrics.indexingPending)} em indexação e ${n(documents.metrics.indexingFailed)} falha(s) de indexação`);
    const notices=effectiveOperationalSignal(signals,'notices.summary');
    if(notices)parts.push(`comunicações: ${n(notices.metrics.drafts)} rascunho(s), ${n(notices.metrics.sent)} enviado(s) e ${n(notices.metrics.cancelled)} cancelado(s)`);
    const suppliers=effectiveOperationalSignal(signals,'suppliers.summary');
    if(suppliers)parts.push(`fornecedores: ${n(suppliers.metrics.total)} cadastrado(s), ${n(suppliers.metrics.rated)} avaliado(s)`);
    const suffix=' Estes são somente agregados operacionais do SindCopilot; o NexOffice não recebe nome de condomínio, unidade, morador, proprietário, CPF/CNPJ, contato, documento, convenção, ata ou texto de comunicado.';
    return {text:parts.length?`No SindCopilot, ${parts.join('; ')}.${suffix}`:`Recebi sinais agregados do SindCopilot, mas nenhum dos tipos que resumo aqui.${suffix}`,facts:{privacy:'aggregate_only',source:'sindcopilot',signals}};
  }

  if(vertical==='commerce'){
    const parts:string[]=[];
    const orders=effectiveOperationalSignal(signals,'orders.summary');
    if(orders)parts.push(`pedidos: ${n(orders.metrics.orders)} no período, faturamento bruto ${moneyMinor(orders.metrics.grossRevenueMinor)}, líquido ${moneyMinor(orders.metrics.netRevenueMinor)}, ticket médio ${moneyMinor(orders.metrics.averageOrderValueMinor)}, ${n(orders.metrics.cancelled)} cancelado(s) e ${n(orders.metrics.refundedOrders)} reembolsado(s)`);
    const fulfillment=effectiveOperationalSignal(signals,'fulfillment.summary');
    if(fulfillment)parts.push(`fulfillment: ${n(fulfillment.metrics.pending)} pendente(s), ${n(fulfillment.metrics.shipped)} enviado(s), ${n(fulfillment.metrics.delivered)} entregue(s), ${n(fulfillment.metrics.delayed)} atrasado(s) e ${n(fulfillment.metrics.returnsRequested)} devolução(ões) solicitada(s)`);
    const inventory=effectiveOperationalSignal(signals,'inventory.summary');
    if(inventory)parts.push(`estoque agregado: ${n(inventory.metrics.activeSkus)} SKU(s) ativo(s), ${n(inventory.metrics.lowStockSkus)} com estoque baixo e ${n(inventory.metrics.outOfStockSkus)} sem estoque`);
    const customers=effectiveOperationalSignal(signals,'customers.summary');
    if(customers)parts.push(`clientes agregados: ${n(customers.metrics.newCustomers)} novo(s), ${n(customers.metrics.returningCustomers)} recorrente(s), ${n(customers.metrics.abandonedCarts)} carrinho(s) abandonado(s) e ${n(customers.metrics.recoveredCarts)} recuperado(s)`);
    const support=effectiveOperationalSignal(signals,'support.summary');
    if(support)parts.push(`atendimento: ${n(support.metrics.open)} aberto(s), ${n(support.metrics.overdue)} vencido(s), ${n(support.metrics.resolved)} resolvido(s), resposta inicial média ${n(support.metrics.avgFirstResponseMinutes)} minuto(s)`);
    const conversion=effectiveOperationalSignal(signals,'conversion.summary');
    if(conversion)parts.push(`conversão: ${n(conversion.metrics.sessions)} sessão(ões), ${n(conversion.metrics.carts)} carrinho(s), ${n(conversion.metrics.checkouts)} checkout(s), ${n(conversion.metrics.purchases)} compra(s) e ${(n(conversion.metrics.conversionRateBps)/100).toFixed(2)}% de conversão`);
    const suffix=' Estes são agregados operacionais dos canais de commerce; o NexOffice não recebe pedido individual, nome, e-mail, telefone, endereço, CPF, item comprado ou conteúdo de atendimento por este bridge.';
    return {text:parts.length?`Na operação de commerce, ${parts.join('; ')}.${suffix}`:`Recebi sinais agregados de commerce, mas nenhum dos tipos que resumo aqui.${suffix}`,facts:{privacy:'aggregate_only',source:'commerce',signals}};
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