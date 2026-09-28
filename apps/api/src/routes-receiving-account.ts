import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {ApiError,workspaceContext} from './auth.js';
import {auditLog} from './events.js';
import {query} from './db.js';
import {nextgenFinancialConfigured,nextgenFinancialRequest,nextgenFinancialReceivingMode} from './nextgen-financial-adapter.js';

const setupInput=z.object({
  legalName:z.string().trim().min(2).max(180),
  taxId:z.string().trim().min(11).max(32),
  pixKeyType:z.enum(['CPF','CNPJ','EMAIL','PHONE','EVP']),
  pixKey:z.string().trim().min(3).max(240),
  payoutPolicy:z.enum(['manual','daily']).default('daily'),
  humanConfirmed:z.literal(true)
}).strict();
const changeKeyInput=setupInput;
const testInput=z.object({amountMinor:z.number().int().min(100).max(5000).default(100),humanConfirmed:z.literal(true)}).strict();
const withdrawInput=z.object({valueMinor:z.number().int().positive().optional(),humanConfirmed:z.literal(true)}).strict();

type CachedReceivingAccount={workspace_id:string;legal_name:string;tax_id_masked:string|null;pix_key_masked:string;pix_key_type:string;provider_status:string;payout_policy:'manual'|'daily';last_balance_minor:number|null;sync_status:string;last_synced_at:string|null;updated_at:string};
let shadowReady=false;
async function ensureShadow(){if(shadowReady)return;await query(`CREATE TABLE IF NOT EXISTS workspace_receiving_account_state (
  workspace_id text PRIMARY KEY,
  legal_name text NOT NULL,
  tax_id_masked text,
  pix_key_masked text NOT NULL,
  pix_key_type text NOT NULL,
  provider_status text NOT NULL DEFAULT 'UNKNOWN',
  payout_policy text NOT NULL DEFAULT 'manual',
  last_balance_minor bigint,
  sync_status text NOT NULL DEFAULT 'synced',
  last_synced_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
)`);shadowReady=true}
function maskTaxId(value:unknown){const v=String(value??'').replace(/\D/g,'');return v?`${v.slice(0,3)}***${v.slice(-3)}`:null}
function safeCached(row:CachedReceivingAccount|null){if(!row)return null;return{workspaceId:row.workspace_id,legalName:row.legal_name,taxIdMasked:row.tax_id_masked,pixKeyMasked:row.pix_key_masked,pixKeyType:row.pix_key_type,providerStatus:row.provider_status,payoutPolicy:row.payout_policy,balanceMinor:row.last_balance_minor==null?null:Number(row.last_balance_minor),lastCheckedAt:row.last_synced_at,configured:true,syncStatus:row.sync_status}}
async function cached(workspaceId:string){await ensureShadow();return (await query<CachedReceivingAccount>('select * from workspace_receiving_account_state where workspace_id=$1 limit 1',[workspaceId]))[0]||null}
async function saveCached(workspaceId:string,account:any,syncStatus='synced'){
  if(!account?.pixKeyMasked)return;
  await ensureShadow();
  await query(`insert into workspace_receiving_account_state(workspace_id,legal_name,tax_id_masked,pix_key_masked,pix_key_type,provider_status,payout_policy,last_balance_minor,sync_status,last_synced_at,updated_at)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),now())
    on conflict(workspace_id) do update set legal_name=excluded.legal_name,tax_id_masked=coalesce(excluded.tax_id_masked,workspace_receiving_account_state.tax_id_masked),pix_key_masked=excluded.pix_key_masked,pix_key_type=excluded.pix_key_type,provider_status=excluded.provider_status,payout_policy=excluded.payout_policy,last_balance_minor=coalesce(excluded.last_balance_minor,workspace_receiving_account_state.last_balance_minor),sync_status=excluded.sync_status,last_synced_at=now(),updated_at=now()`,[
      workspaceId,String(account.legalName||'Empresa'),account.taxIdMasked||null,String(account.pixKeyMasked),String(account.pixKeyType||'UNKNOWN'),String(account.providerStatus||'ACTIVE'),account.payoutPolicy==='daily'?'daily':'manual',account.balanceMinor==null?null:Number(account.balanceMinor),syncStatus
    ]);
}
async function markSync(workspaceId:string,status:string){await ensureShadow();await query('update workspace_receiving_account_state set sync_status=$2,updated_at=now() where workspace_id=$1',[workspaceId,status])}

