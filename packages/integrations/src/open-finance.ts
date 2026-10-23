import type {IntegrationContext,IntegrationResult} from './index.js';

export type OpenFinanceProviderName='belvo'|'mock';
export type OpenFinanceResource=
  |'ACCOUNTS'
  |'OWNERS'
  |'TRANSACTIONS'
  |'BILLS'
  |'INVESTMENTS'
  |'INVESTMENT_TRANSACTIONS'
  |'INCOMES'
  |'RECURRING_EXPENSES'
  |'RISK_INSIGHTS';

export type OpenFinanceConsentPermission='REGISTER'|'ACCOUNTS'|'CREDIT_CARDS'|'CREDIT_OPERATIONS';
export type OpenFinanceIdentificationType='CPF'|'CNPJ';

export interface OpenFinanceIdentification {
  type:OpenFinanceIdentificationType;
  number:string;
  name:string;
}

export interface OpenFinanceCallbackUrls {
  success:string;
  exit:string;
  event:string;
}

export interface OpenFinanceConnectSessionInput {
  identifications:OpenFinanceIdentification[];
  purpose:string;
  termsAndConditionsUrl:string;
  callbackUrls:OpenFinanceCallbackUrls;
  resources?:OpenFinanceResource[];
  consentDurationDays?:92|183|275|366;
  externalId?:string;
  institutionTypes?:Array<'business'|'retail'>;
}

export interface OpenFinanceConnectSession {
  provider:OpenFinanceProviderName;
  environment:'sandbox'|'production';
  accessToken:string;
  refreshToken?:string;
  expiresInSeconds?:number;
  widgetUrl:string;
  requestedResources:OpenFinanceResource[];
}

export interface OpenFinanceConsent {
  id:string;
  provider:OpenFinanceProviderName;
  institutionName?:string|null;
  displayName?:string|null;
  documentNumber?:string|null;
  status?:string|null;
  createdAt?:string|null;
  expiresAt?:string|null;
  raw?:Record<string,unknown>;
}

export interface OpenFinanceAccount {
  id:string;
  provider:OpenFinanceProviderName;
  linkId?:string|null;
  institutionName?:string|null;
  type?:string|null;
  subtype?:string|null;
  name?:string|null;
  currency?:string|null;
  currentBalanceMinor?:number|null;
  availableBalanceMinor?:number|null;
  creditLimitMinor?:number|null;
  raw?:Record<string,unknown>;
}

export interface OpenFinanceBalance {
  id:string;
  accountId:string;
  provider:OpenFinanceProviderName;
  currency:string;
  currentMinor?:number|null;
  availableMinor?:number|null;
  blockedMinor?:number|null;
  automaticallyInvestedMinor?:number|null;
  collectedAt?:string|null;
  raw?:Record<string,unknown>;
}

export interface OpenFinanceTransaction {
  id:string;
  accountId?:string|null;
  provider:OpenFinanceProviderName;
  occurredAt:string;
  amountMinor:number;
  currency:string;
  direction:'income'|'expense'|'unknown';
  description:string;
  counterparty?:string|null;
  category?:string|null;
  pending?:boolean|null;
  raw?:Record<string,unknown>;
}

export interface OpenFinanceInvestment {
  id:string;
  provider:OpenFinanceProviderName;
  institutionName?:string|null;
  productType?:string|null;
  name?:string|null;
  currency?:string|null;
  currentValueMinor?:number|null;
  investedValueMinor?:number|null;
  maturityAt?:string|null;
  liquidity?:string|null;
  raw?:Record<string,unknown>;
}

export interface OpenFinanceInsight {
  kind:'income'|'recurring_expense'|'risk';
  provider:OpenFinanceProviderName;
  payload:Record<string,unknown>;
}

export interface OpenFinanceCapabilities {
  provider:OpenFinanceProviderName;
  environment:'sandbox'|'production';
  configured:boolean;
  resources:OpenFinanceResource[];
  connectWidget:boolean;
  externalMoneyMovement:false;
}

export interface OpenFinanceAdapter {
  capabilities():OpenFinanceCapabilities;
  createConnectSession(ctx:IntegrationContext,input:OpenFinanceConnectSessionInput):Promise<IntegrationResult<OpenFinanceConnectSession>>;
  listConsents?(ctx:IntegrationContext,input:{linkId?:string}):Promise<IntegrationResult<OpenFinanceConsent[]>>;
  listAccounts?(ctx:IntegrationContext,input:{linkId?:string}):Promise<IntegrationResult<OpenFinanceAccount[]>>;
  listBalances?(ctx:IntegrationContext,input:{linkId?:string;accountId?:string}):Promise<IntegrationResult<OpenFinanceBalance[]>>;
  listTransactions?(ctx:IntegrationContext,input:{linkId?:string;accountId?:string;dateFrom?:string;dateTo?:string}):Promise<IntegrationResult<OpenFinanceTransaction[]>>;
  listInvestments?(ctx:IntegrationContext,input:{linkId?:string}):Promise<IntegrationResult<OpenFinanceInvestment[]>>;
  listInsights?(ctx:IntegrationContext,input:{linkId?:string;kinds?:Array<OpenFinanceInsight['kind']>}):Promise<IntegrationResult<OpenFinanceInsight[]>>;
}
