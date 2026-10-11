import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {workspaceContext} from './auth.js';
import {query} from './db.js';

const n=(value:unknown)=>Number(value||0);
const pct=(value:number)=>Math.round(value*10)/10;

type NextOption={
  action:'catalog_set_cost'|'catalog_review_price'|'create_operation'|'create_proposal'|'review_clients'|'review_receivables'|'marketing_focus';
  label:string;
  reason:string;
  catalogItemId?:string|null;
  view?:'finance'|'crm'|'materials'|'marketing';
};

function bestOptions(item:any):NextOption[]{
  const options:NextOption[]=[];
  const catalogItemId=String(item.catalog_item_id||'')||null;
  const margin=item.margin_pct===null?null:Number(item.margin_pct);
  const coverage=Number(item.cost_coverage_pct||0);
  const receivedShare=Number(item.booked_revenue_minor||0)>0?Number(item.received_revenue_minor||0)/Number(item.booked_revenue_minor||0)*100:0;
  if(coverage<100)options.push({action:'catalog_set_cost',label:'Informar custo',reason:'Complete o custo para tornar a margem mais confiável.',catalogItemId});
  if(margin!==null&&margin<20){
    options.push({action:'catalog_review_price',label:'Rever preço',reason:'A margem estimada está baixa para esta oferta.',catalogItemId});
    options.push({action:'create_proposal',label:'Criar proposta com novo preço',reason:'Teste um posicionamento de preço melhor em uma nova proposta.',catalogItemId,view:'materials'});
  }else if(margin!==null&&margin>=40){
    options.push({action:'create_operation',label:'Nova venda desta oferta',reason:'A margem estimada é saudável; facilite uma nova operação.',catalogItemId});
    options.push({action:'create_proposal',label:'Usar em proposta',reason:'Reaproveite a oferta rentável em uma proposta profissional.',catalogItemId,view:'materials'});
    if(String(item.billing_cycle||'')!=='one_time')options.push({action:'marketing_focus',label:'Priorizar no crescimento',reason:'Oferta rentável e recorrente merece atenção comercial.',catalogItemId,view:'marketing'});
  }else{
    options.push({action:'create_proposal',label:'Usar em proposta',reason:'Leve a oferta para uma nova oportunidade sem redigitar.',catalogItemId,view:'materials'});
    options.push({action:'review_clients',label:'Ver clientes',reason:'Compare onde esta oferta já gera resultado.',catalogItemId,view:'crm'});
  }
  if(receivedShare<60&&Number(item.booked_revenue_minor||0)>0)options.push({action:'review_receivables',label:'Revisar recebimentos',reason:'Parte relevante do valor vendido ainda não aparece como recebido.',catalogItemId,view:'finance'});
  return options.slice(0,3);
}

