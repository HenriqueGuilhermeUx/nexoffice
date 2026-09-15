import {agentForEvent, resolveAutonomy, type AutonomyPolicy, type BusinessEvent} from '@nexoffice/domain';
import {query, transaction} from './db.js';

const titleForEvent = (type: string) => ({
  'appointment.cancelled': 'Horário liberado na agenda',
  'payment.overdue': 'Cobrança vencida precisa de atenção',
  'payment.received': 'Pagamento recebido',
  'document.signature_required': 'Documento aguardando assinatura',
  'document.signed': 'Documento assinado',
  'lead.created': 'Novo lead no CRM',
  'lead.followup_due': 'Lead precisa de follow-up',
  'campaign.opportunity': 'Oportunidade de campanha identificada'
}[type] || type.replace(/[._]/g, ' '));

const summaryForEvent = (event: BusinessEvent) => {
  const p = event.payload as Record<string, unknown>;
  if (event.type === 'payment.overdue') return `${p.description || 'Recebível'} está vencido${p.amountMinor ? ` no valor de R$ ${(Number(p.amountMinor) / 100).toFixed(2)}` : ''}.`;
  if (event.type === 'appointment.cancelled') return `Um horário foi cancelado${p.startsAt ? ` para ${new Date(String(p.startsAt)).toLocaleString('pt-BR')}` : ''}.`;
  if (event.type === 'lead.created') return `${p.name || p.company || 'Novo contato'} entrou no CRM.`;
  return String(p.summary || p.description || 'Há uma nova situação que pode exigir ação.');
};

export async function loadPolicies(workspaceId: string): Promise<AutonomyPolicy[]> {
  return query<AutonomyPolicy>(
    `select workspace_id as "workspaceId", action_type as "actionType", mode, max_amount_minor as "maxAmountMinor", allowed_channels as "allowedChannels", conditions
       from autonomy_policies where workspace_id = $1`, [workspaceId]
  ).catch(() => []);
}

export async function processBusinessEvent(event: BusinessEvent) {
  const policies = await loadPolicies(event.workspaceId);
  const actionType = event.type;
  const autonomy = resolveAutonomy(actionType, policies);
  const agentRole = agentForEvent(event.type);
  const title = titleForEvent(event.type);
  const summary = summaryForEvent(event);

  return transaction(async client => {
    let approvalId: string | null = null;
    if (autonomy === 'approval_required') {
      const approval = await client.query(
        `insert into approval_requests (workspace_id, action_type, title, description, status, requested_by_agent, subject_type, subject_id, proposed_payload)
         values ($1,$2,$3,$4,'pending',$5,$6,$7,$8) returning id`,
        [event.workspaceId, actionType, title, summary, agentRole, event.subjectType || null, event.subjectId || null, JSON.stringify(event.payload || {})]
      );
      approvalId = approval.rows[0].id;
    }

    const action = await client.query(
      `insert into command_actions (workspace_id, agent_role, title, summary, priority, status, autonomy, event_id, approval_id, subject_type, subject_id, primary_action, secondary_actions, metadata)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning *`,
      [event.workspaceId, agentRole, title, summary, priorityFor(event.type), autonomy === 'automatic' ? 'executing' : 'open', autonomy, event.id, approvalId, event.subjectType || null, event.subjectId || null,
       JSON.stringify({type: actionType, payload: event.payload}), JSON.stringify([]), JSON.stringify({source: event.source})]
    );
    return action.rows[0];
  });
}

function priorityFor(type: string): 'low' | 'normal' | 'high' | 'critical' {
  if (type.includes('critical') || type === 'payment.failed') return 'critical';
  if (type === 'payment.overdue' || type === 'document.signature_required' || type === 'lead.followup_due') return 'high';
  if (type === 'payment.received' || type === 'document.signed') return 'low';
  return 'normal';
}
