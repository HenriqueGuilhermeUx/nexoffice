import type {ISODate,UUID} from './index.js';

export type BusinessGraphNodeKind=
  |'organization'
  |'person'
  |'external_organization'
  |'product_service'
  |'financial_account'
  |'deal'
  |'financial_entry'
  |'task'
  |'appointment'
  |'document'
  |'event'
  |'goal';

export type BusinessGraphEdgeKind=
  |'contains'
  |'customer_of'
  |'supplier_of'
  |'has_deal'
  |'related_to'
  |'assigned_to'
  |'scheduled_with'
  |'document_for'
  |'financial_activity'
  |'generated'
  |'supports'
  |'affects';

export interface BusinessGraphNode {
  id:string;
  sourceId?:UUID|string|null;
  kind:BusinessGraphNodeKind;
  label:string;
  source:string;
  status?:string|null;
  occurredAt?:ISODate|null;
  attributes:Record<string,unknown>;
}

export interface BusinessGraphEdge {
  id:string;
  from:string;
  to:string;
  kind:BusinessGraphEdgeKind;
  source:string;
  attributes:Record<string,unknown>;
}

export interface BusinessGraphCoverage {
  nodes:number;
  edges:number;
  byKind:Partial<Record<BusinessGraphNodeKind,number>>;
  sources:string[];
  windowDays:number;
  generatedAt:ISODate;
}

export interface BusinessGraphSnapshot {
  workspaceId:UUID;
  workspaceName:string;
  nodes:BusinessGraphNode[];
  edges:BusinessGraphEdge[];
  coverage:BusinessGraphCoverage;
  executiveSignals:Array<{
    code:string;
    level:'info'|'attention'|'critical';
    title:string;
    detail:string;
    evidence:Record<string,unknown>;
  }>;
  safety:{
    readOnly:true;
    externalEffects:false;
    derivedFromWorkspaceData:true;
  };
}
