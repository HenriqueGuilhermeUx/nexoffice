import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {ApiError,workspaceContext} from './auth.js';
import {auditLog} from './events.js';
import {nextgenFinancialConfigured,nextgenFinancialRequest,nextgenFinancialReceivingMode} from './nextgen-financial-adapter.js';

const payoutPolicy=z.enum(['manual','daily','economic']);
const setupInput=z.object({
  legalName:z.string().trim().min(2).max(180),
  taxId:z.string().trim().min(11).max(32),
  pixKeyType:z.enum(['CPF','CNPJ','EMAIL','PHONE','EVP']),
  pixKey:z.string().trim().min(3).max(240),
  payoutPolicy:payoutPolicy.default('economic'),
  humanConfirmed:z.literal(true)
}).strict();
const testInput=z.object({amountMinor:z.number().int().min(100).max(5000).default(100),humanConfirmed:z.literal(true)}).strict();
const payoutPolicyInput=z.object({policy:payoutPolicy,freeWithdrawThresholdMinor:z.number().int().min(100).max(100_000_000).optional(),humanConfirmed:z.literal(true)}).strict();
const withdrawInput=z.object({valueMinor:z.number().int().positive().optional(),humanConfirmed:z.literal(true)}).strict();

function receivingActionsEnabled(){return String(process.env.NEXTGEN_RECEIVING_ACCOUNT_ACTIONS_ENABLED||process.env.NEXTGEN_FINANCIAL_ACTIONS_ENABLED||'false').toLowerCase()==='true'}
function payoutActionsEnabled(){return String(process.env.NEXTGEN_PAYOUT_ACTIONS_ENABLED||process.env.NEXTGEN_RECEIVING_ACCOUNT_ACTIONS_ENABLED||process.env.NEXTGEN_FINANCIAL_ACTIONS_ENABLED||'false').toLowerCase()==='true'}
function requireConfigured(){if(!nextgenFinancialConfigured())throw new ApiError(409,'nextgen_financial_not_configured','O recebimento Pix automatizado ainda não está configurado neste ambiente.')}
function requireActions(){if(!receivingActionsEnabled())throw new ApiError(409,'receiving_account_actions_disabled','A configuração real de recebimento Pix ainda está bloqueada neste ambiente.')}
function requirePayoutActions(){if(!payoutActionsEnabled())throw new ApiError(409,'payout_actions_disabled','Os repasses automáticos ainda estão bloqueados neste ambiente.')}

