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
