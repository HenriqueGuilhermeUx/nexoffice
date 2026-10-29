/**
 * Nexa PF premium one-screen financial truth model.
 * Read-only local derivation from authenticated PF API, never Wallet/PJ.
 * It deliberately refuses to present declared balances as verified banking,
 * and never adds Wallet/other-institution assets to amounts not connected.
 */
export type PersonalBalance={
 id:string;institution_name:string;name:string;currency:string;
 available_minor:string|null;balance_as_of:string|null;
 fresh:boolean;manually_reported:boolean;status:string
};
export type PersonalOverview={
 connectedAccounts:number;freshAccounts:number;
 availableMinor:string|null;manualAvailableMinor?:string|null;
 lastBalanceAt:string|null;incomplete:boolean
};
export type PersonalStudioSummary={
 accounts:Array<{id:string;available_minor:string|null}>;
 goals:Array<{id:string;name:string;target_minor:string;saved_minor:string;due_on:string|null;status:string}>;
 wealth:Array<{id:string;name:string;kind:'asset'|'liability';category:string;amount_minor:string;currency?:string}>;
 bills:Array<{id:string;name:string;amount_minor:string;next_due_on:string;interval_months:number}>;
 totals:{
  manualAvailableMinor:string;declaredAssetsMinor:string;
  declaredLiabilitiesMinor:string;declaredNetWorthMinor:string;
  upcomingBillsMinor:string;pastDatedBillCount:number
 };
 provenance:{verifiedBanking:boolean;note:string}
};
export type FinancialSource='fresh_open_finance'|'user_declared'|'pending_connection'|'stale';
export type FinancialReading={minor:string|null;source:FinancialSource;label:string};
export function validMinor(raw:unknown):string|null{
 return typeof raw==='string'&&/^-?\d{1,20}$/.test(raw)?raw:null;
}
export function buildPremiumFinancialTruth(
 overview:PersonalOverview|null,
 accounts:PersonalBalance[],
 studio:PersonalStudioSummary|null
){
 const connected=accounts.filter(a=>!a.manually_reported);
 const currentBRL=connected.filter(a=>a.currency==='BRL'&&a.fresh&&a.status==='active'
  &&validMinor(a.available_minor)!==null);
 // The authenticated API only returns an aggregate for COMPLETE fresh BRL
 // snapshots. Never partially sum records or represent missing data as zero.
 const complete=overview!==null&&overview.connectedAccounts>0
  &&overview.connectedAccounts===overview.freshAccounts
  &&overview.incomplete===false
  &&validMinor(overview.availableMinor)!==null
  &&currentBRL.length===overview.connectedAccounts;
 const bank:FinancialReading=complete
  ?{minor:validMinor(overview!.availableMinor),source:'fresh_open_finance',label:'Contas em BRL com atualização recente'}
  :{minor:null,source:connected.length>0?'stale':'pending_connection',
    label:connected.length>0?'Atualização ou cobertura incompleta':'Nenhum banco conectado'};
 const declared=studio&&studio.accounts.length>0
  ?{minor:validMinor(studio.totals.manualAvailableMinor),source:'user_declared' as const,
    label:'Valores informados por você'}
  :{minor:null,source:'user_declared' as const,label:'Nenhum valor declarado'};
 const assets=studio&&studio.wealth.some(w=>w.kind==='asset'&&(!w.currency||w.currency==='BRL'))
  ?validMinor(studio.totals.declaredAssetsMinor):null;
 const debts=studio&&studio.wealth.some(w=>w.kind==='liability'&&(!w.currency||w.currency==='BRL'))
  ?validMinor(studio.totals.declaredLiabilitiesMinor):null;
 const netWorth=studio&&(studio.accounts.length>0||studio.wealth.length>0)
  ?validMinor(studio.totals.declaredNetWorthMinor):null;
 return {
  bank,declared,assetsMinor:assets,debtsMinor:debts,
  partialDeclaredNetWorthMinor:netWorth,
  connectedCount:connected.length,manualCount:accounts.filter(a=>a.manually_reported).length,
  missingConnection:connected.length===0,
  cryptoIncluded:false as const,externalInvestmentsIncluded:false as const,
  bankVerified:bank.source==='fresh_open_finance',
  note:'Patrimônio declarado é parcial e não inclui saldos da Wallet, instituições não conectadas, ou investimentos de terceiros não declarados.'
 };
}
