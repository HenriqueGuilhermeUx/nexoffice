import {query} from './db.js';
import {buildBusinessRadar} from './business-intelligence-depth.js';

const n=(v:unknown)=>Number(v||0);
const pct=(a:number,b:number)=>b>0?Math.round((a-b)/b*1000)/10:null;
const brl=(minor:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(minor/100);
const dateIso=(d:Date)=>d.toISOString();

function mondayStart(now=new Date()){
  const d=new Date(now);const day=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()-day);d.setUTCHours(0,0,0,0);return d;
}

export async function buildWeeklyIntelligence(workspaceId:string){
  const radar=await buildBusinessRadar(workspaceId);
  const end=new Date(),start=new Date(end.getTime()-7*86400000),previousStart=new Date(start.getTime()-7*86400000),weekStart=mondayStart(end);
  const [ledger,crm,ops,snapshots]=await Promise.all([
    query<any>(`select
      coalesce(sum(amount_minor) filter(where direction='income' and status='paid' and coalesce(paid_at,updated_at)>=$2),0)::bigint income_now,
      coalesce(sum(amount_minor) filter(where direction='income' and status='paid' and coalesce(paid_at,updated_at)>=$3 and coalesce(paid_at,updated_at)<$2),0)::bigint income_prev,
      coalesce(sum(amount_minor) filter(where direction='expense' and status='paid' and coalesce(paid_at,updated_at)>=$2),0)::bigint expense_now,
      coalesce(sum(amount_minor) filter(where direction='expense' and status='paid' and coalesce(paid_at,updated_at)>=$3 and coalesce(paid_at,updated_at)<$2),0)::bigint expense_prev,
      count(*) filter(where direction='income' and status='overdue')::int overdue_count,
      coalesce(sum(amount_minor) filter(where direction='income' and status='overdue'),0)::bigint overdue_minor
      from ledger_entries where workspace_id=$1`,[workspaceId,dateIso(start),dateIso(previousStart)]),
    query<any>(`select
      count(*) filter(where created_at>=$2)::int new_deals_now,
      count(*) filter(where created_at>=$3 and created_at<$2)::int new_deals_prev,
      count(*) filter(where stage='won' and updated_at>=$2)::int won_now,
      coalesce(sum(value_minor) filter(where stage='won' and updated_at>=$2),0)::bigint won_value_now,
      count(*) filter(where stage not in ('won','lost'))::int open_deals,
      coalesce(sum(value_minor) filter(where stage not in ('won','lost')),0)::bigint pipeline_minor
      from crm_deals where workspace_id=$1`,[workspaceId,dateIso(start),dateIso(previousStart)]),
    query<any>(`select
      (select count(*) from tasks where workspace_id=$1 and status='done' and coalesce(completed_at,updated_at)>=$2)::int tasks_done,
      (select count(*) from tasks where workspace_id=$1 and status in ('todo','doing') and due_at<now())::int tasks_overdue,
      (select count(*) from appointments where workspace_id=$1 and starts_at>=$2 and starts_at<=$4 and status='completed')::int appointments_done,
      (select count(*) from appointments where workspace_id=$1 and starts_at>=$2 and starts_at<=$4 and status in ('cancelled','no_show'))::int appointment_losses`,[workspaceId,dateIso(start),dateIso(previousStart),dateIso(end)]),
    query<any>(`select overall_score,as_of from intelligence_snapshots where workspace_id=$1 and as_of>=now()-interval '14 days' order by as_of desc`,[workspaceId])
  ]);
  const l=ledger[0]||{},c=crm[0]||{},o=ops[0]||{};
  const incomeNow=n(l.income_now),incomePrev=n(l.income_prev),expenseNow=n(l.expense_now),expensePrev=n(l.expense_prev);
  const incomeChange=pct(incomeNow,incomePrev),expenseChange=pct(expenseNow,expensePrev);
  const startScore=snapshots.length?Number(snapshots[snapshots.length-1].overall_score):null;
  const score=radar.score===null?null:Number(radar.score),scoreDelta=startScore===null||score===null?radar.scoreDelta:score-startScore;
  const wins:Array<{title:string;detail:string}>=[];
  const attention:Array<{title:string;detail:string}>=[];
  if(scoreDelta!==null&&scoreDelta>=3)wins.push({title:'Saúde do negócio melhorou',detail:`O índice avançou ${scoreDelta} ponto(s) no período observado.`});
  if(incomeChange!==null&&incomeChange>=10)wins.push({title:'Entradas ganharam ritmo',detail:`As entradas pagas ficaram ${incomeChange}% acima dos 7 dias anteriores.`});
  if(n(c.won_now)>0)wins.push({title:'Vendas concluídas',detail:`${n(c.won_now)} oportunidade(s) foram ganhas, somando ${brl(n(c.won_value_now))}.`});
  if(n(o.tasks_done)>=3)wins.push({title:'Rotina avançou',detail:`${n(o.tasks_done)} tarefa(s) foram concluídas nesta semana.`});
  if(scoreDelta!==null&&scoreDelta<=-3)attention.push({title:'Saúde do negócio perdeu força',detail:`O índice caiu ${Math.abs(scoreDelta)} ponto(s) no período observado.`});
  if(incomeChange!==null&&incomeChange<=-15)attention.push({title:'Entradas desaceleraram',detail:`As entradas pagas ficaram ${Math.abs(incomeChange)}% abaixo dos 7 dias anteriores.`});
  if(n(l.overdue_count)>0)attention.push({title:'Recebimentos vencidos',detail:`Há ${n(l.overdue_count)} lançamento(s) vencido(s), somando ${brl(n(l.overdue_minor))}.`});
  if(n(o.tasks_overdue)>0)attention.push({title:'Tarefas vencidas',detail:`${n(o.tasks_overdue)} tarefa(s) ainda estão atrasadas.`});
  for(const p of (radar.priorities||[]).slice(0,3))if(!attention.some(x=>x.title===p.title))attention.push({title:p.title,detail:p.reason});
  if(!wins.length)wins.push({title:'Base em construção',detail:'Continue usando o NexOffice para que as comparações semanais fiquem mais precisas.'});
  const summary=score===null
    ?'O NexOffice ainda está construindo a leitura semanal desta empresa.'
    :attention.length
      ?`A semana fecha com índice ${score}/100. Há ${attention.length} ponto(s) que merecem atenção e ${wins.length} sinal(is) positivo(s).`
      :`A semana fecha com índice ${score}/100 e sem alerta importante novo. Continue acompanhando o ritmo da operação.`;
  const metrics={incomeNowMinor:incomeNow,incomePreviousMinor:incomePrev,incomeChangePct:incomeChange,expenseNowMinor:expenseNow,expensePreviousMinor:expensePrev,expenseChangePct:expenseChange,newDeals:n(c.new_deals_now),newDealsPrevious:n(c.new_deals_prev),wonDeals:n(c.won_now),wonValueMinor:n(c.won_value_now),openDeals:n(c.open_deals),pipelineMinor:n(c.pipeline_minor),tasksDone:n(o.tasks_done),tasksOverdue:n(o.tasks_overdue),appointmentsDone:n(o.appointments_done),appointmentLosses:n(o.appointment_losses)};
  const rows=await query<any>(`insert into intelligence_weekly_briefs(workspace_id,week_start,period_start,period_end,overall_score,score_delta,summary,wins,attention,priorities,metrics,sources)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    on conflict(workspace_id,week_start) do update set period_start=excluded.period_start,period_end=excluded.period_end,overall_score=excluded.overall_score,score_delta=excluded.score_delta,summary=excluded.summary,wins=excluded.wins,attention=excluded.attention,priorities=excluded.priorities,metrics=excluded.metrics,sources=excluded.sources,updated_at=now()
    returning *`,[workspaceId,weekStart.toISOString().slice(0,10),dateIso(start),dateIso(end),score,scoreDelta,summary,JSON.stringify(wins.slice(0,5)),JSON.stringify(attention.slice(0,6)),JSON.stringify((radar.priorities||[]).slice(0,3)),JSON.stringify(metrics),JSON.stringify({radar:true,ledger:true,crm:true,tasks:true,agenda:true})]);
  return{brief:rows[0],score,scoreDelta,wins:wins.slice(0,5),attention:attention.slice(0,6),priorities:(radar.priorities||[]).slice(0,3),metrics,radar};
}

