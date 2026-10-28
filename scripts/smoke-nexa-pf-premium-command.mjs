import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {buildPremiumFinancialTruth} from '../apps/web/src/personal-premium-model.ts';

const A={id:'alice',name:'Conta',institution_name:'Banco A',currency:'BRL',
 available_minor:'120045',balance_as_of:'2026-10-28T10:00:00Z',fresh:true,
 manually_reported:false,status:'active'};
const B={...A,id:'bob',institution_name:'Banco B',available_minor:'90000'};
const manual={...A,id:'declared',manually_reported:true,institution_name:'Registrada por mim',available_minor:'50000'};
const studio={
 accounts:[{id:'declared',available_minor:'50000'}],
 goals:[],wealth:[{id:'w1',name:'CDB declarado',kind:'asset',category:'Investimentos',amount_minor:'35000',currency:'BRL'},
 {id:'w2',name:'Financiamento declarado',kind:'liability',category:'Crédito',amount_minor:'11000',currency:'BRL'}],
 bills:[],totals:{manualAvailableMinor:'50000',declaredAssetsMinor:'35000',declaredLiabilitiesMinor:'11000',
  declaredNetWorthMinor:'74000',upcomingBillsMinor:'0',pastDatedBillCount:0},
 provenance:{verifiedBanking:false,note:'Dados do usuário'}
};
test('fresh complete bank balance displayed separately from declared assets and debts',()=>{
 const model=buildPremiumFinancialTruth(
  {connectedAccounts:2,freshAccounts:2,availableMinor:'210045',manualAvailableMinor:'50000',
   lastBalanceAt:'2026-10-28T10:00:00Z',incomplete:false},
  [A,B,manual],studio);
 assert.deepEqual(model.bank,{minor:'210045',source:'fresh_open_finance',label:'Contas em BRL com atualização recente'});
 assert.equal(model.declared.minor,'50000');
 assert.equal(model.assetsMinor,'35000');
 assert.equal(model.debtsMinor,'11000');
 assert.equal(model.partialDeclaredNetWorthMinor,'74000');
 assert.equal(model.cryptoIncluded,false);
 assert.equal(model.externalInvestmentsIncluded,false);
 assert.equal(model.connectedCount,2);
});
test('incomplete or stale bank coverage NEVER shows partial or fabricated balances',()=>{
 const partial=buildPremiumFinancialTruth(
  {connectedAccounts:2,freshAccounts:1,availableMinor:'120045',lastBalanceAt:null,incomplete:true},
  [A,{...B,fresh:false}],null);
 assert.equal(partial.bank.minor,null);
 assert.equal(partial.bank.source,'stale');
 assert.equal(partial.assetsMinor,null);
 assert.equal(partial.debtsMinor,null);
 assert.equal(partial.partialDeclaredNetWorthMinor,null);
 assert.equal(partial.bankVerified,false);
});
test('user-declared values are NOT misrepresented as verified connected banking',()=>{
 const model=buildPremiumFinancialTruth(null,[manual],studio);
 assert.equal(model.bank.minor,null);
 assert.equal(model.missingConnection,true);
 assert.equal(model.declared.source,'user_declared');
 assert.equal(model.declared.minor,'50000');
});
test('a zero investment or debt is not invented when no holdings are registered',()=>{
 const empty=structuredClone(studio);
 empty.accounts=[];empty.wealth=[];empty.totals.declaredAssetsMinor='0';
 empty.totals.declaredLiabilitiesMinor='0';
 const model=buildPremiumFinancialTruth(null,[],empty);
 assert.equal(model.assetsMinor,null);
 assert.equal(model.debtsMinor,null);
 assert.equal(model.partialDeclaredNetWorthMinor,null);
});
test('untrusted numeric values cannot corrupt currency display contracts',()=>{
 const modified=structuredClone(studio);
 modified.totals.declaredLiabilitiesMinor='R$ 14.300,00';
 const result=buildPremiumFinancialTruth(null,[],modified);
 assert.equal(result.debtsMinor,null);
});
test('single-screen UX reuses existing authenticated PF routes and does not activate finance',()=>{
 const ui=readFileSync('apps/web/src/NexaPremiumDashboard.tsx','utf8');
 const parent=readFileSync('apps/web/src/NexPersonal.tsx','utf8');
 const wallet=readFileSync('apps/web/src/NexaCryptoHub.tsx','utf8');
 assert.ok(parent.includes("('overview')"),'PF homepage defaults to premium view');
 assert.ok(parent.includes("section==='overview'&&<NexaPremiumDashboard"),'Dashboard must be mounted');
 for(const route of ['/v1/personal/studio','/v1/personal/providers','/v1/personal/life'])assert.ok(ui.includes(route));
 assert.ok(ui.includes("cache:'no-store'"));
 assert.ok(ui.includes("controller.abort()"),'Session changes must cancel pending requests');
 assert.ok(ui.includes('const WALLET_URL=\'https://trynexa.com.br/portal/\''),'No unverified wallet domain');
 assert.ok(ui.includes('onOpenSection(\'crypto\')'));
 assert.ok(wallet.includes('https://trynexa.com.br/portal/'));
 for(const forbidden of ['ethereum.request(', 'privy.login(', 'window.ethereum', '/v1/personal/payments/initiate']){
  assert.equal(ui.includes(forbidden),false,'Unreviewed wallet/payments connector must not run');
 }
 assert.ok(ui.includes('financeira'), 'Sensible UX copy must not omit financial context');
});
