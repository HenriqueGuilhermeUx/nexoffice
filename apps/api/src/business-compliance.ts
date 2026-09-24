import {query} from './db.js';

const n=(value:unknown)=>Math.max(0,Number(value||0));
const text=(value:unknown)=>String(value||'').trim();

export type ComplianceOperationalSnapshot={
  connected:boolean;
  sourceProduct:string|null;
  diagnosticStatus:string|null;
  programStatus:string|null;
  openActions:number;
  overdueActions:number;
  nextDueAt:string|null;
  completionPct:number|null;
  categories:string[];
  deepLink:string|null;
  observedAt:string|null;
  dueWithin7Days:boolean;
  privacy:'aggregate_only';
};

export async function getComplianceOperationalSnapshot(workspaceId:string):Promise<ComplianceOperationalSnapshot>{
  const row=(await query<any>(`select settings->'compliance'->'summary' summary from workspaces where id=$1`,[workspaceId]))[0];
  const raw=row?.summary&&typeof row.summary==='object'&&!Array.isArray(row.summary)?row.summary:null;
  if(!raw)return{connected:false,sourceProduct:null,diagnosticStatus:null,programStatus:null,openActions:0,overdueActions:0,nextDueAt:null,completionPct:null,categories:[],deepLink:null,observedAt:null,dueWithin7Days:false,privacy:'aggregate_only'};
  const nextDueAt=text(raw.nextDueAt)||null,nextMs=nextDueAt?Date.parse(nextDueAt):NaN,dueWithin7Days=Number.isFinite(nextMs)&&nextMs>=Date.now()&&nextMs<=Date.now()+7*86400000;
  const pct=raw.completionPct===null||raw.completionPct===undefined?null:Math.max(0,Math.min(100,Number(raw.completionPct)));
  return{connected:true,sourceProduct:text(raw.sourceProduct)||null,diagnosticStatus:text(raw.diagnosticStatus)||null,programStatus:text(raw.programStatus)||null,openActions:n(raw.openActions),overdueActions:n(raw.overdueActions),nextDueAt,completionPct:pct,categories:Array.isArray(raw.categories)?raw.categories.map(text).filter(Boolean).slice(0,20):[],deepLink:text(raw.deepLink)||null,observedAt:text(raw.observedAt)||null,dueWithin7Days,privacy:'aggregate_only'};
}
