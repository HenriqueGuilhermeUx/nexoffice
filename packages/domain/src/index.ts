export type UUID = string;
export type ISODate = string;

export type BusinessVertical = 'general' | 'legal' | 'health' | 'condo' | 'commerce';
export type WorkspacePlan = 'starter' | 'pro' | 'business' | 'enterprise';
export type WorkspaceStatus = 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled';
export type AutonomyMode = 'automatic' | 'notify' | 'approval_required';
export type CommandActionStatus = 'open' | 'approved' | 'rejected' | 'executing' | 'done' | 'failed' | 'dismissed';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'cancelled';
export type DealStage = 'lead' | 'qualified' | 'meeting' | 'proposal' | 'won' | 'lost';
export type TaskStatus = 'todo' | 'doing' | 'done' | 'cancelled';
export type LedgerDirection = 'income' | 'expense';
export type LedgerStatus = 'planned' | 'open' | 'paid' | 'cancelled' | 'overdue';
export type AgentRole = 'secretary' | 'service' | 'crm' | 'erp' | 'collections' | 'controller' | 'documents' | 'growth';

export interface Workspace {
  id: UUID;
  name: string;
  slug: string;
  vertical: BusinessVertical;
  plan: WorkspacePlan;
  status: WorkspaceStatus;
  timezone: string;
  currency: string;
  modules: string[];
  settings: Record<string, unknown>;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface WorkspaceMember {
  id: UUID;
  workspaceId: UUID;
  userId: UUID;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  permissions: string[];
  active: boolean;
}

export interface CrmContact {
  id: UUID;
  workspaceId: UUID;
  kind: 'person' | 'company';
  name: string;
  email?: string | null;
  phone?: string | null;
  companyName?: string | null;
  documentNumber?: string | null;
  source?: string | null;
  tags: string[];
  customFields: Record<string, unknown>;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface CrmDeal {
  id: UUID;
  workspaceId: UUID;
  contactId?: UUID | null;
  title: string;
  stage: DealStage;
  valueMinor: number;
  currency: string;
  ownerId?: UUID | null;
  source?: string | null;
  nextAction?: string | null;
  expectedCloseAt?: ISODate | null;
  metadata: Record<string, unknown>;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface CrmActivity {
  id: UUID;
  workspaceId: UUID;
  contactId?: UUID | null;
  dealId?: UUID | null;
  type: 'note' | 'call' | 'email' | 'whatsapp' | 'sms' | 'meeting' | 'task' | 'system';
  direction?: 'inbound' | 'outbound' | null;
  subject?: string | null;
  body?: string | null;
  occurredAt: ISODate;
  metadata: Record<string, unknown>;
}

export interface LedgerEntry {
  id: UUID;
  workspaceId: UUID;
  contactId?: UUID | null;
  direction: LedgerDirection;
  category: string;
  description: string;
  amountMinor: number;
  currency: string;
  status: LedgerStatus;
  dueAt?: ISODate | null;
  paidAt?: ISODate | null;
  recurrenceKey?: string | null;
  externalRef?: string | null;
  metadata: Record<string, unknown>;
  createdAt: ISODate;
}

export interface BusinessEvent<T = Record<string, unknown>> {
  id: UUID;
  workspaceId: UUID;
  type: string;
  source: string;
  subjectType?: string | null;
  subjectId?: UUID | null;
  occurredAt: ISODate;
  payload: T;
  correlationId?: string | null;
  causationId?: string | null;
}

export interface ApprovalRequest {
  id: UUID;
  workspaceId: UUID;
  actionType: string;
  title: string;
  description?: string | null;
  status: ApprovalStatus;
  requestedByAgent?: AgentRole | null;
  subjectType?: string | null;
  subjectId?: UUID | null;
  proposedPayload: Record<string, unknown>;
  decidedBy?: UUID | null;
  decidedAt?: ISODate | null;
  expiresAt?: ISODate | null;
  createdAt: ISODate;
}

export interface CommandAction {
  id: UUID;
  workspaceId: UUID;
  agentRole: AgentRole;
  title: string;
  summary: string;
  priority: 'low' | 'normal' | 'high' | 'critical';
  status: CommandActionStatus;
  autonomy: AutonomyMode;
  eventId?: UUID | null;
  approvalId?: UUID | null;
  subjectType?: string | null;
  subjectId?: UUID | null;
  primaryAction?: Record<string, unknown> | null;
  secondaryActions: Record<string, unknown>[];
  metadata: Record<string, unknown>;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface UsageEvent {
  id?: UUID;
  workspaceId: UUID;
  capability: string;
  operation: string;
  units: number;
  unitName: string;
  provider?: string | null;
  costMinorEstimate?: number | null;
  currency?: string;
  metadata?: Record<string, unknown>;
  occurredAt?: ISODate;
}

export interface AutonomyPolicy {
  workspaceId: UUID;
  actionType: string;
  mode: AutonomyMode;
  maxAmountMinor?: number | null;
  allowedChannels?: string[];
  conditions?: Record<string, unknown>;
}

const HIGH_RISK_PREFIXES = ['payment.refund', 'payment.discount', 'campaign.budget.', 'contract.cancel', 'document.sign_on_behalf', 'legal.', 'clinical.'];

export function defaultAutonomyFor(actionType: string): AutonomyMode {
  if (HIGH_RISK_PREFIXES.some(prefix => actionType.startsWith(prefix))) return 'approval_required';
  if (actionType.startsWith('message.send') || actionType.startsWith('appointment.confirm') || actionType.startsWith('reminder.')) return 'notify';
  return 'approval_required';
}

export function resolveAutonomy(actionType: string, policies: AutonomyPolicy[] = []): AutonomyMode {
  const exact = policies.find(policy => policy.actionType === actionType);
  if (exact) return exact.mode;
  const wildcard = policies
    .filter(policy => policy.actionType.endsWith('*') && actionType.startsWith(policy.actionType.slice(0, -1)))
    .sort((a, b) => b.actionType.length - a.actionType.length)[0];
  return wildcard?.mode ?? defaultAutonomyFor(actionType);
}

export function agentForEvent(eventType: string): AgentRole {
  if (eventType.startsWith('appointment.') || eventType.startsWith('calendar.')) return 'secretary';
  if (eventType.startsWith('lead.') || eventType.startsWith('deal.') || eventType.startsWith('crm.')) return 'crm';
  if (eventType.startsWith('conversation.') || eventType.startsWith('message.')) return 'service';
  if (eventType.startsWith('payment.overdue') || eventType.startsWith('collection.')) return 'collections';
  if (eventType.startsWith('payment.') || eventType.startsWith('ledger.') || eventType.startsWith('invoice.')) return 'erp';
  if (eventType.startsWith('document.')) return 'documents';
  if (eventType.startsWith('campaign.') || eventType.startsWith('growth.')) return 'growth';
  return 'controller';
}

export function moneyFromMinor(valueMinor: number, currency = 'BRL'): string {
  return new Intl.NumberFormat('pt-BR', {style: 'currency', currency}).format(valueMinor / 100);
}

export const NEXOFFICE_MODULES = [
  'crm', 'agenda', 'tasks', 'erp', 'collections', 'documents', 'service', 'command-center', 'agents', 'growth', 'usage'
] as const;
