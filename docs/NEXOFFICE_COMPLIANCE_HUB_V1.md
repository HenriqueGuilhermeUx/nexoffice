# NexOffice Compliance Hub V1

Status: design/implementation branch only. Do not merge to main until smoke tests pass and explicit merge approval is given.

## Product thesis

Compliance is a native NexOffice capability, not a separate app menu. NR1Check and MindCompliance remain separate products with their own canonical data and privacy boundaries.

### NR1Check
- fast diagnostic / entry layer for NR-1 and related occupational compliance discovery
- used when the business may benefit from checking applicability, gaps or readiness

### MindCompliance
- ongoing compliance management
- risks, evidence, documents, action plans, owners, deadlines and continuous obligations
- broader than NR-1 and relevant to multiple business types

## Experience principles

1. Nearly invisible integration: no repeated business profile and no duplicated canonical records.
2. Value-first: show only what is relevant to the company now.
3. Available to every client: companies that do not know whether NR-1 applies can still run a safe initial check.
4. No automatic legal conclusion from NexOffice. The onboarding triage is guidance only.
5. Sensitive data stays in the source compliance product.
6. NexOffice receives only safe operational summaries such as status, number of open actions, next deadline, completion percentage and deep-link/handoff context.
7. Founder Cockpit and 7-day plan may consume only those safe summaries.
8. No complaints, psychosocial responses, health data, employee-level answers, CPF, raw documents or confidential evidence in NexOffice.

## NR-1 discovery triage

The NexOffice onboarding may ask a small number of business-level questions such as:
- does the company have employees?
- is it MEI, ME/EPP or another company type?
- does it already have SST / occupational risk management support?
- has it already reviewed NR-1 / PGR applicability?

The output must be one of:
- `not_relevant_now`
- `worth_checking`
- `review_recommended`
- `already_managed`

These states describe onboarding relevance only and are not a legal determination.

## Privacy-safe contract

Allowed NexOffice -> compliance handoff context:
- workspaceRef
- businessName
- sector / business profile classification
- optional company-size / employee-presence flags when explicitly provided

Disallowed from NexOffice -> compliance:
- medical/health records
- psychosocial questionnaire answers
- complaints / whistleblowing content
- CPF or employee personal data
- raw documents

Allowed compliance -> NexOffice summary:
- integration status
- diagnostic status
- compliance program status
- open action count
- overdue action count
- next due date
- completion percentage
- high-level category labels
- safe deep link / handoff token

Disallowed compliance -> NexOffice:
- individual answers
- employee-level scores
- complaint content
- health data
- confidential evidence
- raw documents

## Minimal V1 flow

NexOffice workspace
-> lightweight relevance triage
-> if useful, single-click privacy-safe handoff to NR1Check
-> NR1Check diagnostic / onboarding
-> MindCompliance continuous management when applicable
-> aggregated status back to NexOffice
-> daily relevance in Founder Cockpit / 7-day plan

## Architecture

- independent repositories and databases
- no shared database
- server-side adapters only
- secrets server-side only
- single-use handoff/session exchange when implemented
- idempotent provisioning
- tenant isolation
- source product owns canonical records
- external effects remain approval-gated

## Current source-product state discovered

The `HenriqueGuilhermeUx/nr1check` repository already merged PR #1 `Add privacy-safe NexOffice entry flow`.
It accepts only `workspaceRef`, `businessName` and `sector`, stores the handoff context locally for up to 24h, requires the real CNPJ in the source product, and explicitly rejects employee/CPF/health/complaint/psychosocial/raw-document transfer.

The next implementation step in NexOffice is a native Compliance Hub shell + relevance triage + safe handoff adapter. The later step is secure aggregate status ingestion from MindCompliance/NR1Check after the source-side API contract is confirmed.
