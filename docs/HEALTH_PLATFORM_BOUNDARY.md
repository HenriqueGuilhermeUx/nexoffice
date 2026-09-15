# NexOffice Health — fronteira de dados

O NexOffice Health é a camada **administrativa e empresarial** do ecossistema de saúde da Alternative Ventures. Ele não é prontuário, repositório clínico, Medical Passport, timeline de saúde nem substituto do MyDataMed/Health Wallet/Health Concierge.

## Donos de domínio

- **Health Wallet**: dados pessoais de saúde do paciente, exames, medicamentos, histórico, família, Medical Passport, MedScore, dispositivos/Health Connect e compartilhamento controlado pelo paciente.
- **MyDataMed / Health Concierge**: domínio profissional e coordenação clínica/assistencial, incluindo equipe de referência, solicitações, enfermagem, escalonamento médico, plano de ação, programas, alertas e contexto clínico autorizado.
- **NexOffice Health**: operação administrativa horizontal da organização: agenda operacional, tarefas, financeiro, cobrança, fiscal, fornecedores/parceiros, documentos empresariais, Command Center e sinais operacionais agregados.

## Dados proibidos no NexOffice

O NexOffice não deve receber nem persistir, direta ou indiretamente:

- nome, ID ou outro identificador de paciente usado para fins clínicos;
- CPF ou CNS de paciente;
- prontuário;
- diagnóstico;
- prescrição;
- medicação;
- exames ou resultados clínicos brutos;
- notas/evoluções clínicas ou texto clínico livre;
- dados genéticos;
- dados de wearable;
- registros Health Connect;
- relações familiares de saúde;
- sessões brutas de telemedicina;
- payloads clínicos de consentimento.

Essa restrição vale mesmo quando o usuário possuir permissão legítima no produto de origem. Autorização no MyDataMed/Health Wallet não transforma o NexOffice em um datastore clínico autorizado.

## O que pode atravessar a integração

### Identidade organizacional

A federação pode transportar somente o necessário para autenticação e RBAC empresarial:

- referência externa da organização/workspace;
- subject do membro da equipe;
- nome/e-mail profissional necessários ao acesso;
- role empresarial;
- entitlement do add-on.

### Sinais operacionais agregados

O endpoint server-to-server `POST /v1/platform/health-signals` aceita apenas schemas fechados e agregados. Tipos atuais:

- `appointments.summary`
- `requests.summary`
- `sla.summary`
- `workload.summary`
- `programs.summary`

Exemplo permitido:

```json
{
  "sourceProduct": "mydatamed",
  "externalWorkspaceRef": "clinic_123",
  "correlationId": "ops-2026-09-15",
  "signalType": "sla.summary",
  "periodStart": "2026-09-15T00:00:00-03:00",
  "periodEnd": "2026-09-15T23:59:59-03:00",
  "dimensions": {"window": "day", "scope": "workspace"},
  "metrics": {
    "total": 42,
    "withinSla": 37,
    "breached": 5,
    "avgFirstResponseMinutes": 14,
    "complianceRatio": 0.881
  }
}
```

Não há campo livre de paciente, descrição clínica, diagnóstico ou observação. Os objetos e métricas usam `.strict()`; chaves extras são recusadas pela API.

## Firewall no destino

A proteção não depende apenas do caller. O próprio NexOffice aplica:

1. autenticação server-to-server com `NEXOFFICE_INTERNAL_KEY`;
2. source limitado a `mydatamed` ou `health-wallet`;
3. workspace obrigatoriamente `vertical=health`;
4. schema Zod fechado por tipo de sinal;
5. apenas números agregados e dimensões enumeradas;
6. idempotência por `correlationId`;
7. auditoria sem conteúdo clínico;
8. armazenamento em tabela dedicada `workspace_operational_signals`.

O CI possui smoke test que prova que um agregado válido entra, enquanto payloads com `patientId`, `diagnosis`, `patientName` ou `examResult` são recusados.

## Regra para futuras integrações

Nenhum conector Health novo deve escrever diretamente em CRM, documentos, assistant context ou outros endpoints genéricos do NexOffice com dados oriundos do contexto de paciente. Integrações do domínio de saúde devem usar um contrato específico e revisado, como `health-signals`, ou apenas referências organizacionais não clínicas.

Se uma funcionalidade futura realmente precisar de um vínculo entre os dois domínios, use **referência opaca** e mantenha a resolução e os dados clínicos no sistema de saúde. Não replique o objeto clínico no NexOffice.

## Estado atual

O firewall foi implementado e validado no NexOffice. Nenhuma mudança foi aplicada à branch `feature/health-concierge-mvp`, ao Health Wallet em produção ou à estratégia HealthWallet Connect / Google Play. A conexão de origem permanece desligada até validação específica do produto profissional.