export async function registerReceivingAccountRoutes(app:FastifyInstance){
  app.get('/v1/collections/receiving-account',async req=>{
    const ctx=await workspaceContext(req,'finance.read');
    if(!nextgenFinancialConfigured())return{configured:false,account:null,actionsEnabled:false,providerConfigured:false,receivingMode:nextgenFinancialReceivingMode(),externalEffect:false};
    try{
      const result=await nextgenFinancialRequest<any>(ctx.workspaceId,'/receiving-account');
      return{configured:Boolean(result?.account?.configured),account:result?.account||null,actionsEnabled:receivingActionsEnabled()&&Boolean(result?.actionsEnabled),providerConfigured:Boolean(result?.providerConfigured),sandbox:Boolean(result?.sandbox),receivingMode:nextgenFinancialReceivingMode(),externalEffect:false};
    }catch{return{configured:false,account:null,actionsEnabled:false,providerConfigured:true,degraded:true,receivingMode:nextgenFinancialReceivingMode(),externalEffect:false}}
  });

  app.post('/v1/collections/receiving-account/setup',async req=>{
    const ctx=await workspaceContext(req,'finance.write');requireConfigured();requireActions();const input=setupInput.parse(req.body||{});
    const result=await nextgenFinancialRequest<any>(ctx.workspaceId,'/receiving-account/setup',{method:'POST',body:JSON.stringify({legalName:input.legalName,taxId:input.taxId,pixKeyType:input.pixKeyType,pixKey:input.pixKey,payoutPolicy:input.payoutPolicy,humanApproved:true})});
    await auditLog(ctx,'collections.receiving_account.configured','workspace',ctx.workspaceId,null,{pixKeyType:input.pixKeyType,payoutPolicy:input.payoutPolicy,pixKeyMasked:result?.account?.pixKeyMasked||null,providerStatus:result?.account?.providerStatus||null,externalEffect:true});
    return{account:result?.account||null,payoutPolicy:result?.payoutPolicy||input.payoutPolicy,externalEffect:true};
  });

  app.post('/v1/collections/receiving-account/refresh',async req=>{
    const ctx=await workspaceContext(req,'finance.read');requireConfigured();const result=await nextgenFinancialRequest<any>(ctx.workspaceId,'/receiving-account/refresh',{method:'POST',body:'{}'});return{account:result?.account||null,externalEffect:false};
  });

  app.post('/v1/collections/receiving-account/test-charge',async req=>{
    const ctx=await workspaceContext(req,'finance.write');requireConfigured();requireActions();const input=testInput.parse(req.body||{});
    const result=await nextgenFinancialRequest<any>(ctx.workspaceId,'/receiving-account/test-charge',{method:'POST',body:JSON.stringify({amountMinor:input.amountMinor,humanApproved:true})});
    await auditLog(ctx,'collections.receiving_account.test_charge','workspace',ctx.workspaceId,null,{amountMinor:input.amountMinor,splitType:result?.split?.type||null,destinationPixKeyMasked:result?.split?.destinationPixKeyMasked||null,sandbox:Boolean(result?.sandbox),externalEffect:true});
    return{correlationId:result?.correlationId||null,charge:result?.charge||null,split:result?.split||null,sandbox:Boolean(result?.sandbox),externalEffect:true};
  });

  app.get('/v1/collections/receiving-account/payout-preview',async req=>{
    const ctx=await workspaceContext(req,'finance.read');requireConfigured();
    const result=await nextgenFinancialRequest<any>(ctx.workspaceId,'/payouts/preview');
    return{...result,actionsEnabled:payoutActionsEnabled(),externalEffect:false};
  });

  app.post('/v1/collections/receiving-account/payout-policy',async req=>{
    const ctx=await workspaceContext(req,'finance.write');requireConfigured();requirePayoutActions();const input=payoutPolicyInput.parse(req.body||{});
    const result=await nextgenFinancialRequest<any>(ctx.workspaceId,'/payouts/policy',{method:'POST',body:JSON.stringify({policy:input.policy,freeWithdrawThresholdMinor:input.freeWithdrawThresholdMinor,humanApproved:true})});
    await auditLog(ctx,'collections.receiving_account.payout_policy_changed','workspace',ctx.workspaceId,null,{policy:input.policy,freeWithdrawThresholdMinor:result?.freeWithdrawThresholdMinor||input.freeWithdrawThresholdMinor||null,externalEffect:false});
    return{policy:result?.policy||input.policy,freeWithdrawThresholdMinor:Number(result?.freeWithdrawThresholdMinor||input.freeWithdrawThresholdMinor||0),externalEffect:false};
  });

  app.post('/v1/collections/receiving-account/withdraw-now',async req=>{
    const ctx=await workspaceContext(req,'finance.write');requireConfigured();requirePayoutActions();const input=withdrawInput.parse(req.body||{});
    const result=await nextgenFinancialRequest<any>(ctx.workspaceId,'/payouts/withdraw-now',{method:'POST',body:JSON.stringify({valueMinor:input.valueMinor,humanApproved:true})});
    await auditLog(ctx,'collections.receiving_account.withdraw_now','workspace',ctx.workspaceId,null,{pixKeyMasked:result?.withdrawal?.pixKeyMasked||null,valueMinor:result?.withdrawal?.valueMinor||null,externalEffect:true});
    return{withdrawal:result?.withdrawal||null,externalEffect:true};
  });

  // Backward-compatible route kept for existing clients. Uses the payout engine path.
  app.post('/v1/collections/receiving-account/withdraw',async req=>{
    const ctx=await workspaceContext(req,'finance.write');requireConfigured();requirePayoutActions();const input=withdrawInput.parse(req.body||{});
    const result=await nextgenFinancialRequest<any>(ctx.workspaceId,'/payouts/withdraw-now',{method:'POST',body:JSON.stringify({valueMinor:input.valueMinor,humanApproved:true})});
    await auditLog(ctx,'collections.receiving_account.withdraw','workspace',ctx.workspaceId,null,{pixKeyMasked:result?.withdrawal?.pixKeyMasked||null,valueMinor:result?.withdrawal?.valueMinor||null,externalEffect:true});
    return{withdrawal:result?.withdrawal||null,externalEffect:true};
  });
}
