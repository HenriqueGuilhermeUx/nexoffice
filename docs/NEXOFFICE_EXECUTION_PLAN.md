# NexOffice Ecosystem Execution Plan

## Product direction

NexOffice is the operating system and network for a small business. The customer should operate one coherent workflow even when specialized engines execute the deep work behind the scenes.

Canonical business loop:

`MODO demand -> CRM opportunity -> DocWallet contract -> TaxAgent invoice -> owner-controlled Pix collection -> SmartBots communication -> payment/outcome -> NexOffice intelligence`

When software alone is not enough, NexOffice Network can bring in a scoped human specialist. Alternative Ventures Studio is a first-party premium service for custom sites, systems, apps and integrations. NexJud Mini provides lightweight contextual legal help. Nexa remains outside operational finance until its new BaaS infrastructure is contracted and homologated.

## Non-negotiable boundaries

### Nexa
- No Nexa BaaS account opening through NexOffice yet.
- No custody, USDC settlement, cashout, Pix execution or Nexa financial rails in NexOffice.
- Nexa may appear only as a future/informational first-party offer such as `Conheça a conta Nexa` / `Tenho interesse`.
- Current BaaS replacement/provider work (including Efí evaluation/contracting) is outside this NexOffice milestone.

### Owner-controlled Pix
- Customer funds remain outside NexOffice.
- Each workspace may register its own Pix key and beneficiary data.
- Pix key is encrypted at application level and masked by default.
- NexOffice may create receivables, assemble collection information and let the authenticated owner copy a complete payment message.
- Full Pix data must not be persisted in command actions, approval payloads, audit metadata, marketplace records or SmartBots payloads.
- SmartBots may send approved collection reminders/context without the Pix secret.
- Marking/reconciling payment remains a NexOffice ledger operation; it does not imply that NexOffice processed the payment.

### Specialized engines stay authoritative
- DocWallet owns raw contracts/documents, templates, intelligence and signature artifacts.
- TaxAgent owns fiscal issuance and fiscal artifacts/status.
- SmartBots owns channel delivery/conversation execution.
- MODO owns growth execution/intelligence.
- NexJud owns deep legal capability.
- NexOffice owns cross-domain lineage, permissions, approvals, business context, operational status and user experience.

## Milestones

### A. Revenue Loop — MODO + SmartBots
Status: built in dedicated PR/branch.

Scope:
- MODO attribution to CRM opportunities/customers/revenue.
- `Dinheiro Agora` signals.
- contextual revenue playbooks.
- native follow-up preparation.
- human approval before outbound communication.
- isolated SmartBots external-action gate, OFF by default.

### B. NexOffice Network + ecosystem offers
Status: base Network, contextual recommendations, Provider Trust, request-scoped Delegated Access, Network Work Execution UI, Capability/Eligibility Evidence, Structured Outcomes V1 and Contextual Provider Matching V1 are implemented in dedicated stacked PRs/branches; not merged/deployed.

