import type {BusinessGraphEdge,BusinessGraphNode,ISODate,UUID} from './index.js';

export type BusinessSourceKind=
  |'nexoffice'
  |'open_finance'
  |'erp'
  |'crm'
  |'email'
  |'calendar'
  |'documents'
  |'spreadsheet'
  |'messaging'
  |'commerce'
  |'custom';

export type BusinessSourceCapability=
  |'entities'
  |'events'
  |'documents'
  |'financial_accounts'
  |'transactions'
  |'relationships'
  |'actions';

export interface BusinessSourceDescriptor {
  id:string;
  workspaceId:UUID;
  provider:string;
  kind:BusinessSourceKind;
  label:string;
  status:'connected'|'disconnected'|'degraded'|'pending';
  capabilities:BusinessSourceCapability[];
  lastSyncedAt?:ISODate|null;
  metadata:Record<string,unknown>;
}

export interface BusinessConnectorSyncCursor {
  value?:string|null;
  updatedAt?:ISODate|null;
}

export interface BusinessConnectorSyncInput {
  workspaceId:UUID;
  cursor?:BusinessConnectorSyncCursor|null;
  since?:ISODate|null;
  until?:ISODate|null;
  limit?:number;
}

export interface BusinessConnectorBatch {
  source:BusinessSourceDescriptor;
  nodes:BusinessGraphNode[];
  edges:BusinessGraphEdge[];
  cursor?:BusinessConnectorSyncCursor|null;
  hasMore:boolean;
  observedAt:ISODate;
  warnings:string[];
}

export interface BusinessConnector {
  descriptor(workspaceId:UUID):Promise<BusinessSourceDescriptor>;
  sync(input:BusinessConnectorSyncInput):Promise<BusinessConnectorBatch>;
}

export interface BusinessConnectorRegistryEntry {
  provider:string;
  kind:BusinessSourceKind;
  label:string;
  capabilities:BusinessSourceCapability[];
  available:boolean;
  notes?:string|null;
}
