import {query} from './db.js';
import {modoMarketingConfigured,modoMarketingRequest} from './modo-marketing-adapter.js';

type Signal={code:string;level:'info'|'attention'|'critical';title:string;message:string;evidence:Record<string,unknown>};
type Recommendation={code:string;priority:'low'|'normal'|'high'|'urgent';title:string;message:string;rationale:Record<string,unknown>;options:Array<{label:string;action:string}>;signalCode?:string};

const n=(v:any)=>Number(v||0);
const pct=(v:number)=>Math.round(v*10)/10;
const brl=(minor:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(minor/100);

export async function buildFinancialIntelligence(workspaceId:string){
  const [accountAgg,ledgerAgg,flowRows,topClients,pipeline,fiscal]=await Promise.all([
    query<any>(`select coalesce(sum(opening_balance_minor),0)::bigint opening_minor,count(*)::int accounts from finance_accounts where workspace_id=$1 and active=true and kind in ('cash','bank','wallet')`,[workspaceId]),
    query<any>(`select
      count(*)::int ledger_count,
      coalesce(sum(amount_minor) filter(where status='paid' and direction='income'),0)::bigint paid_income_all,
      coalesce(sum(amount_minor) filter(where status='paid' and direction='expense'),0)::bigint paid_expense_all,
      coalesce(sum(amount_minor) filter(where status='paid' and direction='income' and coalesce(paid_at,updated_at)>=now()-interval '30 days'),0)::bigint income_30,
      coalesce(sum(amount_minor) filter(where status='paid' and direction='expense' and coalesce(paid_at,updated_at)>=now()-interval '30 days'),0)::bigint expense_30,
      coalesce(sum(amount_minor) filter(where status='paid' and direction='income' and coalesce(paid_at,updated_at)>=now()-interval '90 days'),0)::bigint income_90,
      coalesce(sum(amount_minor) filter(where status='paid' and direction='expense' and coalesce(paid_at,updated_at)>=now()-interval '90 days'),0)::bigint expense_90,
      coalesce(sum(amount_minor) filter(where direction='income' and status in ('open','planned','overdue')),0)::bigint receivable_total,
      coalesce(sum(amount_minor) filter(where direction='expense' and status in ('open','planned','overdue')),0)::bigint payable_total,
      coalesce(sum(amount_minor) filter(where direction='income' and status='overdue'),0)::bigint receivable_overdue,
      coalesce(sum(amount_minor) filter(where direction='expense' and status='overdue'),0)::bigint payable_overdue,
      coalesce(sum(amount_minor) filter(where direction='income' and status in ('open','planned') and due_at>=now() and due_at<now()+interval '30 days'),0)::bigint incoming_30,
      coalesce(sum(amount_minor) filter(where direction='expense' and status in ('open','planned','overdue') and coalesce(due_at,now())<now()+interval '30 days'),0)::bigint outgoing_30,
      coalesce(sum(amount_minor) filter(where direction='income' and status in ('open','planned') and due_at>=now() and due_at<now()+interval '90 days'),0)::bigint incoming_90,
      coalesce(sum(amount_minor) filter(where direction='expense' and status in ('open','planned','overdue') and coalesce(due_at,now())<now()+interval '90 days'),0)::bigint outgoing_90
      from ledger_entries where workspace_id=$1 and status<>'cancelled'`,[workspaceId]),
    query<any>(`select direction,status,amount_minor,due_at,description from ledger_entries where workspace_id=$1 and status in ('open','planned','overdue') and due_at is not null and due_at<now()+interval '90 days' order by due_at,created_at`,[workspaceId]),
    query<any>(`select coalesce(c.name,'Sem cliente vinculado') name,sum(l.amount_minor)::bigint amount_minor from ledger_entries l left join crm_contacts c on c.id=l.contact_id where l.workspace_id=$1 and l.direction='income' and l.status='paid' and coalesce(l.paid_at,l.updated_at)>=now()-interval '90 days' group by c.id,c.name order by sum(l.amount_minor) desc limit 5`,[workspaceId]),
    query<any>(`select stage,coalesce(sum(value_minor),0)::bigint value_minor,count(*)::int deals from crm_deals where workspace_id=$1 and stage not in ('won','lost') group by stage`,[workspaceId]),
    query<any>(`select status,last_health_status from integrations where workspace_id=$1 and provider='taxagent' limit 1`,[workspaceId])
  ]);

  const a=accountAgg[0]||{},l=ledgerAgg[0]||{};
  const opening=n(a.opening_minor),paidIncomeAll=n(l.paid_income_all),paidExpenseAll=n(l.paid_expense_all);
  const currentCash=opening+paidIncomeAll-paidExpenseAll;
  const incoming30=n(l.incoming_30),outgoing30=n(l.outgoing_30),incoming90=n(l.incoming_90),outgoing90=n(l.outgoing_90);
  const projected30=currentCash+incoming30-outgoing30;
  const projected90=currentCash+incoming90-outgoing90;
  const avgRevenue=n(l.income_90)/3,avgExpense=n(l.expense_90)/3,monthlyBurn=Math.max(0,avgExpense-avgRevenue);
  const runwayMonths=monthlyBurn>0&&currentCash>0?currentCash/monthlyBurn:null;
  const cashMargin=n(l.income_90)>0?((n(l.income_90)-n(l.expense_90))/n(l.income_90))*100:null;

  let rolling=currentCash;let firstShortfallAt:string|null=null;let firstShortfallBalance:number|null=null;
  for(const row of flowRows){
    const due=new Date(row.due_at);const isPast=due.getTime()<Date.now();
    if(row.direction==='income'){
      if(row.status==='overdue'||isPast)continue;
      rolling+=n(row.amount_minor);
    }else rolling-=n(row.amount_minor);
    if(rolling<0&&!firstShortfallAt){firstShortfallAt=due.toISOString();firstShortfallBalance=rolling}
  }

  const revenue90=n(l.income_90),top=topClients[0];
  const topClientShare=revenue90>0&&top?pct(n(top.amount_minor)/revenue90*100):0;
  const pipelineWeights:Record<string,number>={lead:.1,qualified:.25,meeting:.4,proposal:.65};
  let pipelineMinor=0,weightedPipelineMinor=0;
  for(const row of pipeline){pipelineMinor+=n(row.value_minor);weightedPipelineMinor+=n(row.value_minor)*(pipelineWeights[String(row.stage)]??.1)}

  let marketing:any={configured:false,monthlyBudgetMinor:0,projects:0,campaigns:0,readyCampaigns:0,estimatedCac:null,estimatedRoas:null};
  if(modoMarketingConfigured()){
    try{
      const [projects,campaigns]=await Promise.all([modoMarketingRequest<any[]>(workspaceId,'demand/projects'),modoMarketingRequest<any[]>(workspaceId,'campaigns')]);
      const budgets=projects.map(x=>n(x.monthlyBudget));const modelRows=projects.map(x=>x.model).filter(Boolean);
      marketing={configured:true,monthlyBudgetMinor:Math.round(budgets.reduce((s,v)=>s+v,0)*100),projects:projects.length,campaigns:campaigns.length,readyCampaigns:campaigns.filter(x=>x.status==='ready').length,estimatedCac:modelRows.length?pct(modelRows.reduce((s,x)=>s+n(x.cac),0)/modelRows.length):null,estimatedRoas:modelRows.length?pct(modelRows.reduce((s,x)=>s+n(x.roas),0)/modelRows.length):null};
    }catch{marketing={...marketing,configured:true,unavailable:true}}
  }

  const metrics={
    currentCashMinor:Math.round(currentCash),projectedCash30Minor:Math.round(projected30),projectedCash90Minor:Math.round(projected90),
    incoming30Minor:Math.round(incoming30),outgoing30Minor:Math.round(outgoing30),incoming90Minor:Math.round(incoming90),outgoing90Minor:Math.round(outgoing90),
    revenue30Minor:n(l.income_30),expense30Minor:n(l.expense_30),revenue90Minor:revenue90,expense90Minor:n(l.expense_90),
    averageMonthlyRevenueMinor:Math.round(avgRevenue),averageMonthlyExpenseMinor:Math.round(avgExpense),operatingCashMarginPct:cashMargin===null?null:pct(cashMargin),
    receivableMinor:n(l.receivable_total),payableMinor:n(l.payable_total),overdueReceivableMinor:n(l.receivable_overdue),overduePayableMinor:n(l.payable_overdue),
    runwayMonths:runwayMonths===null?null:pct(runwayMonths),firstShortfallAt,firstShortfallBalanceMinor:firstShortfallBalance===null?null:Math.round(firstShortfallBalance),
    topClientName:top?.name||null,topClientRevenue90Minor:top?n(top.amount_minor):0,topClientSharePct:topClientShare,
    pipelineMinor:Math.round(pipelineMinor),weightedPipelineMinor:Math.round(weightedPipelineMinor),financeAccounts:n(a.accounts),ledgerEntries:n(l.ledger_count),
    marketing,fiscal:{connected:Boolean(fiscal[0]),status:fiscal[0]?.status||'disconnected',health:fiscal[0]?.last_health_status||null}
  };

  const signals:Signal[]=[];const recommendations:Recommendation[]=[];
  if(firstShortfallAt){signals.push({code:'cash_shortfall',level:'critical',title:'Risco de falta de caixa',message:`Mantendo os recebimentos e pagamentos já registrados, o caixa pode ficar negativo em ${new Intl.DateTimeFormat('pt-BR').format(new Date(firstShortfallAt))}.`,evidence:{firstShortfallAt,firstShortfallBalanceMinor}});recommendations.push({code:'protect_cash',priority:'urgent',signalCode:'cash_shortfall',title:'Proteja o caixa antes do vencimento',message:'Antecipe recebimentos possíveis e revise pagamentos não críticos antes da data projetada de falta de caixa.',rationale:{firstShortfallAt,currentCashMinor:metrics.currentCashMinor,projectedCash30Minor:metrics.projectedCash30Minor},options:[{label:'Priorizar cobranças abertas',action:'review_receivables'},{label:'Revisar pagamentos próximos',action:'review_payables'},{label:'Simular outro cenário',action:'simulate'}]})}
  else if(projected30<0){signals.push({code:'projected_negative_30',level:'critical',title:'Caixa projetado negativo em 30 dias',message:`A projeção de 30 dias está em ${brl(projected30)} considerando os lançamentos já registrados.`,evidence:{projectedCash30Minor:projected30,incoming30Minor:incoming30,outgoing30Minor:outgoing30}})}
  if(n(l.receivable_overdue)>0){const overdue=n(l.receivable_overdue);signals.push({code:'overdue_receivables',level:'attention',title:'Há dinheiro vencido para receber',message:`Existem ${brl(overdue)} em recebíveis vencidos que não entram automaticamente na projeção de caixa.`,evidence:{overdueReceivableMinor:overdue}});recommendations.push({code:'collect_overdue',priority:firstShortfallAt?'urgent':'high',signalCode:'overdue_receivables',title:'Traga os recebíveis vencidos para a rotina de cobrança',message:'Priorize os maiores valores vencidos e acompanhe o resultado das cobranças.',rationale:{overdueReceivableMinor:overdue},options:[{label:'Ver recebíveis vencidos',action:'open_overdue_receivables'},{label:'Preparar cobrança',action:'prepare_collection'}]})}
  if(topClientShare>=40&&revenue90>0){signals.push({code:'client_concentration',level:'attention',title:'Receita concentrada em um cliente',message:`${top?.name||'Um cliente'} representou aproximadamente ${topClientShare}% das entradas recebidas nos últimos 90 dias.`,evidence:{client:top?.name,sharePct:topClientShare,revenueMinor:n(top?.amount_minor)}});recommendations.push({code:'reduce_concentration',priority:'normal',signalCode:'client_concentration',title:'Reduza a dependência de um único cliente',message:'Acompanhe o pipeline e crie novas oportunidades antes que a concentração vire risco de caixa.',rationale:{topClientSharePct:topClientShare,pipelineMinor},options:[{label:'Revisar pipeline',action:'review_pipeline'},{label:'Planejar aquisição',action:'open_marketing'}]})}
  if(avgExpense>avgRevenue&&revenue90>0){signals.push({code:'expenses_above_revenue',level:'attention',title:'Despesas acima das entradas recentes',message:`Nos últimos 90 dias, a média mensal de despesas foi ${brl(avgExpense)} contra ${brl(avgRevenue)} de entradas recebidas.`,evidence:{averageMonthlyRevenueMinor:avgRevenue,averageMonthlyExpenseMinor:avgExpense}});recommendations.push({code:'restore_monthly_balance',priority:runwayMonths!==null&&runwayMonths<2?'urgent':'high',signalCode:'expenses_above_revenue',title:'Recupere o equilíbrio mensal',message:'Revise despesas recorrentes e as entradas previstas antes de assumir novos compromissos fixos.',rationale:{monthlyGapMinor:Math.round(avgExpense-avgRevenue),runwayMonths},options:[{label:'Revisar despesas',action:'review_expenses'},{label:'Simular redução de custos',action:'simulate'}]})}
  if(runwayMonths!==null&&runwayMonths<2){signals.push({code:'low_runway',level:'critical',title:'Pouca reserva para o ritmo atual',message:`No ritmo observado, a reserva cobre aproximadamente ${pct(runwayMonths)} mês(es) do déficit mensal atual.`,evidence:{runwayMonths:pct(runwayMonths),monthlyBurnMinor:Math.round(monthlyBurn)}})}
  if(!signals.length&&n(l.ledger_count)>0)signals.push({code:'cash_stable',level:'info',title:'Caixa sem alerta crítico agora',message:`Com os lançamentos atuais, a projeção de 30 dias permanece em ${brl(projected30)}.`,evidence:{projectedCash30Minor:projected30}});
  if(!n(l.ledger_count))signals.push({code:'insufficient_finance_data',level:'info',title:'Ainda faltam dados para uma leitura financeira útil',message:'Adicione movimentações ou importe um extrato CSV/OFX para o NexOffice começar a acompanhar o caixa.',evidence:{ledgerEntries:0}});

  const snapshot=(await query<any>(`insert into finance_snapshots(workspace_id,window_days,metrics,sources) values($1,90,$2,$3) returning *`,[workspaceId,JSON.stringify(metrics),JSON.stringify({ledger:true,crm:true,marketing:marketing.configured,fiscal:Boolean(fiscal[0]),method:'derived_workspace_data_v1'})]))[0];
  await query(`update finance_signals set active=false,resolved_at=coalesce(resolved_at,now()) where workspace_id=$1 and active=true`,[workspaceId]);
  await query(`update finance_recommendations set status='dismissed',updated_at=now() where workspace_id=$1 and status='open'`,[workspaceId]);
  const signalIds=new Map<string,string>();
  for(const s of signals){const row=(await query<any>(`insert into finance_signals(workspace_id,snapshot_id,code,level,title,message,evidence) values($1,$2,$3,$4,$5,$6,$7) returning *`,[workspaceId,snapshot.id,s.code,s.level,s.title,s.message,JSON.stringify(s.evidence)]))[0];signalIds.set(s.code,row.id)}
  for(const r of recommendations)await query(`insert into finance_recommendations(workspace_id,snapshot_id,signal_id,code,priority,title,message,rationale,options) values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[workspaceId,snapshot.id,r.signalCode?signalIds.get(r.signalCode)||null:null,r.code,r.priority,r.title,r.message,JSON.stringify(r.rationale),JSON.stringify(r.options)]);
  return readFinancialIntelligence(workspaceId,snapshot.id);
}

export async function readFinancialIntelligence(workspaceId:string,snapshotId?:string){
  const snapshot=snapshotId?(await query<any>(`select * from finance_snapshots where id=$1 and workspace_id=$2`,[snapshotId,workspaceId]))[0]:(await query<any>(`select * from finance_snapshots where workspace_id=$1 order by as_of desc limit 1`,[workspaceId]))[0];
  if(!snapshot)return null;
  const [signals,recommendations,decisions]=await Promise.all([
    query<any>(`select * from finance_signals where workspace_id=$1 and snapshot_id=$2 order by case level when 'critical' then 1 when 'attention' then 2 else 3 end,created_at`,[workspaceId,snapshot.id]),
    query<any>(`select * from finance_recommendations where workspace_id=$1 and snapshot_id=$2 order by case priority when 'urgent' then 1 when 'high' then 2 when 'normal' then 3 else 4 end,created_at`,[workspaceId,snapshot.id]),
    query<any>(`select * from finance_decisions where workspace_id=$1 order by decided_at desc limit 20`,[workspaceId])
  ]);
  return {snapshot,metrics:snapshot.metrics,signals,recommendations,decisions};
}

export function simulateFromMetrics(metrics:any,input:{revenueChangePct:number;expenseChangePct:number;oneOffInflowMinor:number;oneOffOutflowMinor:number}){
  const revenueFactor=1+input.revenueChangePct/100,expenseFactor=1+input.expenseChangePct/100;
  const base=n(metrics.projectedCash30Minor),simulated=Math.round(n(metrics.currentCashMinor)+n(metrics.incoming30Minor)*revenueFactor-n(metrics.outgoing30Minor)*expenseFactor+n(input.oneOffInflowMinor)-n(input.oneOffOutflowMinor));
  const delta=simulated-base;
  return {horizonDays:30,baseProjectedCashMinor:base,simulatedProjectedCashMinor:simulated,deltaMinor:delta,risk:simulated<0?'critical':simulated<n(metrics.averageMonthlyExpenseMinor)*.5?'attention':'stable',assumptions:{revenueChangePct:input.revenueChangePct,expenseChangePct:input.expenseChangePct,oneOffInflowMinor:input.oneOffInflowMinor,oneOffOutflowMinor:input.oneOffOutflowMinor},message:simulated<0?`Nesse cenário, o caixa de 30 dias ficaria negativo em aproximadamente ${brl(Math.abs(simulated))}.`:`Nesse cenário, a projeção de caixa em 30 dias seria ${brl(simulated)} (${delta>=0?'+':''}${brl(delta)} versus a projeção atual).`};
}
