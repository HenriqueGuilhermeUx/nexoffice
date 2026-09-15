import type {BusinessEvent, UsageEvent, UUID} from '@nexoffice/domain';

export interface IntegrationContext {
  workspaceId: UUID;
  actorUserId?: UUID | null;
  correlationId?: string | null;
}

export interface IntegrationResult<T = unknown> {
  ok: boolean;
  data?: T;
  externalRef?: string;
  usage?: Omit<UsageEvent, 'workspaceId'>[];
  error?: string;
}

export interface DocWalletAdapter {
  createEnvelope(ctx: IntegrationContext, input: {title: string; fileRef: string; signers: Array<{name: string; email?: string; phone?: string}>}): Promise<IntegrationResult<{envelopeId: string}>>;
  requestApproval(ctx: IntegrationContext, input: {documentRef: string; approvers: string[]}): Promise<IntegrationResult>;
  extractDocument(ctx: IntegrationContext, input: {fileRef: string; schema?: Record<string, unknown>}): Promise<IntegrationResult<{text?: string; fields?: Record<string, unknown>}>>;
  getDocumentStatus(ctx: IntegrationContext, externalRef: string): Promise<IntegrationResult<{status: string}>>;
}

export interface SmartBotsAdapter {
  sendMessage(ctx: IntegrationContext, input: {contactRef: string; channel: 'whatsapp' | 'email' | 'sms'; message: string; template?: string}): Promise<IntegrationResult>;
  suggestReply(ctx: IntegrationContext, input: {conversationRef: string; incomingMessage: string}): Promise<IntegrationResult<{message: string}>>;
  qualifyLead(ctx: IntegrationContext, input: {contactRef: string; answers: Record<string, unknown>}): Promise<IntegrationResult<{score: number; tags: string[]}>>;
  startFollowUp(ctx: IntegrationContext, input: {contactRef: string; cadence: string}): Promise<IntegrationResult>;
}

export interface StaffAdapter {
  understandCommand(ctx: IntegrationContext, input: {text?: string; audioRef?: string}): Promise<IntegrationResult<{intent: string; entities: Record<string, unknown>; confidence: number}>>;
  schedule(ctx: IntegrationContext, input: {title: string; startsAt: string; endsAt?: string; participants?: string[]}): Promise<IntegrationResult<{appointmentRef: string}>>;
  transcribe(ctx: IntegrationContext, input: {audioRef: string}): Promise<IntegrationResult<{text: string}>>;
  remember(ctx: IntegrationContext, input: {scope: string; key: string; value: unknown}): Promise<IntegrationResult>;
}

export interface NextGenAdapter {
  createCharge(ctx: IntegrationContext, input: {contactRef?: string; amountMinor: number; currency: string; dueAt?: string; description: string; method?: 'pix' | 'boleto' | 'link'}): Promise<IntegrationResult<{chargeRef: string; paymentUrl?: string; pixCopyPaste?: string}>>;
  getCharge(ctx: IntegrationContext, chargeRef: string): Promise<IntegrationResult<{status: string; paidAt?: string}>>;
  reconcile(ctx: IntegrationContext, input: {externalRef: string; amountMinor: number}): Promise<IntegrationResult>;
}

export interface ModoAdapter {
  createCampaignBrief(ctx: IntegrationContext, input: {objective: string; audience?: string; budgetMinor?: number; signals?: Record<string, unknown>}): Promise<IntegrationResult<{briefRef: string; suggestions: string[]}>>;
  publishCampaign(ctx: IntegrationContext, input: {briefRef: string; channels: string[]; approvedBudgetMinor: number}): Promise<IntegrationResult<{campaignRef: string}>>;
  getPerformance(ctx: IntegrationContext, campaignRef: string): Promise<IntegrationResult<Record<string, number>>>;
  createContent(ctx: IntegrationContext, input: {objective: string; channel: string; context?: Record<string, unknown>}): Promise<IntegrationResult<{content: string}>>;
}