function receivingActionsEnabled(){return String(process.env.NEXTGEN_RECEIVING_ACCOUNT_ACTIONS_ENABLED||process.env.NEXTGEN_FINANCIAL_ACTIONS_ENABLED||'false').toLowerCase()==='true'}
function requireConfigured(){if(!nextgenFinancialConfigured())throw new ApiError(409,'nextgen_financial_not_configured','O recebimento Pix automatizado ainda não está configurado neste ambiente.')}
function requireActions(){if(!receivingActionsEnabled())throw new ApiError(409,'receiving_account_actions_disabled','A configuração real de recebimento Pix ainda está bloqueada neste ambiente.')}

export async function registerReceivingAccountRoutes(app:FastifyInstance){
  app.get('/v1/collections/receiving-account',async req=>{
    const ctx=await workspaceContext(req,'finance.read');
    const local=await cached(ctx.workspaceId);
    if(!nextgenFinancialConfigured())return{configured:Boolean(local),account:safeCached(local),actionsEnabled:false,providerConfigured:false,degraded:Boolean(local),syncStatus:local?.sync_status||'not_configured',receivingMode:nextgenFinancialReceivingMode(),externalEffect:false};
    try{
      const result=await nextgenFinancialRequest<any>(ctx.workspaceId,'/receiving-account');
      if(result?.account?.configured){await saveCached(ctx.workspaceId,result.account,'synced');return{configured:true,account:result.account,actionsEnabled:receivingActionsEnabled()&&Boolean(result?.actionsEnabled),providerConfigured:Boolean(result?.providerConfigured),sandbox:Boolean(result?.sandbox),degraded:false,syncStatus:'synced',receivingMode:nextgenFinancialReceivingMode(),externalEffect:false}}
      if(local){await markSync(ctx.workspaceId,'provider_link_missing');return{configured:true,account:safeCached(local),actionsEnabled:false,providerConfigured:Boolean(result?.providerConfigured),sandbox:Boolean(result?.sandbox),degraded:true,syncStatus:'provider_link_missing',receivingMode:nextgenFinancialReceivingMode(),externalEffect:false}}
      return{configured:false,account:null,actionsEnabled:receivingActionsEnabled()&&Boolean(result?.actionsEnabled),providerConfigured:Boolean(result?.providerConfigured),sandbox:Boolean(result?.sandbox),degraded:false,syncStatus:'not_configured',receivingMode:nextgenFinancialReceivingMode(),externalEffect:false};
    }catch{
      if(local){await markSync(ctx.workspaceId,'provider_unreachable');return{configured:true,account:safeCached(local),actionsEnabled:false,providerConfigured:true,degraded:true,syncStatus:'provider_unreachable',receivingMode:nextgenFinancialReceivingMode(),externalEffect:false}}
      return{configured:false,account:null,actionsEnabled:false,providerConfigured:true,degraded:true,syncStatus:'provider_unreachable',receivingMode:nextgenFinancialReceivingMode(),externalEffect:false};
    }
  });

  app.post('/v1/collections/receiving-account/setup',async req=>{
    const ctx=await workspaceContext(req,'finance.write');requireConfigured();requireActions();const input=setupInput.parse(req.body||{});
    const result=await nextgenFinancialRequest<any>(ctx.workspaceId,'/receiving-account/setup',{method:'POST',body:JSON.stringify({legalName:input.legalName,taxId:input.taxId,pixKeyType:input.pixKeyType,pixKey:input.pixKey,payoutPolicy:input.payoutPolicy,humanApproved:true})});
    const account=result?.account||null;if(account)await saveCached(ctx.workspaceId,{...account,taxIdMasked:account.taxIdMasked||maskTaxId(input.taxId)},'synced');
    await auditLog(ctx,'collections.receiving_account.configured','workspace',ctx.workspaceId,null,{pixKeyType:input.pixKeyType,payoutPolicy:input.payoutPolicy,pixKeyMasked:account?.pixKeyMasked||null,providerStatus:account?.providerStatus||null,externalEffect:true});
    return{account,payoutPolicy:result?.payoutPolicy||input.payoutPolicy,syncStatus:'synced',externalEffect:true};
  });

  app.post('/v1/collections/receiving-account/change-key',async req=>{
    const ctx=await workspaceContext(req,'finance.write');requireConfigured();requireActions();const input=changeKeyInput.parse(req.body||{});
    const result=await nextgenFinancialRequest<any>(ctx.workspaceId,'/receiving-account/change-key',{method:'POST',body:JSON.stringify({legalName:input.legalName,taxId:input.taxId,pixKeyType:input.pixKeyType,pixKey:input.pixKey,payoutPolicy:input.payoutPolicy,humanApproved:true})});
    const account=result?.account||null;if(account)await saveCached(ctx.workspaceId,{...account,taxIdMasked:account.taxIdMasked||maskTaxId(input.taxId)},'synced');
    await auditLog(ctx,'collections.receiving_account.pix_key_changed','workspace',ctx.workspaceId,null,{pixKeyType:input.pixKeyType,payoutPolicy:input.payoutPolicy,pixKeyMasked:account?.pixKeyMasked||null,oldSubaccountCleanupPending:Boolean(result?.oldSubaccountCleanupPending),externalEffect:Boolean(result?.externalEffect)});
    return{account,changed:Boolean(result?.changed),oldSubaccountCleanupPending:Boolean(result?.oldSubaccountCleanupPending),syncStatus:'synced',externalEffect:Boolean(result?.externalEffect)};
  });

  app.post('/v1/collections/receiving-account/refresh',async req=>{
    const ctx=await workspaceContext(req,'finance.read');requireConfigured();const result=await nextgenFinancialRequest<any>(ctx.workspaceId,'/receiving-account/refresh',{method:'POST',body:'{}'});const account=result?.account||null;if(account)await saveCached(ctx.workspaceId,account,'synced');return{account,syncStatus:'synced',externalEffect:false};
  });

  app.post('/v1/collections/receiving-account/test-charge',async req=>{
    const ctx=await workspaceContext(req,'finance.write');requireConfigured();requireActions();const input=testInput.parse(req.body||{});
    const result=await nextgenFinancialRequest<any>(ctx.workspaceId,'/receiving-account/test-charge',{method:'POST',body:JSON.stringify({amountMinor:input.amountMinor,humanApproved:true})});
    await auditLog(ctx,'collections.receiving_account.test_charge','workspace',ctx.workspaceId,null,{amountMinor:input.amountMinor,splitType:result?.split?.type||null,destinationPixKeyMasked:result?.split?.destinationPixKeyMasked||null,sandbox:Boolean(result?.sandbox),externalEffect:true});
    return{correlationId:result?.correlationId||null,charge:result?.charge||null,split:result?.split||null,sandbox:Boolean(result?.sandbox),externalEffect:true};
  });

  app.post('/v1/collections/receiving-account/withdraw',async req=>{
    const ctx=await workspaceContext(req,'finance.write');requireConfigured();requireActions();const input=withdrawInput.parse(req.body||{});
    const result=await nextgenFinancialRequest<any>(ctx.workspaceId,'/receiving-account/withdraw',{method:'POST',body:JSON.stringify({valueMinor:input.valueMinor,humanApproved:true})});
    await auditLog(ctx,'collections.receiving_account.withdraw','workspace',ctx.workspaceId,null,{pixKeyMasked:result?.withdrawal?.pixKeyMasked||null,valueMinor:result?.withdrawal?.valueMinor||null,sandbox:Boolean(result?.sandbox),externalEffect:true});
    return{withdrawal:result?.withdrawal||null,sandbox:Boolean(result?.sandbox),externalEffect:true};
  });
}
