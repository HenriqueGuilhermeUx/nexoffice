import {query} from './db.js';

export type ProviderCapability={
  key:string;
  label:string;
  evidence:'workspace'|'service'|'operation'|'delegation'|'outcome';
};

export type ProviderEligibility={
  workspaceActive:boolean;
  profilePublished:boolean;
  activeService:boolean;
  networkReady:boolean;
};

export type ProviderCapabilityEvidence={
  workspaceId:string;
  eligibility:ProviderEligibility;
  capabilities:ProviderCapability[];
  methodology:{ranking:false;score:false;certification:false;observedEvidenceOnly:true};
};

const methodology={ranking:false,score:false,certification:false,observedEvidenceOnly:true} as const;

function capabilityRow(row:any):ProviderCapabilityEvidence{
  const workspaceActive=row?.workspace_status==='active';
  const profilePublished=row?.profile_status==='published';
  const activeService=Boolean(row?.has_active_service);
  const capabilities:ProviderCapability[]=[];
  if(workspaceActive&&profilePublished)capabilities.push({key:'network_profile',label:'Perfil ativo na Rede',evidence:'workspace'});
  if(activeService)capabilities.push({key:'service_delivery',label:'Serviços publicados',evidence:'service'});
  if(row?.has_document_flow)capabilities.push({key:'document_flow',label:'Fluxo documental operado',evidence:'operation'});
  if(row?.has_fiscal_flow)capabilities.push({key:'fiscal_flow',label:'Fluxo fiscal operado',evidence:'operation'});
  if(row?.has_collection_flow)capabilities.push({key:'collection_flow',label:'Cobrança operacional utilizada',evidence:'operation'});
  if(row?.has_communication_flow)capabilities.push({key:'communication_flow',label:'Comunicação operacional utilizada',evidence:'operation'});
  if(row?.has_delegated_context)capabilities.push({key:'delegated_context',label:'Contexto delegado utilizado',evidence:'delegation'});
  if(row?.has_outcome)capabilities.push({key:'outcome_evidence',label:'Outcome registrado por cliente',evidence:'outcome'});
  return {workspaceId:String(row.workspace_id),eligibility:{workspaceActive,profilePublished,activeService,networkReady:workspaceActive&&profilePublished&&activeService},capabilities,methodology};
}

export async function providerCapabilityEvidence(workspaceIds:string[]):Promise<Map<string,ProviderCapabilityEvidence>>{
  const ids=[...new Set(workspaceIds.filter(Boolean))];
  if(!ids.length)return new Map();
  const rows=await query<any>(`select ids.workspace_id,w.status workspace_status,p.status profile_status,
    exists(select 1 from provider_services s where s.provider_workspace_id=ids.workspace_id and s.active=true) has_active_service,
    exists(select 1 from business_operations o where o.workspace_id=ids.workspace_id and o.document_ref_id is not null) has_document_flow,
    exists(select 1 from business_operations o where o.workspace_id=ids.workspace_id and (o.invoice_action_id is not null or o.fiscal_status is not null)) has_fiscal_flow,
    exists(select 1 from business_operations o where o.workspace_id=ids.workspace_id and o.ledger_entry_id is not null) has_collection_flow,
    exists(select 1 from business_operations o where o.workspace_id=ids.workspace_id and o.communication_action_id is not null) has_communication_flow,
    exists(select 1 from provider_delegations d where d.provider_workspace_id=ids.workspace_id) has_delegated_context,
    exists(select 1 from provider_requests r join provider_outcomes po on po.request_id=r.id where r.provider_workspace_id=ids.workspace_id) has_outcome
    from unnest($1::uuid[]) ids(workspace_id)
    left join workspaces w on w.id=ids.workspace_id
    left join provider_profiles p on p.workspace_id=ids.workspace_id`,[ids]);
  return new Map(rows.map(row=>{const value=capabilityRow(row);return [value.workspaceId,value]}));
}

export async function providerCapabilityEvidenceOne(workspaceId:string){
  const map=await providerCapabilityEvidence([workspaceId]);
  return map.get(workspaceId)||{workspaceId,eligibility:{workspaceActive:false,profilePublished:false,activeService:false,networkReady:false},capabilities:[],methodology};
}
