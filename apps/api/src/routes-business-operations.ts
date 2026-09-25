import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {ApiError,workspaceContext} from './auth.js';
import {query,transaction} from './db.js';
import {auditLog,emitBusinessEvent} from './events.js';
import {decryptPaymentValue,paymentDataEncryptionConfigured} from './payment-data-crypto.js';

const uuid=z.string().uuid();
const optionalUuid=uuid.optional().nullable();
const digits=(value:unknown)=>String(value||'').replace(/\D/g,'');
const money=(minor:unknown,currency='BRL')=>new Intl.NumberFormat('pt-BR',{style:'currency',currency}).format(Number(minor||0)/100);
const datePt=(value:unknown)=>value?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(String(value))):null;

export async function registerBusinessOperationRoutes(app:FastifyInstance){
  app.get('/v1/business-operations',async req=>{
    const ctx=await workspaceContext(req,'workspace.read');
    return query<any>(`select o.*,c.name contact_name,c.email contact_email,c.phone contact_phone,c.document_number,d.title deal_title,dr.title document_title,dr.provider document_provider,dr.external_ref document_external_ref,a.status invoice_action_status,a.autonomy invoice_action_autonomy,ca.status communication_action_status,ca.autonomy communication_action_autonomy,l.status ledger_status from business_operations o left join crm_contacts c on c.id=o.contact_id left join crm_deals d on d.id=o.deal_id left join document_refs dr on dr.id=o.document_ref_id left join command_actions a on a.id=o.invoice_action_id left join command_actions ca on ca.id=o.communication_action_id left join ledger_entries l on l.id=o.ledger_entry_id where o.workspace_id=$1 order by o.updated_at desc limit 300`,[ctx.workspaceId]);
  });

  app.post('/v1/business-operations',async req=>{
    const ctx=await workspaceContext(req,'workspace.write');
    const input=z.object({contactId:uuid,dealId:optionalUuid,providerRequestId:optionalUuid,documentRefId:optionalUuid,title:z.string().trim().min(2).max(200),description:z.string().trim().min(3).max(2500),amountMinor:z.number().int().min(0),dueAt:z.string().datetime().optional().nullable()}).parse(req.body);
    if(!((await query<any>(`select id from crm_contacts where id=$1 and workspace_id=$2`,[input.contactId,ctx.workspaceId]))[0]))throw new ApiError(404,'contact_not_found','Cliente não encontrado neste workspace.');
    if(input.dealId&&!((await query<any>(`select id from crm_deals where id=$1 and workspace_id=$2`,[input.dealId,ctx.workspaceId]))[0]))throw new ApiError(404,'deal_not_found','Oportunidade não encontrada neste workspace.');
    if(input.documentRefId&&!((await query<any>(`select id from document_refs where id=$1 and workspace_id=$2`,[input.documentRefId,ctx.workspaceId]))[0]))throw new ApiError(404,'document_not_found','Documento não encontrado neste workspace.');
    if(input.providerRequestId&&!((await query<any>(`select id from provider_requests where id=$1 and (requester_workspace_id=$2 or provider_workspace_id=$2)`,[input.providerRequestId,ctx.workspaceId]))[0]))throw new ApiError(404,'provider_request_not_found','Solicitação da Rede não encontrada.');
    const status=input.documentRefId?'contract_ready':'draft';
    const rows=await query<any>(`insert into business_operations(workspace_id,contact_id,deal_id,provider_request_id,document_ref_id,title,description,amount_minor,due_at,status,metadata) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,[ctx.workspaceId,input.contactId,input.dealId||null,input.providerRequestId||null,input.documentRefId||null,input.title,input.description,input.amountMinor,input.dueAt||null,status,JSON.stringify({contractEngine:'docwallet',fiscalEngine:'taxagent',collectionMode:'owner_pix',communicationEngine:'smartbots'})]);
    await auditLog(ctx,'business_operation.created','business_operation',rows[0].id,null,rows[0]);return rows[0];
  });

  app.post('/v1/business-operations/:id/link-document',async req=>{
    const ctx=await workspaceContext(req,'workspace.write'),id=uuid.parse((req.params as any).id),input=z.object({documentRefId:uuid}).parse(req.body);
    const operation=(await query<any>(`select * from business_operations where id=$1 and workspace_id=$2`,[id,ctx.workspaceId]))[0];if(!operation)throw new ApiError(404,'not_found','Operação não encontrada.');
    const doc=(await query<any>(`select id,provider,external_ref,title,status,signature_status from document_refs where id=$1 and workspace_id=$2`,[input.documentRefId,ctx.workspaceId]))[0];if(!doc)throw new ApiError(404,'document_not_found','Documento não encontrado neste workspace.');
    const rows=await query<any>(`update business_operations set document_ref_id=$3,status=case when status='draft' then 'contract_ready' else status end,metadata=metadata||$4::jsonb,updated_at=now() where id=$1 and workspace_id=$2 returning *`,[id,ctx.workspaceId,input.documentRefId,JSON.stringify({contractProvider:doc.provider,contractExternalRef:doc.external_ref})]);
    await auditLog(ctx,'business_operation.document_linked','business_operation',id,operation,{documentRefId:doc.id,provider:doc.provider});return rows[0];
  });

  app.post('/v1/business-operations/:id/prepare-invoice',async req=>{
    const ctx=await workspaceContext(req,'workspace.write'),id=uuid.parse((req.params as any).id);
    const input=z.object({environment:z.enum(['test','production']).default('test'),competence:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),customerCityCode:z.string().regex(/^\d{7}$/).optional().nullable(),serviceLocationCityCode:z.string().regex(/^\d{7}$/).optional().nullable(),nationalServiceCode:z.string().trim().max(30).optional().nullable(),nbs:z.string().regex(/^\d{9}$/).optional().nullable(),issTaxation:z.enum(['1','2','3','4']).optional().nullable(),issWithholding:z.enum(['1','2','3']).optional().nullable(),issRate:z.number().min(0).max(9.99).optional().nullable(),finalConsumption:z.enum(['0','1']).optional().nullable(),taxDecisionId:z.string().trim().optional().nullable(),preparedDpsId:z.string().trim().optional().nullable()}).parse(req.body||{});
    const operation=(await query<any>(`select o.*,c.name contact_name,c.document_number,c.custom_fields from business_operations o join crm_contacts c on c.id=o.contact_id where o.id=$1 and o.workspace_id=$2`,[id,ctx.workspaceId]))[0];if(!operation)throw new ApiError(404,'not_found','Operação não encontrada.');
    if(operation.invoice_action_id)throw new ApiError(409,'invoice_already_prepared','Já existe uma emissão fiscal preparada para esta operação.');
    const taxId=String(operation.document_number||'').replace(/\D/g,'');if(!taxId)throw new ApiError(409,'customer_tax_id_required','Informe CPF/CNPJ do cliente no CRM antes de preparar a nota.');
    const custom=operation.custom_fields||{};const cityCode=String(input.customerCityCode||custom.cityCode||custom.city_code||custom.ibgeCityCode||'').replace(/\D/g,'');if(cityCode.length!==7)throw new ApiError(409,'customer_city_code_required','Informe o código IBGE de 7 dígitos do município do cliente.');
    const payload={operationId:id,environment:input.environment,...(input.competence?{competence:input.competence}:{}),...(input.taxDecisionId?{taxDecisionId:input.taxDecisionId}:{}),...(input.preparedDpsId?{preparedDpsId:input.preparedDpsId}:{}),customer:{taxId,name:operation.contact_name,cityCode},service:{description:operation.description,amount:Number(operation.amount_minor)/100,...(input.nationalServiceCode?{nationalServiceCode:input.nationalServiceCode}:{}),...(input.nbs?{nbs:input.nbs}:{}),...(input.serviceLocationCityCode?{serviceLocationCityCode:input.serviceLocationCityCode}:{}),...(input.issTaxation?{issTaxation:input.issTaxation}:{}),...(input.issWithholding?{issWithholding:input.issWithholding}:{}),...(input.issRate!==undefined&&input.issRate!==null?{issRate:input.issRate}:{}),...(input.finalConsumption?{finalConsumption:input.finalConsumption}:{})},lineage:{businessOperationId:id,documentRefId:operation.document_ref_id||null,dealId:operation.deal_id||null,providerRequestId:operation.provider_request_id||null}};
    const emitted=await emitBusinessEvent(ctx.workspaceId,'invoice.issue','nexoffice.business-operation','business_operation',id,payload,`business-operation:${id}:invoice`);
    const actionId=(emitted.action as any)?.id;if(!actionId)throw new ApiError(500,'invoice_action_not_created','Não foi possível preparar a aprovação fiscal.');
    const rows=await query<any>(`update business_operations set invoice_action_id=$3,status='invoice_pending',metadata=metadata||$4::jsonb,updated_at=now() where id=$1 and workspace_id=$2 returning *`,[id,ctx.workspaceId,actionId,JSON.stringify({invoiceEnvironment:input.environment,invoicePreparedAt:new Date().toISOString()})]);
    await auditLog(ctx,'business_operation.invoice_prepared','business_operation',id,operation,{actionId,externalEffect:false});return {operation:rows[0],action:emitted.action,externalEffect:false,governance:'human_approval_required'};
  });

  app.post('/v1/business-operations/:id/prepare-collection',async req=>{
    const ctx=await workspaceContext(req,'finance.write'),id=uuid.parse((req.params as any).id);
    const operation=(await query<any>(`select * from business_operations where id=$1 and workspace_id=$2`,[id,ctx.workspaceId]))[0];if(!operation)throw new ApiError(404,'not_found','Operação não encontrada.');
    if(operation.ledger_entry_id){const existing=(await query<any>(`select * from ledger_entries where id=$1 and workspace_id=$2`,[operation.ledger_entry_id,ctx.workspaceId]))[0];return {reused:true,receivable:existing,operation};}
    const result=await transaction(async client=>{
      const ledger=(await client.query(`insert into ledger_entries(workspace_id,contact_id,direction,category,description,amount_minor,currency,status,due_at,metadata) values($1,$2,'income','service',$3,$4,$5,'open',$6,$7) returning *`,[ctx.workspaceId,operation.contact_id,operation.description,operation.amount_minor,operation.currency,operation.due_at,JSON.stringify({source:'business_operation',businessOperationId:id,documentRefId:operation.document_ref_id||null,fiscalExternalRef:operation.fiscal_external_ref||null})])).rows[0];
      const updated=(await client.query(`update business_operations set ledger_entry_id=$3,status='collection_ready',updated_at=now() where id=$1 and workspace_id=$2 returning *`,[id,ctx.workspaceId,ledger.id])).rows[0];return {ledger,updated};
    });
    await auditLog(ctx,'business_operation.collection_prepared','business_operation',id,operation,{ledgerEntryId:result.ledger.id,externalEffect:false});return {reused:false,receivable:result.ledger,operation:result.updated,externalEffect:false,pixPackageEndpoint:`/v1/collections/ledger/${result.ledger.id}/pix-package`};
  });

  app.post('/v1/business-operations/:id/communication-draft',async req=>{
    const ctx=await workspaceContext(req,'finance.read'),id=uuid.parse((req.params as any).id);
    if(!paymentDataEncryptionConfigured())throw new ApiError(409,'payment_data_key_not_configured','A proteção dos dados Pix ainda não foi configurada neste ambiente.');
    const operation=(await query<any>(`select o.*,c.name contact_name,c.phone contact_phone,l.id ledger_id from business_operations o join crm_contacts c on c.id=o.contact_id left join ledger_entries l on l.id=o.ledger_entry_id where o.id=$1 and o.workspace_id=$2`,[id,ctx.workspaceId]))[0];if(!operation)throw new ApiError(404,'not_found','Operação não encontrada.');
    if(!operation.ledger_id)throw new ApiError(409,'collection_required','Prepare o recebível antes da comunicação.');
    const profile=(await query<any>(`select * from workspace_payment_profiles where workspace_id=$1`,[ctx.workspaceId]))[0];if(!profile)throw new ApiError(409,'pix_profile_required','Cadastre os dados Pix do negócio antes de preparar a comunicação.');
    let pixKey:string;try{pixKey=decryptPaymentValue({ciphertext:profile.pix_key_ciphertext,iv:profile.pix_key_iv,tag:profile.pix_key_tag})}catch{throw new ApiError(409,'pix_profile_unreadable','Não foi possível ler a chave Pix protegida.');}
    const amount=money(operation.amount_minor,operation.currency||'BRL');const due=datePt(operation.due_at);
    const message=[`Olá, ${operation.contact_name||'cliente'}!`,`Segue a cobrança referente a ${operation.description}.`,`Valor: ${amount}.`,due?`Vencimento: ${due}.`:'',`Pagamento via Pix`,`Favorecido: ${profile.beneficiary_name}`,`Chave Pix: ${pixKey}`,profile.instructions||'',operation.fiscal_external_ref?`Referência fiscal: ${operation.fiscal_external_ref}`:'','Se já realizou o pagamento, desconsidere esta mensagem.'].filter(Boolean).join('\n');
    await auditLog(ctx,'business_operation.communication_draft_created','business_operation',id,null,{ledgerEntryId:operation.ledger_id,channel:'whatsapp',externalEffect:false,secretPersisted:false});
    return {externalEffect:false,secretPersisted:false,channel:'whatsapp',recipient:operation.contact_phone||null,contactName:operation.contact_name,message,smartBots:{planned:true,note:'O envio nativo será ligado ao fluxo de aprovação do SmartBots sem persistir a chave Pix em texto aberto.'}};
  });

  app.post('/v1/business-operations/:id/prepare-communication',async req=>{
    const ctx=await workspaceContext(req,'finance.write'),id=uuid.parse((req.params as any).id);
    const input=z.object({note:z.string().trim().max(600).optional().nullable()}).parse(req.body||{});
    const operation=(await query<any>(`select o.*,c.name contact_name,c.phone contact_phone,l.id ledger_id from business_operations o join crm_contacts c on c.id=o.contact_id left join ledger_entries l on l.id=o.ledger_entry_id where o.id=$1 and o.workspace_id=$2`,[id,ctx.workspaceId]))[0];
    if(!operation)throw new ApiError(404,'not_found','Operação não encontrada.');
    if(!operation.ledger_id)throw new ApiError(409,'collection_required','Prepare o recebível antes da comunicação.');
    if(operation.communication_action_id)throw new ApiError(409,'communication_already_prepared','Já existe uma comunicação preparada para esta operação.');
    const recipient=digits(operation.contact_phone);if(recipient.length<10)throw new ApiError(409,'contact_whatsapp_required','Informe um WhatsApp válido no CRM antes de preparar a cobrança.');
    const profile=(await query<any>(`select beneficiary_name from workspace_payment_profiles where workspace_id=$1`,[ctx.workspaceId]))[0];if(!profile)throw new ApiError(409,'pix_profile_required','Cadastre os dados Pix do negócio antes de preparar a cobrança.');
    const amount=money(operation.amount_minor,operation.currency||'BRL'),due=datePt(operation.due_at);
    const messageTemplate=[`Olá, ${operation.contact_name||'cliente'}!`,input.note||'',`Segue a cobrança referente a ${operation.description}.`,`Valor: ${amount}.`,due?`Vencimento: ${due}.`:'',`Pagamento via Pix`,`Favorecido: {{PIX_BENEFICIARY}}`,`Chave Pix: {{PIX_KEY}}`,`{{PIX_INSTRUCTIONS}}`,operation.fiscal_external_ref?`Referência fiscal: ${operation.fiscal_external_ref}`:'','Se já realizou o pagamento, desconsidere esta mensagem.'].filter(Boolean).join('\n');
    const title=`Cobrança de ${operation.contact_name||operation.title}`;
    const summary=`Cobrança Pix de ${amount} preparada sem persistir a chave Pix em texto aberto.`;
    const payload={channel:'whatsapp',recipient,contactName:operation.contact_name,messageTemplate,paymentContext:{kind:'owner_pix',ledgerEntryId:operation.ledger_id,businessOperationId:id}};
    const created=await transaction(async client=>{
      const approval=await client.query<any>(`insert into approval_requests(workspace_id,action_type,title,description,status,requested_by_agent,subject_type,subject_id,proposed_payload) values($1,'message.send',$2,$3,'pending','collections','business_operation',$4,$5) returning *`,[ctx.workspaceId,title,summary,id,JSON.stringify(payload)]);
      const action=await client.query<any>(`insert into command_actions(workspace_id,agent_role,title,summary,priority,status,autonomy,approval_id,subject_type,subject_id,primary_action,secondary_actions,metadata) values($1,'collections',$2,$3,'high','open','approval_required',$4,'business_operation',$5,$6,$7,$8) returning *`,[ctx.workspaceId,title,summary,approval.rows[0].id,id,JSON.stringify({type:'message.send',payload}),JSON.stringify([]),JSON.stringify({source:'business-operation',provider:'smartbots',humanApprovalRequired:true,paymentHydration:'owner_pix',pixKeyPersisted:false})]);
      const updated=await client.query<any>(`update business_operations set communication_action_id=$3,status='communication_pending',metadata=metadata||$4::jsonb,updated_at=now() where id=$1 and workspace_id=$2 returning *`,[id,ctx.workspaceId,action.rows[0].id,JSON.stringify({communicationPreparedAt:new Date().toISOString(),pixKeyPersisted:false})]);
      return {approval:approval.rows[0],action:action.rows[0],operation:updated.rows[0]};
    });
    await auditLog(ctx,'business_operation.communication_prepared','business_operation',id,operation,{actionId:created.action.id,approvalId:created.approval.id,provider:'smartbots',externalEffect:false,pixKeyPersisted:false});
    return {status:'pending_approval',operation:created.operation,action:created.action,approval:{id:created.approval.id,status:created.approval.status},governance:{humanApprovalRequired:true,externalEffect:false,pixKeyPersisted:false,paymentHydration:'execution_only'}};
  });

  app.post('/v1/business-operations/:id/mark-paid',async req=>{
    const ctx=await workspaceContext(req,'finance.write'),id=uuid.parse((req.params as any).id);
    const operation=(await query<any>(`select * from business_operations where id=$1 and workspace_id=$2`,[id,ctx.workspaceId]))[0];if(!operation)throw new ApiError(404,'not_found','Operação não encontrada.');if(!operation.ledger_entry_id)throw new ApiError(409,'collection_required','A operação ainda não possui recebível.');
    await query(`update ledger_entries set status='paid',paid_at=coalesce(paid_at,now()),updated_at=now() where id=$1 and workspace_id=$2`,[operation.ledger_entry_id,ctx.workspaceId]);
    const rows=await query<any>(`update business_operations set status='paid',updated_at=now() where id=$1 and workspace_id=$2 returning *`,[id,ctx.workspaceId]);await auditLog(ctx,'business_operation.marked_paid','business_operation',id,operation,rows[0]);return rows[0];
  });
}
