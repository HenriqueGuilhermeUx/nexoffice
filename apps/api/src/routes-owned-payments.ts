import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {ApiError,workspaceContext} from './auth.js';
import {query} from './db.js';
import {auditLog} from './events.js';
import {decryptPaymentValue,encryptPaymentValue,maskPixKey,paymentDataEncryptionConfigured} from './payment-data-crypto.js';

const uuid=z.string().uuid();
const profileInput=z.object({
  pixKeyType:z.enum(['cpf','cnpj','email','phone','random']),
  pixKey:z.string().trim().min(3).max(200),
  beneficiaryName:z.string().trim().min(2).max(160),
  documentLabel:z.string().trim().max(80).optional().nullable(),
  instructions:z.string().trim().max(500).optional().nullable()
});

export async function registerOwnedPaymentRoutes(app:FastifyInstance){
  app.get('/v1/collections/payment-profile',async req=>{
    const ctx=await workspaceContext(req,'finance.read');
    const row=(await query<any>(`select workspace_id,pix_key_type,pix_key_ciphertext,pix_key_iv,pix_key_tag,beneficiary_name,document_label,instructions,created_at,updated_at from workspace_payment_profiles where workspace_id=$1`,[ctx.workspaceId]))[0];
    if(!row)return {configured:false,encryptionConfigured:paymentDataEncryptionConfigured(),method:'pix'};
    let maskedPixKey='••••';
    if(paymentDataEncryptionConfigured()){
      try{maskedPixKey=maskPixKey(decryptPaymentValue({ciphertext:row.pix_key_ciphertext,iv:row.pix_key_iv,tag:row.pix_key_tag}),row.pix_key_type)}catch{maskedPixKey='••••'}
    }
    return {configured:true,encryptionConfigured:paymentDataEncryptionConfigured(),method:'pix',pixKeyType:row.pix_key_type,maskedPixKey,beneficiaryName:row.beneficiary_name,documentLabel:row.document_label,instructions:row.instructions,updatedAt:row.updated_at};
  });

  app.put('/v1/collections/payment-profile',async req=>{
    const ctx=await workspaceContext(req,'finance.write');
    if(!paymentDataEncryptionConfigured())throw new ApiError(409,'payment_data_key_not_configured','Configure NEXOFFICE_PAYMENT_DATA_KEY antes de salvar uma chave Pix.');
    const input=profileInput.parse(req.body),encrypted=encryptPaymentValue(input.pixKey);
    const before=(await query<any>(`select workspace_id,pix_key_type,beneficiary_name,document_label,instructions,updated_at from workspace_payment_profiles where workspace_id=$1`,[ctx.workspaceId]))[0]||null;
    const rows=await query<any>(`insert into workspace_payment_profiles(workspace_id,pix_key_type,pix_key_ciphertext,pix_key_iv,pix_key_tag,beneficiary_name,document_label,instructions,updated_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict(workspace_id) do update set pix_key_type=excluded.pix_key_type,pix_key_ciphertext=excluded.pix_key_ciphertext,pix_key_iv=excluded.pix_key_iv,pix_key_tag=excluded.pix_key_tag,beneficiary_name=excluded.beneficiary_name,document_label=excluded.document_label,instructions=excluded.instructions,updated_by=excluded.updated_by,updated_at=now() returning workspace_id,pix_key_type,beneficiary_name,document_label,instructions,updated_at`,[ctx.workspaceId,input.pixKeyType,encrypted.ciphertext,encrypted.iv,encrypted.tag,input.beneficiaryName,input.documentLabel||null,input.instructions||null,ctx.user.id]);
    const safe={...rows[0],maskedPixKey:maskPixKey(input.pixKey,input.pixKeyType)};
    await auditLog(ctx,'collections.payment_profile.updated','workspace',ctx.workspaceId,before,safe);
    return {configured:true,method:'pix',pixKeyType:input.pixKeyType,maskedPixKey:safe.maskedPixKey,beneficiaryName:input.beneficiaryName,documentLabel:input.documentLabel||null,instructions:input.instructions||null,updatedAt:rows[0].updated_at};
  });

  app.get('/v1/collections/pix-ready',async req=>{
    const ctx=await workspaceContext(req,'finance.read');
    return query<any>(`select l.id,l.contact_id,l.description,l.amount_minor,l.currency,l.due_at,l.status,c.name contact_name,c.email contact_email,c.phone contact_phone from ledger_entries l left join crm_contacts c on c.id=l.contact_id where l.workspace_id=$1 and l.direction='income' and l.status in ('open','overdue') order by coalesce(l.due_at,l.created_at) asc limit 200`,[ctx.workspaceId]);
  });

  app.post('/v1/collections/ledger/:id/pix-package',async req=>{
    const ctx=await workspaceContext(req,'finance.read'),id=uuid.parse((req.params as any).id);
    if(!paymentDataEncryptionConfigured())throw new ApiError(409,'payment_data_key_not_configured','A proteção dos dados Pix ainda não foi configurada neste ambiente.');
    const profile=(await query<any>(`select * from workspace_payment_profiles where workspace_id=$1`,[ctx.workspaceId]))[0];
    if(!profile)throw new ApiError(409,'pix_profile_required','Cadastre a chave Pix do seu negócio antes de preparar a cobrança.');
    const ledger=(await query<any>(`select l.*,c.name contact_name,c.email contact_email,c.phone contact_phone from ledger_entries l left join crm_contacts c on c.id=l.contact_id where l.id=$1 and l.workspace_id=$2 and l.direction='income'`,[id,ctx.workspaceId]))[0];
    if(!ledger)throw new ApiError(404,'not_found','Recebível não encontrado.');
    if(ledger.status==='paid')throw new ApiError(409,'already_paid','Este recebível já foi pago.');
    let pixKey:string;
    try{pixKey=decryptPaymentValue({ciphertext:profile.pix_key_ciphertext,iv:profile.pix_key_iv,tag:profile.pix_key_tag})}catch{throw new ApiError(409,'pix_profile_unreadable','Não foi possível ler a chave Pix protegida. Salve novamente o perfil de recebimento.');}
    const amount=money(ledger.amount_minor),due=ledger.due_at?datePt(ledger.due_at):null,customer=String(ledger.contact_name||'cliente');
    const lines=[`Olá, ${customer}!`, '', `Segue a cobrança referente a ${String(ledger.description||'serviço')}.`, `Valor: ${amount}.`,due?`Vencimento: ${due}.`:'', '', `Pagamento via Pix`, `Favorecido: ${profile.beneficiary_name}`, `Chave (${pixTypeLabel(profile.pix_key_type)}): ${pixKey}`,profile.document_label?`Identificação: ${profile.document_label}`:'',profile.instructions?String(profile.instructions):'', '', 'Se já realizou o pagamento, desconsidere esta mensagem.'].filter(Boolean);
    const copyText=lines.join('\n');
    await auditLog(ctx,'collections.pix_package.prepared','ledger_entry',id,null,{method:'pix',contactId:ledger.contact_id,amountMinor:Number(ledger.amount_minor),externalEffect:false});
    return {externalEffect:false,method:'pix',receivable:{id:ledger.id,description:ledger.description,amountMinor:Number(ledger.amount_minor),currency:ledger.currency,dueAt:ledger.due_at,status:ledger.status},customer:{name:ledger.contact_name,email:ledger.contact_email,phone:ledger.contact_phone},payment:{pixKeyType:profile.pix_key_type,pixKey,beneficiaryName:profile.beneficiary_name,documentLabel:profile.document_label},copyText};
  });
}

function money(value:any){return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value||0)/100)}
function datePt(value:any){return new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(value))}
function pixTypeLabel(value:string){return ({cpf:'CPF',cnpj:'CNPJ',email:'e-mail',phone:'telefone',random:'aleatória'} as Record<string,string>)[value]||value}
