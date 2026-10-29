// Nex Finance Core — provider-neutral contracts for read-only financial aggregation.
// No payment initiation, token persistence, or provider SDK is activated here.
export type FinanceCurrency='BRL'|'USD'|string;
export type FinancialScope='accounts'|'balances'|'transactions'|'cards'|'credit'|'investments';
export type FinancialAccount={
  externalId:string;
  institutionName:string;
  name:string;
  type:string;
  currency:FinanceCurrency;
  currentMinor:string|null;
  availableMinor:string|null;
  asOf:string|null;
};
export type FinancialTransaction={
  externalId:string;
  accountExternalId:string;
  description:string;
  amountMinor:string;
  currency:FinanceCurrency;
  bookedAt:string;
  category?:string|null;
};
export type FinancialConsentRequest={userRef:string;scopes:FinancialScope[];redirectUrl:string};
export type FinancialConsentRedirect={url:string;expiresAt?:string};

export interface OpenFinanceProvider {
  readonly name:string;
  createConsent(request:FinancialConsentRequest):Promise<FinancialConsentRedirect>;
  refreshConsent(userRef:string,consentRef:string):Promise<void>;
  getAccounts(userRef:string,consentRef:string):Promise<FinancialAccount[]>;
  getTransactions(userRef:string,consentRef:string,accountRef:string):Promise<FinancialTransaction[]>;
  getCards(userRef:string,consentRef:string):Promise<unknown[]>;
  getCreditProducts(userRef:string,consentRef:string):Promise<unknown[]>;
  getInvestments(userRef:string,consentRef:string):Promise<unknown[]>;
}

export type PaymentPreparation={
  amountMinor:string;
  currency:'BRL';
  creditorName:string;
  creditorPixKey:string;
  idempotencyKey:string;
};

export interface PaymentInitiationProvider {
  readonly name:string;
  preparePix(userRef:string,input:PaymentPreparation):Promise<{operationRef:string;confirmationSummary:string}>;
  confirmPix(userRef:string,operationRef:string,approvalRef:string):Promise<{providerRef:string;status:string}>;
}

export class ProviderNotConfiguredError extends Error {
  constructor(provider:string){
    super(provider+' integration not configured. No financial action was attempted.');
    this.name='ProviderNotConfiguredError';
  }
}

export class BelvoProvider implements OpenFinanceProvider {
  readonly name='belvo';
  async createConsent(_request:FinancialConsentRequest):Promise<FinancialConsentRedirect>{throw new ProviderNotConfiguredError(this.name);}
  async refreshConsent(_userRef:string,_consentRef:string):Promise<void>{throw new ProviderNotConfiguredError(this.name);}
  async getAccounts(_userRef:string,_consentRef:string):Promise<FinancialAccount[]>{throw new ProviderNotConfiguredError(this.name);}
  async getTransactions(_userRef:string,_consentRef:string,_accountRef:string):Promise<FinancialTransaction[]>{throw new ProviderNotConfiguredError(this.name);}
  async getCards(_userRef:string,_consentRef:string):Promise<unknown[]>{throw new ProviderNotConfiguredError(this.name);}
  async getCreditProducts(_userRef:string,_consentRef:string):Promise<unknown[]>{throw new ProviderNotConfiguredError(this.name);}
  async getInvestments(_userRef:string,_consentRef:string):Promise<unknown[]>{throw new ProviderNotConfiguredError(this.name);}
}

export class EfiPaymentProvider implements PaymentInitiationProvider {
  readonly name='efi';
  async preparePix(_userRef:string,_input:PaymentPreparation):Promise<{operationRef:string;confirmationSummary:string}>{throw new ProviderNotConfiguredError(this.name);}
  async confirmPix(_userRef:string,_operationRef:string,_approvalRef:string):Promise<{providerRef:string;status:string}>{throw new ProviderNotConfiguredError(this.name);}
}
