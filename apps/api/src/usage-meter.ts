import {query} from './db.js';

type Descriptor={capability:string;operation:string;provider:string;costEnv:string};

const TOPICS:Record<string,Descriptor>={
  'docwallet.document.action':{capability:'documents',operation:'document_action',provider:'docwallet',costEnv:'DOCWALLET_OPERATION_COST_MINOR'},
  'smartbots.message.send':{capability:'communication',operation:'message_send',provider:'smartbots',costEnv:'SMARTBOTS_MESSAGE_COST_MINOR'},
  'nextgen.charge.create':{capability:'payments',operation:'charge_create',provider:'nextgen',costEnv:'NEXTGEN_CHARGE_COST_MINOR'},
  'staff.assistant.action':{capability:'assistant',operation:'assistant_action',provider:'staff',costEnv:'STAFF_OPERATION_COST_MINOR'},
  'modo.growth.action':{capability:'growth',operation:'growth_action',provider:'modo',costEnv:'MODO_OPERATION_COST_MINOR'},
  'taxagent.invoice.issue':{capability:'tax',operation:'invoice_issue',provider:'taxagent',costEnv:'TAXAGENT_OPERATION_COST_MINOR'}
};

export async function recordExternalUsage(workspaceId:string,topic:string,payload:any,result:any){
  const descriptor=TOPICS[topic];if(!descriptor)return null;
  const configured=Number(process.env[descriptor.costEnv]);const cost=Number.isFinite(configured)&&configured>=0?Math.round(configured):null;
  const operation=topic==='docwallet.document.action'&&payload?.actionType?String(payload.actionType).replace(/^document\./,'document_'):descriptor.operation;
  const rows=await query<any>(`insert into usage_events(workspace_id,capability,operation,units,unit_name,provider,cost_minor_estimate,currency,metadata) values($1,$2,$3,1,'operation',$4,$5,'BRL',$6) returning *`,[workspaceId,descriptor.capability,operation,descriptor.provider,cost,JSON.stringify({topic,commandActionId:payload?.commandActionId||null,httpStatus:result?.httpStatus||null})]);
  return rows[0]||null;
}

export function meteringCatalog(){return Object.entries(TOPICS).map(([topic,d])=>({topic,...d,costMinorEstimate:readCost(d.costEnv)}))}
function readCost(env:string){const n=Number(process.env[env]);return Number.isFinite(n)&&n>=0?Math.round(n):null}
