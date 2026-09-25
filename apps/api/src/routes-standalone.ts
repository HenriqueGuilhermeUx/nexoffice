import type {FastifyInstance} from 'fastify';
import {workspaceContext} from './auth.js';
import {query} from './db.js';
import {registerComplianceRoutes} from './routes-compliance.js';
import {registerNexJudMiniRoutes} from './routes-nexjud-mini.js';

const countFor=async(sql:string,workspaceId:string)=>Number((await query<any>(sql,[workspaceId]))[0]?.count||0);

export async function registerStandaloneRoutes(app:FastifyInstance){
  await registerComplianceRoutes(app);
  await registerNexJudMiniRoutes(app);

  app.get('/v1/standalone/readiness',async req=>{
    const ctx=await workspaceContext(req,'workspace.read');
    const workspace=(await query<any>(`select id,name,slug,vertical,plan,status,timezone,currency,settings,created_at from workspaces where id=$1`,[ctx.workspaceId]))[0];
    const [contacts,deals,tasks,appointments,ledgerEntries,members,pendingInvites,financeAccounts,connectedIntegrations]=await Promise.all([
      countFor(`select count(*)::int count from crm_contacts where workspace_id=$1`,ctx.workspaceId),
      countFor(`select count(*)::int count from crm_deals where workspace_id=$1`,ctx.workspaceId),
      countFor(`select count(*)::int count from tasks where workspace_id=$1 and status<>'cancelled'`,ctx.workspaceId),
      countFor(`select count(*)::int count from appointments where workspace_id=$1 and status<>'cancelled'`,ctx.workspaceId),
      countFor(`select count(*)::int count from ledger_entries where workspace_id=$1 and status<>'cancelled'`,ctx.workspaceId),
      countFor(`select count(*)::int count from workspace_members where workspace_id=$1 and active=true`,ctx.workspaceId),
      countFor(`select count(*)::int count from workspace_invites where workspace_id=$1 and status='pending' and expires_at>now()`,ctx.workspaceId),
      countFor(`select count(*)::int count from finance_accounts where workspace_id=$1`,ctx.workspaceId),
      countFor(`select count(*)::int count from integrations where workspace_id=$1 and status in ('connected','active')`,ctx.workspaceId)
    ]);

    const steps=[
      {key:'workspace',title:'Empresa criada',detail:workspace?`${workspace.name} está pronta como workspace independente.`:'Crie o workspace principal.',done:Boolean(workspace),action:'workspace'},
      {key:'finance_account',title:'Conta financeira preparada',detail:financeAccounts?`${financeAccounts} conta(s) disponível(is) para o ERP Lite.`:'Prepare uma conta financeira para começar.',done:financeAccounts>0,action:'finance'},
      {key:'contact',title:'Primeiro contato',detail:contacts?`${contacts} contato(s) já fazem parte da base.`:'Cadastre o primeiro cliente, lead ou parceiro.',done:contacts>0,action:'contact'},
      {key:'deal',title:'Primeira oportunidade',detail:deals?`${deals} oportunidade(s) registrada(s).`:'Crie uma oportunidade para ativar o pipeline.',done:deals>0,action:'deal'},
      {key:'task',title:'Primeira tarefa',detail:tasks?`${tasks} tarefa(s) operacional(is) registrada(s).`:'Crie uma próxima ação para a rotina do negócio.',done:tasks>0,action:'task'},
      {key:'ledger',title:'Primeiro lançamento financeiro',detail:ledgerEntries?`${ledgerEntries} lançamento(s) financeiro(s) registrado(s).`:'Registre uma receita ou despesa para ativar a visão financeira.',done:ledgerEntries>0,action:'ledger'},
      {key:'team',title:'Equipe convidada',detail:members>1?`${members} membros ativos no workspace.`:pendingInvites?`${pendingInvites} convite(s) aguardando aceite.`:'Convide pelo menos uma pessoa para compartilhar a operação.',done:members>1||pendingInvites>0,action:'team'}
    ];
    const completed=steps.filter(step=>step.done).length;
    const completionPct=Math.round((completed/steps.length)*100);
    const next=steps.find(step=>!step.done)||null;
    return {
      workspace,
      completionPct,
      completed,
      total:steps.length,
      operationalReady:completed===steps.length,
      next,
      steps,
      metrics:{contacts,deals,tasks,appointments,ledgerEntries,members,pendingInvites,financeAccounts,connectedIntegrations},
      safety:{externalActionsEnabled:String(process.env.NEXOFFICE_EXTERNAL_ACTIONS||'false').toLowerCase()==='true'}
    };
  });
}
