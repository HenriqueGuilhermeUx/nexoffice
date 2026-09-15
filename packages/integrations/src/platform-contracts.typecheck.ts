import type {CondoOperationalSignalInput,HealthOperationalSignalInput,LegalOperationalSignalInput} from './index.js';

const period={periodStart:'2026-09-15T00:00:00-03:00',periodEnd:'2026-09-15T23:59:59-03:00'};

const legal:LegalOperationalSignalInput={...period,externalWorkspaceRef:'legal-workspace',dimensions:{window:'day',scope:'member'},signalType:'deadlines.summary',metrics:{dueToday:1,due7Days:2,overdue:0,completed:3}};
const health:HealthOperationalSignalInput={...period,sourceProduct:'mydatamed',externalWorkspaceRef:'health-workspace',dimensions:{window:'day',scope:'team'},signalType:'requests.summary',metrics:{open:1,overdue:0,escalated:0,resolved:2}};
const condo:CondoOperationalSignalInput={...period,externalWorkspaceRef:'condo-workspace',dimensions:{window:'day',scope:'workspace'},signalType:'compliance.summary',metrics:{pending:1,upcoming:2,overdue:0,completed:3,alertsFailed:0}};

// Legal may use member-level aggregate operational scope.
void legal;
void health;
void condo;

// Health and Condo firewalls deliberately reject member-level scope.
// @ts-expect-error health operational contract allows only workspace/team aggregates
const invalidHealth:HealthOperationalSignalInput={...period,sourceProduct:'mydatamed',externalWorkspaceRef:'health-workspace',dimensions:{window:'day',scope:'member'},signalType:'requests.summary',metrics:{open:1,overdue:0,escalated:0,resolved:2}};
// @ts-expect-error condo operational contract allows only workspace/team aggregates
const invalidCondo:CondoOperationalSignalInput={...period,externalWorkspaceRef:'condo-workspace',dimensions:{window:'day',scope:'member'},signalType:'portfolio.summary',metrics:{totalCondominiums:1,activeCondominiums:1,activeAssistants:1}};

void invalidHealth;
void invalidCondo;
