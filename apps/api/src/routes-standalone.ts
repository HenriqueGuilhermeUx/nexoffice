import type {FastifyInstance} from 'fastify';
import {workspaceContext} from './auth.js';
import {query} from './db.js';
import {registerComplianceRoutes} from './routes-compliance.js';
import {registerNetworkRoutes} from './routes-network.js';
import {registerNetworkTrustRoutes} from './routes-network-trust.js';
import {registerNetworkCapabilityRoutes} from './routes-network-capabilities.js';
import {registerNetworkStructuredOutcomeRoutes} from './routes-network-structured-outcomes.js';
import {registerNetworkDelegationRoutes} from './routes-network-delegations.js';
import {registerNetworkWorkExecutionRoutes} from './routes-network-work-execution.js';
import {registerNetworkProviderMatchingRoutes} from './routes-network-provider-matching.js';
import {registerOwnedPaymentRoutes} from './routes-owned-payments.js';
import {registerBusinessOperationRoutes} from './routes-business-operations.js';
import {registerEcosystemRoutes} from './routes-ecosystem.js';
import {registerDocWalletContractRoutes} from './routes-docwallet-contracts.js';
import {registerTaxAgentOperationSyncRoutes} from './routes-taxagent-operation-sync.js';
import {registerTaxAgentWebhookRoutes} from './routes-taxagent-webhooks.js';
import {registerEcosystemRecommendationRoutes} from './routes-ecosystem-recommendations.js';

const countFor=async(sql:string,workspaceId:string)=>Number((await query<any>(sql,[workspaceId]))[0]?.count||0);

export async function registerStandaloneRoutes(app:FastifyInstance){
  await registerComplianceRoutes(app);
  await registerNetworkRoutes(app);
  await registerNetworkTrustRoutes(app);
  await registerNetworkCapabilityRoutes(app);
  await registerNetworkStructuredOutcomeRoutes(app);
  await registerNetworkDelegationRoutes(app);
  await registerNetworkWorkExecutionRoutes(app);
  await registerNetworkProviderMatchingRoutes(app);
  await registerOwnedPaymentRoutes(app);
  await registerBusinessOperationRoutes(app);
  await registerEcosystemRoutes(app);
  await registerDocWalletContractRoutes(app);
  await registerTaxAgentOperationSyncRoutes(app);
  await registerTaxAgentWebhookRoutes(app);
  await registerEcosystemRecommendationRoutes(app);

  app.get('/v1/standalone/readiness',async req=>{
    const ctx=await workspaceContext(req,'workspace.read');
    const workspace=(await query<any>(`select id,name,slug,vertical,plan,status,timezone,currency,settings,created_at from workspaces where id=$1`,[ctx.workspaceId]))[0];
    const [contacts,deals,tasks,appointments,ledgerEntries,members,pendingInvites,financeAccounts,connectedIntegrations]=await Promise.all([
      countFor(`select count(*)::int count from crm_contacts where workspace_id=$1`,ctx.workspaceId),
      countFor(`select count(*)::int count from crm_deals where workspace_id=$1`,ctx.workspaceId),
      countFor(`select count(*)::int count from tasks where workspace_id=$1 and status<>'cancelled'`,ctx.workspaceId),
      countFor(`select count(*)::int count from appointments where workspace_id=$1 and status<>'cancelled'`,ctx.workspaceId),
      countFor(`select count(*)::int count from ledger_entries where workspace_id=$1 and status<>'cancelled'`,ctx.workspaceId),
      countFor(`select count(*)::int count from workspace_members where workspace_id=$1`,ctx.workspaceId),
      countFor(`select count(*)::int count from workspace_invites where workspace_id=$1 and accepted_at is null and expires_at>now()`,ctx.workspaceId),
      countFor(`select count(*)::int count from finance_accounts where workspace_id=$1 and archived_at is null`,ctx.workspaceId),
      countFor(`select count(*)::int count from integrations where workspace_id=$1 and status='connected'`,ctx.workspaceId)
    ]);
    return {workspace,counts:{contacts,deals,tasks,appointments,ledgerEntries,members,pendingInvites,financeAccounts,connectedIntegrations}};
  });
}