export interface TaxAgentAdapter {
  issueServiceInvoice(ctx: IntegrationContext, input: {customerRef: string; amountMinor: number; description: string; serviceCode?: string}): Promise<IntegrationResult<{invoiceRef: string; status: string}>>;
  getInvoice(ctx: IntegrationContext, invoiceRef: string): Promise<IntegrationResult<{status: string; number?: string; pdfRef?: string}>>;
}

export interface IntegrationHub {
  docwallet?: DocWalletAdapter;
  smartbots?: SmartBotsAdapter;
  staff?: StaffAdapter;
  nextgen?: NextGenAdapter;
  modo?: ModoAdapter;
  taxagent?: TaxAgentAdapter;
}

export type NexOfficeWebhookHandler = (event: BusinessEvent) => Promise<void>;

export class HttpCapabilityClient {
  constructor(private readonly baseUrl: string, private readonly apiKey?: string) {}

  async post<T>(path: string, body: unknown): Promise<IntegrationResult<T>> {
    try {
      const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`, {
        method: 'POST',
        headers: {'content-type': 'application/json', ...(this.apiKey ? {'authorization': `Bearer ${this.apiKey}`} : {})},
        body: JSON.stringify(body)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return {ok: false, error: String((payload as any)?.error || response.statusText)};
      return {ok: true, data: payload as T};
    } catch (error) {
      return {ok: false, error: error instanceof Error ? error.message : String(error)};
    }
  }
}

// Server-side only. Never instantiate this client in browser bundles because it carries
// the shared AV platform credential used to provision and exchange NexOffice sessions.
export type AVSourceProduct='nexjud'|'sindcopilot'|'mydatamed'|'health-wallet'|'smartbots'|'modo'|'docwallet'|'nextgen'|'taxagent'|'connexio'|'mindcompliance'|'mindsteps'|'f-insight'|'ecotracker'|'nexa'|'staff';
export type NexOfficeVertical='general'|'legal'|'health'|'condo'|'commerce';
export type NexOfficeMemberRole='owner'|'admin'|'member'|'viewer';
export type OperationalWindow='hour'|'day'|'week'|'month';
export type OperationalScope='workspace'|'team'|'member';

export interface ProvisionWorkspaceInput {
  sourceProduct:AVSourceProduct;
  externalWorkspaceRef:string;
  businessName:string;
  vertical?:NexOfficeVertical;
  ownerEmail:string;
  ownerName?:string;
  memberRole?:NexOfficeMemberRole;
  externalUserSubject?:string;
  entitlements?:string[];
}

export interface ProvisionWorkspaceResult {
  created:boolean;
  userExists:boolean;
  userExisted?:boolean;
  federatedUserCreated?:boolean;
  memberRole?:NexOfficeMemberRole;
  inviteToken?:string|null;
  inviteUrl?:string|null;
  workspace:{id:string;name:string;slug:string;vertical:NexOfficeVertical;status:string;modules:string[];settings?:Record<string,unknown>};
  origin:{workspace_id:string;source_product:string;external_workspace_ref:string;mode:string};
}

export interface SessionExchangeInput {
  sourceProduct:AVSourceProduct;
  externalWorkspaceRef:string;
  externalUserSubject:string;
  email:string;
}

export interface SessionExchangeResult {
  token:string;
  expiresAt:string;
  workspace:{id:string;name:string;slug:string;vertical:NexOfficeVertical;status:string;role:NexOfficeMemberRole;permissions:string[]};
}

export interface BrowserHandoffResult {
  handoffCode:string;
  expiresAt:string;
  url:string|null;
}

interface OperationalSignalBase {
  externalWorkspaceRef:string;
  correlationId?:string;
  periodStart:string;
  periodEnd:string;
  dimensions:{window:OperationalWindow;scope:OperationalScope};
}

export type LegalOperationalSignalInput=OperationalSignalBase&(
  |{signalType:'matters.summary';metrics:{active:number;opened:number;closed:number;attentionRequired:number}}
  |{signalType:'deadlines.summary';metrics:{dueToday:number;due7Days:number;overdue:number;completed:number}}
  |{signalType:'activity.summary';metrics:{strategicAnalyses:number;drafts:number;judgeSessions:number;agentRuns:number}}
  |{signalType:'monitoring.summary';metrics:{monitoredCases:number;newMovements:number;unreviewedMovements:number;alerts:number}}
  |{signalType:'workload.summary';metrics:{activeMatters:number;dueToday:number;waitingReview:number;backlog:number}}
);

export type HealthOperationalSignalInput=OperationalSignalBase&{
  sourceProduct:'mydatamed'|'health-wallet';
}&(
  |{signalType:'appointments.summary';metrics:{scheduled:number;completed:number;cancelled:number;noShow:number;pending:number}}
  |{signalType:'requests.summary';metrics:{open:number;overdue:number;escalated:number;resolved:number}}
  |{signalType:'sla.summary';metrics:{total:number;withinSla:number;breached:number;avgFirstResponseMinutes:number;complianceRatio:number}}
  |{signalType:'workload.summary';metrics:{activeCases:number;waitingReview:number;waitingPatientReply:number;dueToday:number}}
  |{signalType:'programs.summary';metrics:{enrolled:number;active:number;completed:number;paused:number}}
);

export interface OperationalSignalResult {
  ok:true;
  privacy:'aggregate_only';
  signal:{id:string;workspace_id:string;source_product:string;signal_type:string;period_start:string;period_end:string;metrics:Record<string,number>;dimensions:Record<string,string>;created_at:string};
}

export class NexOfficePlatformBridgeClient {
  private readonly baseUrl:string;
  constructor(baseUrl:string,private readonly internalKey:string,private readonly timeoutMs=10000){
    this.baseUrl=baseUrl.replace(/\/$/,'');
    if(!this.baseUrl)throw new Error('NexOffice base URL is required');
    if(!this.internalKey)throw new Error('NexOffice internal key is required');
  }

  async health(){return this.request<{status:string;service:string;capabilities:string[];externalEffects:boolean}>('/v1/platform/health','GET')}
  async provision(input:ProvisionWorkspaceInput){return this.request<ProvisionWorkspaceResult>('/v1/platform/provision','POST',input)}
  async exchangeSession(input:SessionExchangeInput){return this.request<SessionExchangeResult>('/v1/platform/session-exchange','POST',input)}
  async createBrowserHandoff(input:SessionExchangeInput){return this.request<BrowserHandoffResult>('/v1/platform/handoff','POST',input)}
  async pushLegalSignal(input:LegalOperationalSignalInput){return this.request<OperationalSignalResult>('/v1/platform/legal-signals','POST',{...input,sourceProduct:'nexjud'})}
  async pushHealthSignal(input:HealthOperationalSignalInput){return this.request<OperationalSignalResult>('/v1/platform/health-signals','POST',input)}

  private async request<T>(path:string,method:'GET'|'POST',body?:unknown):Promise<T>{
    const response=await fetch(`${this.baseUrl}${path}`,{
      method,
      headers:{accept:'application/json','x-nexoffice-key':this.internalKey,...(body===undefined?{}:{'content-type':'application/json'})},
      body:body===undefined?undefined:JSON.stringify(body),
      signal:AbortSignal.timeout(this.timeoutMs)
    });
    const text=await response.text();
    const payload=(()=>{try{return JSON.parse(text)}catch{return {message:text.slice(0,2000)}}})();
    if(!response.ok){
      const error=new Error(String((payload as any)?.message||(payload as any)?.error||`NexOffice platform HTTP ${response.status}`));
      (error as any).status=response.status;(error as any).code=(payload as any)?.error;(error as any).payload=payload;throw error;
    }
    return payload as T;
  }
}