import type {FastifyInstance} from 'fastify';
import {workspaceContext} from './auth.js';
import {query} from './db.js';

const n=(value:unknown)=>Number(value||0);
const brl=(minor:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(minor/100);

type SignalRow={id:string;code:string;level:'info'|'attention'|'critical';title:string;message:string;evidence:Record<string,unknown>;created_at:string};
type RecommendationRow={id:string;code:string;priority:'low'|'normal'|'high'|'urgent';title:string;message:string;signal_code?:string|null;created_at:string};

function priorityFor(level:SignalRow['level']){return level==='critical'?'urgent':level==='attention'?'high':'normal'}
function actionFromRecommendation(row:RecommendationRow){return{id:row.id,title:row.title,summary:row.message,priority:row.priority,status:'open',autonomy:'insight',approvalId:null,actionType:`finance.recommendation.${row.code}`}}
function actionFromSignal(row:SignalRow,prefix:string){return{id:row.id,title:row.title,summary:row.message,priority:priorityFor(row.level),status:'open',autonomy:'insight',approvalId:null,actionType:`${prefix}.${row.code}`}}

export async function registerCommandIntelligenceRoutes(app:FastifyInstance){
  app.get('/v1/command/intelligence',async req=>{
    const ctx=await workspaceContext(req,'command.read');
    const [signals,recommendations,snapshots]=await Promise.all([
      query<SignalRow>(`select id,code,level,title,message,evidence,created_at from finance_signals where workspace_id=$1 and active=true order by case level when 'critical' then 1 when 'attention' then 2 else 3 end,created_at desc limit 30`,[ctx.workspaceId]),
      query<RecommendationRow>(`select r.id,r.code,r.priority,r.title,r.message,s.code signal_code,r.created_at from finance_recommendations r left join finance_signals s on s.id=r.signal_id where r.workspace_id=$1 and r.status='open' order by case r.priority when 'urgent' then 1 when 'high' then 2 when 'normal' then 3 else 4 end,r.created_at desc limit 20`,[ctx.workspaceId]),
      query<any>(`select id,as_of,metrics,sources from finance_snapshots where workspace_id=$1 order by as_of desc limit 1`,[ctx.workspaceId])
    ]);

    const snapshot=snapshots[0]||null,metrics=snapshot?.metrics||{};
    const financeSignals=signals.filter(row=>!row.code.startsWith('marketing_'));
    const marketingSignals=signals.filter(row=>row.code.startsWith('marketing_'));
    const financeCritical=financeSignals.filter(row=>row.level==='critical').length;
    const financeAttention=financeSignals.filter(row=>row.level==='attention').length;
    const marketingCritical=marketingSignals.filter(row=>row.level==='critical').length;
    const marketingAttention=marketingSignals.filter(row=>row.level==='attention').length;
    const projected30=n(metrics.projectedCash30Minor),overdueReceivable=n(metrics.overdueReceivableMinor),runway=metrics.runwayMonths===null||metrics.runwayMonths===undefined?null:Number(metrics.runwayMonths);
    const hasFinanceData=Boolean(snapshot)&&n(metrics.ledgerEntries)>0;
    const financeRecommendations=recommendations.filter(row=>!String(row.signal_code||'').startsWith('marketing_'));

    let financeDetail='Adicione movimentações ou importe um extrato para começar a leitura financeira.';
    if(hasFinanceData){
      if(financeCritical)financeDetail=`${financeCritical} risco(s) crítico(s) · caixa em 30 dias ${brl(projected30)}`;
      else if(financeAttention)financeDetail=`${financeAttention} ponto(s) pedem atenção · caixa em 30 dias ${brl(projected30)}`;
      else financeDetail=`Caixa em 30 dias ${brl(projected30)} · sem alerta crítico`;
    }

    const marketing=metrics.marketing||{};
    const actual=marketing.actual||null;
    let marketingDetail='MODO/Google Ads ainda sem dados reais para esta empresa.';
    if(marketingCritical||marketingAttention)marketingDetail=marketingSignals[0]?.message||marketingDetail;
    else if(actual?.costMinor>0)marketingDetail=`Google Ads: ${brl(n(actual.costMinor))} investidos · ${n(actual.conversions)} conversão(ões)${actual.roas!==null&&actual.roas!==undefined?` · ROAS ${Number(actual.roas).toFixed(2)}x`:''}`;
    else if(marketing.configured)marketingDetail=`MODO conectado · ${n(marketing.readyCampaigns)} campanha(s) pronta(s) · métricas reais aguardando mídia conectada`;

    return {
      generatedAt:new Date().toISOString(),
      snapshotAt:snapshot?.as_of||null,
      finance:{
        id:'finance',label:'Finanças',attention:financeCritical+financeAttention,detail:financeDetail,
        metrics:{criticalSignals:financeCritical,attentionSignals:financeAttention,projectedCash30Minor:projected30,overdueReceivableMinor:overdueReceivable,runwayMonths:runway===null?0:runway},
        actions:financeRecommendations.slice(0,3).map(actionFromRecommendation)
      },
      marketing:{
        attention:marketingCritical+marketingAttention,detail:marketingDetail,
        metrics:{criticalSignals:marketingCritical,attentionSignals:marketingAttention,actualCostMinor:n(actual?.costMinor),clicks:n(actual?.clicks),conversions:n(actual?.conversions),customers:n(actual?.customers),leads:n(actual?.leads)},
        actions:marketingSignals.slice(0,3).map(row=>actionFromSignal(row,'growth.intelligence'))
      }
    };
  });
}