Implemented:
- provider profiles, specialties, portfolio and services;
- contextual provider discovery;
- service requests between workspaces;
- provider outcomes;
- public profile only across workspaces; CRM/finance/customer data remain private;
- Alternative Ventures Studio first-party complementary offer;
- Nexa informational/future offer only;
- owner-controlled encrypted Pix profile;
- base `business_operations` lineage;
- deterministic contextual Recommendation Engine with human decision required;
- Provider Trust based on safe operational evidence, without stars, score or ranking;
- request-scoped Delegated Access with explicit read-only scopes, expiry, revocation and audit;
- no automatic `workspace_members` membership for external providers;
- Network Work Execution / Outcome Loop with create/link `business_operation` from accepted provider requests;
- native Work UI for safe lineage `Trabalho -> Operação -> Contrato -> Nota -> Cobrança -> Comunicação -> Recebido -> Outcome`;
- Capability/Eligibility Evidence separated from Provider Trust;
- Network eligibility based on objective workspace state: active workspace + published provider profile + active service;
- public capability badges derived only from observed NexOffice usage, never from inferred quality;
- capability evidence can reflect documented operation, fiscal flow, collection flow, communication flow, delegated context and client-recorded outcome;
- explicit capability methodology `ranking=false`, `score=false`, `certification=false`, `observedEvidenceOnly=true`;
- Structured Outcomes V1 stored in the existing `provider_outcomes.metrics` JSON contract with outcome type, measurement status, impact tags and private metrics;
- structured outcome detail remains requester-private; audit stores counts/metadata, not private metric values or outcome summary;
- public structured-outcome detail is privacy-thresholded: measurement/category detail is suppressed below three structured outcomes and category evidence requires at least three records;
- Contextual Provider Matching V1 combines explicit need, workspace vertical, safe operational signals, published provider profile/service text and observed capability evidence;
- matching results explain `compatível porque...`, keep the general provider directory available and use neutral alphabetical display order;
- explicit matching methodology `ranking=false`, `score=false`, `bestProvider=false`, `humanDecisionRequired=true`;
- matching never exposes client identity, amounts, Pix secrets, raw documents, fiscal payloads or private outcome metrics and never grants workspace membership/delegated access.

Current Network increment:
- formal entitlement contract only if paid/add-on eligibility must become a Network badge;
- keep commercial entitlement semantics separate from observed operational capabilities;
- do not use `workspaces.plan` or generic `integrations` rows as commercial entitlement badges until their semantic contract is explicitly formalized;
- preserve Trust, Capability and Matching as separate concepts: history/evidence, observed capability/eligibility and contextual relevance.

Next Network increments:
- formal entitlement model for paid/add-on badges when the product packaging requires it;
- stronger provider work lifecycle UX after real-client usage evidence;
- improve discovery facets/filters from real Network usage without turning them into provider ranking;
- provider availability/service-region UX when real supply makes it useful;
- avoid generic marketplace/Fiverr behavior until network liquidity justifies it.

### C. DocWallet native contract creation
Status: bridge work exists in dedicated NexOffice + DocWallet branches/PRs; contract-to-operation linkage is implemented in a stacked NexOffice milestone.

Goal:
- create a contract from NexOffice using the real DocWallet contract engine;
- use DocWallet templates;
- store only `document_ref` + status/hash metadata in NexOffice;
- no raw contract copy in NexOffice;
- signature remains a separate governed action;
- a contract can become the start of a `business_operation`.

Target UX:
`CRM/deal -> Novo contrato -> DocWallet template -> review/sign -> Operação Comercial`

Implemented linkage:
- create contract + optional `business_operation` in one explicit user action;
- link a newly created DocWallet contract to an existing operation;
- validate workspace/contact/deal ownership before linking;
- no automatic signature, fiscal issuance, collection or communication.

### D. TaxAgent native fiscal flow
Status: TaxAgent capability/adapter, approval-first invoice preparation, Commercial Operation status synchronization and signed webhook synchronization are implemented in dedicated stacked milestones; production webhook setup remains OFF.

Goal:
- TaxAgent is available to the business owner, not only accountants;
- prepare invoice data from CRM/contract/operation;
- require human approval/readiness for fiscal effects;
- synchronize TaxAgent authorized/rejected status back to `business_operations`;
- connect authorized invoice reference to receivable and customer communication.

Implemented synchronization:
- recover the real TaxAgent invoice ID from the executed approval action result;
- persist only TaxAgent reference/status in the NexOffice lineage;
- read `GET /invoices/:id` from TaxAgent without reissuing or mutating the fiscal operation;
- map `authorized` to `invoice_authorized` and rejected/cancelled states to operational attention;
- surface real fiscal status in the Operação Comercial UI;
- preserve TaxAgent as fiscal source of truth;
- webhook-driven status updates implemented through the signed TaxAgent receiver;
- signed TaxAgent webhook receiver for `invoice.authorized` and `invoice.rejected`;
- HMAC-SHA256 verification, anti-replay window and persistent event idempotency;
- webhook setup gate remains `NEXOFFICE_TAXAGENT_WEBHOOK_SETUP=false` by default and has not been activated.