export async function registerProfitabilityRoutes(app:FastifyInstance){
  app.get('/v1/finance/profitability',async req=>{
    const ctx=await workspaceContext(req,'finance.read');
    const {days}=z.object({days:z.coerce.number().int().min(30).max(365).default(90)}).parse(req.query||{});

    const rows=await query<any>(`
      select
        coalesce(o.catalog_item_id::text,'uncatalogued') catalog_key,
        o.catalog_item_id,
        coalesce(ci.name,o.title,'Sem oferta vinculada') item_name,
        coalesce(ci.kind,'service') item_kind,
        coalesce(ci.billing_cycle,'one_time') billing_cycle,
        count(*)::int operations,
        coalesce(sum(o.amount_minor),0)::bigint booked_revenue_minor,
        coalesce(sum(o.amount_minor) filter(where l.status='paid'),0)::bigint received_revenue_minor,
        coalesce(sum(
          case
            when o.unit_cost_minor is not null then o.unit_cost_minor*o.quantity
            when ci.cost_minor is not null then ci.cost_minor*o.quantity
            else 0
          end
        ),0)::bigint estimated_cost_minor,
        count(*) filter(where o.unit_cost_minor is not null or ci.cost_minor is not null)::int cost_known_operations,
        count(*) filter(where o.unit_cost_minor is not null)::int cost_snapshot_operations,
        min(o.created_at) first_operation_at,
        max(o.created_at) last_operation_at
      from business_operations o
      left join business_catalog_items ci on ci.id=o.catalog_item_id
      left join ledger_entries l on l.id=o.ledger_entry_id
      where o.workspace_id=$1
        and o.created_at>=now()-($2::text||' days')::interval
        and o.status<>'cancelled'
      group by o.catalog_item_id,ci.name,ci.kind,ci.billing_cycle,o.title
      order by booked_revenue_minor desc
    `,[ctx.workspaceId,String(days)]);

    const items=rows.map(row=>{
      const revenue=n(row.booked_revenue_minor),cost=n(row.estimated_cost_minor),profit=revenue-cost;
      const margin=revenue>0?pct(profit/revenue*100):null;
      const coverage=n(row.operations)>0?pct(n(row.cost_known_operations)/n(row.operations)*100):0;
      const normalized={...row,booked_revenue_minor:revenue,received_revenue_minor:n(row.received_revenue_minor),estimated_cost_minor:cost,estimated_gross_profit_minor:profit,margin_pct:margin,cost_coverage_pct:coverage,cost_snapshot_pct:n(row.operations)>0?pct(n(row.cost_snapshot_operations)/n(row.operations)*100):0};
      return {...normalized,best_options:bestOptions(normalized)};
    });

    const customers=await query<any>(`
      select
        c.id contact_id,
        coalesce(c.name,'Sem cliente vinculado') customer_name,
        count(*)::int operations,
        coalesce(sum(o.amount_minor),0)::bigint booked_revenue_minor,
        coalesce(sum(o.amount_minor) filter(where l.status='paid'),0)::bigint received_revenue_minor,
        coalesce(sum(
          case
            when o.unit_cost_minor is not null then o.unit_cost_minor*o.quantity
            when ci.cost_minor is not null then ci.cost_minor*o.quantity
            else 0
          end
        ),0)::bigint estimated_cost_minor
      from business_operations o
      left join crm_contacts c on c.id=o.contact_id
      left join business_catalog_items ci on ci.id=o.catalog_item_id
      left join ledger_entries l on l.id=o.ledger_entry_id
      where o.workspace_id=$1
        and o.created_at>=now()-($2::text||' days')::interval
        and o.status<>'cancelled'
      group by c.id,c.name
      order by booked_revenue_minor desc
      limit 12
    `,[ctx.workspaceId,String(days)]);

    const totalRevenue=items.reduce((sum,item)=>sum+n(item.booked_revenue_minor),0);
    const totalReceived=items.reduce((sum,item)=>sum+n(item.received_revenue_minor),0);
    const totalCost=items.reduce((sum,item)=>sum+n(item.estimated_cost_minor),0);
    const totalOperations=items.reduce((sum,item)=>sum+n(item.operations),0);
    const costKnownOperations=items.reduce((sum,item)=>sum+n(item.cost_known_operations),0);
    const profit=totalRevenue-totalCost;
    const summary={
      days,
      operations:totalOperations,
      bookedRevenueMinor:totalRevenue,
      receivedRevenueMinor:totalReceived,
      estimatedCostMinor:totalCost,
      estimatedGrossProfitMinor:profit,
      estimatedGrossMarginPct:totalRevenue>0?pct(profit/totalRevenue*100):null,
      costCoveragePct:totalOperations>0?pct(costKnownOperations/totalOperations*100):0,
      methodology:'booked_revenue_minus_catalog_cost_snapshot_v1'
    };

    const rankedCustomers=customers.map(row=>{
      const revenue=n(row.booked_revenue_minor),cost=n(row.estimated_cost_minor),profit=revenue-cost;
      return {...row,booked_revenue_minor:revenue,received_revenue_minor:n(row.received_revenue_minor),estimated_cost_minor:cost,estimated_gross_profit_minor:profit,margin_pct:revenue>0?pct(profit/revenue*100):null};
    });

    const bestNow:NextOption[]=[];
    const missingCost=items.find(item=>Number(item.cost_coverage_pct)<100);
    const weakMargin=items.filter(item=>item.margin_pct!==null).sort((a,b)=>Number(a.margin_pct)-Number(b.margin_pct))[0];
    const strongMargin=items.filter(item=>item.margin_pct!==null&&Number(item.margin_pct)>=40).sort((a,b)=>Number(b.estimated_gross_profit_minor)-Number(a.estimated_gross_profit_minor))[0];
    if(missingCost)bestNow.push({action:'catalog_set_cost',label:'Completar custos do catálogo',reason:'Margem confiável começa com custo informado nas principais ofertas.',catalogItemId:missingCost.catalog_item_id});
    if(weakMargin&&Number(weakMargin.margin_pct)<20)bestNow.push({action:'catalog_review_price',label:'Rever a oferta de menor margem',reason:`${weakMargin.item_name} está com margem estimada de ${weakMargin.margin_pct}%.`,catalogItemId:weakMargin.catalog_item_id});
    if(strongMargin)bestNow.push({action:'create_proposal',label:'Vender mais da oferta mais rentável',reason:`${strongMargin.item_name} combina boa margem com resultado acumulado.`,catalogItemId:strongMargin.catalog_item_id,view:'materials'});
    if(totalRevenue>0&&totalReceived/totalRevenue<.7)bestNow.push({action:'review_receivables',label:'Transformar venda em caixa',reason:'Uma parte relevante do valor vendido ainda não aparece como recebido.',view:'finance'});

    return {summary,items:items.slice(0,20),customers:rankedCustomers,bestOptions:bestNow.slice(0,4)};
  });
}
