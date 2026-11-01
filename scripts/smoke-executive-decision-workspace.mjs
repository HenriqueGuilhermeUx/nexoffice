import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const migration=read('infra/postgres/046_executive_decision_workspace.sql');
const route=read('apps/api/src/routes-executive-decisions.ts');
const server=read('apps/api/src/server.ts');
const ui=read('apps/web/src/ExecutiveContextPanel.tsx');

const has=(text,needle,label)=>{if(!text.includes(needle))throw new Error('Missing '+label+': '+needle)};
const lacks=(text,needle,label)=>{if(text.includes(needle))throw new Error('Forbidden '+label+': '+needle)};

has(migration,'create table if not exists executive_decisions','decision workspace persistence');
has(migration,'chosen_by uuid not null references users(id)','human actor persistence');
has(migration,'rationale text not null','explicit rationale persistence');
has(route,"workspaceContext(req,'command.decide')",'decision permission boundary');
has(route,"source:'maya.executive_recommendation_stack'",'recommendation provenance');
has(route,"humanSelected:true",'explicit human selection');
has(route,"automaticExecution:false",'execution prohibition');
has(route,"approvalCreated:false",'no approval side effect');
has(route,"commandActionCreated:false",'no command action side effect');
has(route,"auditLog(ctx,'executive.decision_recorded'",'audit trail');
has(server,'registerExecutiveDecisionWorkspaceRoutes','route registration');
has(ui,'Registrar esta decisão','explicit human decision control');
has(ui,'Por que você escolheu este caminho?','rationale request');
has(ui,'Decisão registrada · nenhuma ação executada','visible no-execution confirmation');
lacks(route,'insert into command_actions','command action creation');
lacks(route,'insert into approval_requests','approval creation');
lacks(route,'emitBusinessEvent(','orchestrator trigger');
lacks(route,'externalEffects:true','external effects');

console.log(JSON.stringify({
  ok:true,
  module:'Executive Decision Workspace V1',
  rationaleRequired:true,
  audited:true,
  commandActionCreated:false,
  approvalCreated:false,
  externalEffects:false,
  humanDecisionRequired:true
},null,2));