export async function intelligenceAdvisor(workspaceId:string,mode:'today'|'week',agentRole?:string|null){
  const weekly=await buildWeeklyIntelligence(workspaceId);const radar=weekly.radar;
  const prefix=agentRole==='controller'?'Leitura de gestão':agentRole==='crm'?'Leitura comercial':agentRole==='collections'?'Leitura de recebimentos':agentRole==='secretary'?'Leitura da rotina':'Leitura do negócio';
  if(mode==='week'){
    const wins=weekly.wins.slice(0,2).map(x=>x.title).join('; '),attention=weekly.attention.slice(0,3).map(x=>x.title).join('; ');
    return{text:`${prefix}: ${weekly.brief.summary}${wins?` Pontos positivos: ${wins}.`:''}${attention?` Atenção: ${attention}.`:''}`,facts:{weekly:weekly.brief,metrics:weekly.metrics},priorities:weekly.priorities};
  }
  const priorities=(radar.priorities||[]).slice(0,3),line=priorities.length?priorities.map((p:any,i:number)=>`${i+1}) ${p.title}: ${p.reason}`).join(' '):'Não há alerta importante novo agora.';
  const delta=radar.scoreDelta===null||radar.scoreDelta===undefined?'':` (${radar.scoreDelta>0?'+':''}${radar.scoreDelta} desde a leitura anterior)`;
  return{text:`${prefix}: índice ${radar.score??'em construção'}/100${delta}. ${line}`,facts:{radar},priorities};
}