Next fiscal increment:
- richer authorized invoice metadata (number/DANFSe links when the TaxAgent contract exposes safe references);
- explicit fiscal-readiness guidance before production issuance.

Accountants in NexOffice Network can additionally use TaxAgent professionally for multiple customers with explicit delegated access.

### E. Commercial Operation Orchestrator
Status: built and CI-validated in a dedicated stacked PR/branch; not merged/deployed.

Canonical lineage:
1. customer/contact;
2. CRM opportunity;
3. optional Network provider request;
4. DocWallet contract reference;
5. TaxAgent invoice action/reference;
6. NexOffice receivable;
7. owner-controlled Pix collection package;
8. optional approved SmartBots reminder without payment secret;
9. payment marked/reconciled;
10. verified outcome.

Native UI exposes the chain:
`Contrato -> Nota -> Cobrança -> Comunicar -> Recebido`

Current safe collection model:
- `Ver mensagem Pix`: authenticated-only, ephemeral full payment message for the workspace owner to copy;
- `Lembrete via SmartBots`: approval-first communication without raw Pix key;
- no automated payment-data secret injection into third-party messaging.

### F. NexJud Mini
Status: narrow bridge work exists in dedicated NexOffice + NexJud branches/PRs.

Scope:
- small contextual legal bot inside NexOffice;
- routine questions, explanations and lightweight analysis;
- minimal business context only;
- no automatic import of legal cases/documents/clients;
- no full legal workspace inside NexOffice;
- high-stakes/case-specific issues escalate to NexJud or a professional.

### G. Alternative Ventures Studio
Status: first-party offer exists in ecosystem milestone.

Offer categories:
- websites;
- bespoke systems;
- apps;
- integrations/automations;
- custom product development.

AV Studio should use the same service request -> contract -> invoice -> collection -> outcome lineage as external providers.

### H. Nexa future offer
Status: informational only.

Current allowed behavior:
- contextual card/offer;
- explain future account proposition;
- capture explicit interest.

Not allowed yet:
- actual account provisioning;
- embedded banking;
- USDC collection/settlement;
- Pix/cashout execution;
- financial promises that depend on unavailable BaaS infrastructure.

## Product recommendation engine direction

NexOffice now has a deterministic contextual recommendation engine and a separate contextual provider matcher. Both combine workspace-local operational signals with explicit user context where available and keep `externalEffects=false` / `humanDecisionRequired=true`.

Current examples:
- campaign/pipeline weakness -> MODO or specialist;
- stale proposals -> SmartBots/CRM playbook;
- service agreed -> DocWallet contract;
- contract without fiscal progression -> TaxAgent;
- authorized invoice without receivable -> owner-controlled Pix collection;
- repeated fiscal complexity -> explain compatible published accountant/fiscal providers without ranking them;
- explicit legal/technology/marketing/finance need -> show explainable compatible providers while retaining the full Network directory;
- legal routine doubt -> NexJud Mini;
- need exceeds configurable SaaS -> Alternative Ventures Studio;
- future financial account interest -> Nexa informational offer only, never automatic.

## Monetization direction

Initial:
- NexOffice subscription;
- MODO add-on;
- SmartBots add-on;
- provider/NexOffice Network access where appropriate;
- TaxAgent capability/subscription where appropriate;
- AV Studio project revenue.

Later, only after network liquidity and appropriate infrastructure:
- qualified lead fees;
- featured providers;
- managed service contracts;
- verified outcome reputation;
- transaction-related economics only when legally/technically appropriate financial rails exist.

## Delivery discipline

- Keep milestones in separate feature branches/PRs until explicitly authorized to integrate.
- Do not merge/deploy merely because the user says `bora`, `continue` or `manda bala`.
- Production external actions remain OFF unless separately and explicitly authorized.
- TaxAgent webhook setup remains OFF unless explicitly authorized.
- Do not introduce Nexa operational finance until BaaS infrastructure is contracted, mapped, tested and homologated.
- Prefer strengthening existing engines and bridges over duplicating domain logic in NexOffice.