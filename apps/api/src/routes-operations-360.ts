import type {FastifyInstance} from 'fastify';
import {workspaceContext} from './auth.js';
import {query} from './db.js';

type FlowOption={action:string;label:string;reason:string;contactId?:string|null;dealId?:string|null;operationId?:string|null;catalogItemId?:string|null;view?:string};

export async function registerOperations360Routes(app:FastifyInstance){
  app.get('/v1/operations/commercial-360',async req=>{
    const ctx=await workspaceContext(req,'operations.read');
    const operations=await query<any>(`select
      o.*,c.name contact_name,c.email contact_email,d.title deal_title,d.stage deal_stage,d.value_minor deal_value_minor,
      ci.name catalog_name,ci.kind catalog_kind,ci.billing_cycle,
      dr.title document_title,dr.status document_status,
      l.status ledger_status,l.paid_at,l.due_at ledger_due_at,
      bt.id bank_transaction_id,bt.occurred_at bank_occurred_at,
      rr.id recurring_rule_id,rr.active recurring_active,rr.next_run_at recurring_next_run_at,
      m.id proposal_id,m.title proposal_title,m.status proposal_status,m.updated_at proposal_updated_at
      from business_operations o
      left join crm_contacts c on c.id=o.contact_id
      left join crm_deals d on d.id=o.deal_id
      left join business_catalog_items ci on ci.id=o.catalog_item_id
      left join document_refs dr on dr.id=o.document_ref_id
      left join ledger_entries l on l.id=o.ledger_entry_id
      left join reconciliation_matches rm on rm.ledger_entry_id=l.id
      left join bank_transactions bt on bt.id=rm.bank_transaction_id
      left join recurring_rules rr on rr.workspace_id=o.workspace_id and rr.source_operation_id=o.id and rr.active=true
      left join lateral (select mm.id,mm.title,mm.status,mm.updated_at from materials mm where mm.workspace_id=o.workspace_id and mm.kind='proposal' and mm.status<>'archived' and (mm.deal_id=o.deal_id or (o.deal_id is null and mm.contact_id=o.contact_id)) order by mm.updated_at desc limit 1) m on true
      where o.workspace_id=$1 and o.status<>'cancelled'
      order by o.updated_at desc limit 250`,[ctx.workspaceId]);

    const flows=operations.map(row=>{
      const paid=row.ledger_status==='paid'||row.status==='paid';
      const recurringExpected=row.billing_cycle&&row.billing_cycle!=='one_time';
      const stages=[
        {id:'opportunity',label:'Venda',done:Boolean(row.deal_id),status:row.deal_stage||null,at:null},
        {id:'proposal',label:'Proposta',done:Boolean(row.proposal_id),status:row.proposal_status||null,at:row.proposal_updated_at||null},
        {id:'contract',label:'Contrato',done:Boolean(row.document_ref_id),status:row.document_status||null,at:null},
        {id:'work',label:'Trabalho',done:true,status:row.status,at:row.created_at},
        {id:'invoice',label:'Nota',done:row.fiscal_status==='authorized',status:row.fiscal_status||null,at:null},
        {id:'collection',label:'Cobrança',done:Boolean(row.ledger_entry_id),status:row.ledger_status||null,at:row.ledger_due_at||null},
        {id:'payment',label:'Pagamento',done:paid,status:paid?'paid':row.ledger_status||null,at:row.paid_at||row.bank_occurred_at||null},
        {id:'recurrence',label:'Próximo ciclo',done:Boolean(row.recurring_rule_id),status:row.recurring_active?'active':null,at:row.recurring_next_run_at||null}
      ];
      const relevant=recurringExpected?stages:stages.filter(stage=>stage.id!=='recurrence');
      const progress=Math.round(relevant.filter(stage=>stage.done).length/relevant.length*100);
      const options:FlowOption[]=[];
      if(!row.proposal_id)options.push({action:'prepare_proposal',label:'Preparar proposta',reason:'Crie uma proposta usando o cliente e a oferta já vinculados.',contactId:row.contact_id,dealId:row.deal_id,catalogItemId:row.catalog_item_id,operationId:row.id,view:'materials'});
      if(!row.document_ref_id)options.push({action:'open_operation',label:'Vincular contrato',reason:'Continue a operação comercial e conecte o documento/contrato.',operationId:row.id,contactId:row.contact_id,view:'operations'});
      else if(!row.invoice_action_id&&row.fiscal_status!=='authorized')options.push({action:'open_operation',label:'Checar nota',reason:'Verifique a prontidão fiscal antes de preparar a emissão.',operationId:row.id,contactId:row.contact_id,view:'operations'});
      else if(!row.ledger_entry_id)options.push({action:'open_operation',label:'Preparar cobrança',reason:'Transforme a operação em recebível sem sair do contexto.',operationId:row.id,contactId:row.contact_id,view:'operations'});
      else if(!paid)options.push({action:'review_finance',label:'Acompanhar recebimento',reason:'A cobrança existe e ainda não foi conciliada como paga.',operationId:row.id,contactId:row.contact_id,view:'finance'});
      else if(recurringExpected&&!row.recurring_rule_id)options.push({action:'activate_recurrence',label:'Ativar próximo ciclo',reason:'A venda recorrente foi recebida, mas ainda não tem recorrência ativa.',operationId:row.id,contactId:row.contact_id,catalogItemId:row.catalog_item_id,view:'finance'});
      else options.push({action:'view_profitability',label:'Ver resultado',reason:'O ciclo comercial está completo; acompanhe margem e rentabilidade.',operationId:row.id,contactId:row.contact_id,catalogItemId:row.catalog_item_id,view:'finance'});
      options.push({action:'view_relationship',label:'Ver cliente',reason:'Abra o contexto comercial e de relacionamento deste cliente.',contactId:row.contact_id,view:'crm'});
      return{...row,amount_minor:Number(row.amount_minor||0),deal_value_minor:Number(row.deal_value_minor||0),progress,stages,bestOptions:options.slice(0,3)};
    });

    const unlinkedDeals=await query<any>(`select d.*,c.name contact_name from crm_deals d left join crm_contacts c on c.id=d.contact_id where d.workspace_id=$1 and d.stage<>'lost' and not exists(select 1 from business_operations o where o.workspace_id=d.workspace_id and o.deal_id=d.id and o.status<>'cancelled') order by case when d.stage='won' then 0 else 1 end,d.updated_at desc limit 100`,[ctx.workspaceId]);
    const opportunities=unlinkedDeals.map(row=>({...row,value_minor:Number(row.value_minor||0),bestOptions:[
      {action:'create_operation',label:'Transformar em operação',reason:'Leve a oportunidade para proposta, contrato, nota e cobrança no mesmo fluxo.',contactId:row.contact_id,dealId:row.id,view:'operations'},
      {action:'prepare_proposal',label:'Preparar proposta',reason:'Abra Materiais com o cliente desta oportunidade.',contactId:row.contact_id,dealId:row.id,view:'materials'}
    ]}));

    const completed=flows.filter(row=>row.stages.find((stage:any)=>stage.id==='payment')?.done).length;
    const stalled=flows.filter(row=>row.progress<70&&new Date(row.updated_at).getTime()<Date.now()-14*86400000).length;
    const top=flows.find(row=>row.bestOptions?.length)||opportunities[0];
    return{
      summary:{activeFlows:flows.length,completed,stalled,unlinkedDeals:opportunities.length,openValueMinor:flows.filter(row=>!['paid','closed'].includes(row.status)).reduce((sum,row)=>sum+row.amount_minor,0)},
      flows,opportunities,
      bestOptions:top?.bestOptions||[],
      principle:'one_business_context_from_opportunity_to_cash',
      safety:{automaticExternalActions:false,proposalAutoSend:false,invoiceAutoIssue:false,collectionMessageAutoSend:false}
    };
  });
}
