# NexOffice Ecosystem Blueprint

## North star

NexOffice is the operating system and network for a small business. The customer should not have to understand which specialized engine is being invoked. NexOffice owns the business context, permissions, workflow, lineage and user experience; specialized products keep ownership of their deep domain data and execution.

The product promise is operational growth: help the business attract demand, convert it, formalize the relationship, issue the required fiscal document, collect, communicate, measure outcomes and bring in a human specialist when software alone is not enough.

## Core layers

### NexOffice Core
- CRM, pipeline, agenda, tasks, finance ledger, collections, Command Center, approvals, audit, business intelligence and shared workspace context.
- Source of truth for the operational relationship between lead, customer, opportunity, service, receivable and outcome.

### MODO
- Demand, acquisition, content, campaigns, prospecting, market intelligence and growth recommendations.
- MODO should be native in the NexOffice experience.
- External publication/media spend remains separately governed and approval-first.

### SmartBots
- WhatsApp/conversation, lead qualification, follow-up, customer communication and collections communication.
- Normal use should happen through NexOffice, not by forcing the customer to operate a second application.
- NexOffice prepares and approves the intent; SmartBots executes the authorized communication.
- Never persist a client token in NexOffice.

### DocWallet
- Document/contract source of truth.
- Contract templates, generation, intelligence and signature are provided by DocWallet.
- NexOffice keeps document references and structured operational status, not raw contract content.
- Desired commercial flow: opportunity/service request -> contract -> signature -> fiscal -> collection.

### TaxAgent
- Native fiscal engine for every eligible NexOffice business, not only accountants.
- Customers can issue their own NFS-e and use TaxAgent capabilities when they need them.
- Accountants/BPO firms can additionally use TaxAgent as a professional service capability inside NexOffice Network.
- NexOffice should prepare invoice intent from CRM/contract/operation data; TaxAgent remains the fiscal source of truth.
- Production fiscal effects are always approval/readiness gated.

### NexOffice Network
- Contextual professional-services network, not a generic freelancer marketplace.
- External providers can publish profiles, specialties, portfolio and services when operating through a NexOffice workspace.
- Initial provider verticals: media buyers, advertising/creative professionals, marketers, accountants, BPO fiscal/financial providers and consultants.
- Access to client workspaces must be delegated and permission-scoped. A provider sees only what the client explicitly grants.
- Reputation should evolve from verified outcomes in the platform, not only star ratings.

### NexJud Mini
- Small embedded legal assistant for routine questions, explanations and lightweight analysis.
- It is not positioned as a replacement for legal counsel and should not become a full legal workspace inside NexOffice.
- Deep legal domain remains NexJud-owned. NexOffice may consume safe outputs/operational signals and provide a contextual launcher/chat surface.
- High-stakes or case-specific legal work should escalate to the proper NexJud experience or a professional.

### Alternative Ventures Studio
- First-party complementary offer in the ecosystem.
- Purpose: custom websites, bespoke systems, apps, integrations and product development for NexOffice customers whose need exceeds configurable SaaS capabilities.
- Presented as a premium ecosystem service/card, not as a core NexOffice module.
- Can use the same service-request, contract, collection and outcome lineage as external providers.

### Nexa
- For now Nexa remains outside operational finance in NexOffice.
- No BaaS account, custody, USDC settlement, cashout or financial rails are activated through NexOffice until the new financial-institution/BaaS infrastructure is contracted and homologated.
- Nexa may appear only as a future/advertising offer, e.g. "Conheça a conta Nexa", without implying availability of an embedded account.

## Owner-controlled collections

Until financial rails are intentionally reintroduced, NexOffice does not touch customer funds.

The workspace owner can register the business's own Pix information. NexOffice can:
- create/track receivables;
- prepare a clear payment message;
- include customer, service, amount, due date and Pix instructions;
- send or copy the communication through approved channels;
- let the owner mark/reconcile payment;
- connect the result back to CRM, service delivery and fiscal lineage.

Sensitive Pix identifiers are encrypted at application level. APIs expose masked values by default and only reveal the full value to the authorized workspace when preparing an explicit payment package/draft.

## Commercial operation lineage

The canonical NexOffice business flow is:

1. MODO creates demand / lead / opportunity.
2. CRM qualifies and advances the opportunity.
3. When needed, NexOffice Network supplies a human specialist.
4. DocWallet creates and signs the proposal/contract.
5. A `business_operation` links customer, deal, provider request and contract reference.
6. TaxAgent receives a reviewed/approved fiscal intent and issues the invoice.
7. NexOffice creates the receivable using the operation value.
8. NexOffice prepares Pix instructions using the owner's payment data.
9. SmartBots communicates the approved message to the customer.
10. Payment is marked/reconciled in the NexOffice ledger.
11. NexOffice closes the operation and records verified outcomes.
12. MODO/CRM/Network intelligence uses the outcome to improve future acquisition, conversion and provider reputation.

This is a lineage graph, not duplication: DocWallet owns the contract, TaxAgent owns the fiscal artifact, SmartBots owns channel delivery, NexOffice owns the operational relationship among them.

## First-party ecosystem offers

NexOffice can surface first-party offers contextually:

- Alternative Ventures Studio — custom site/system/app/integration build.
- Nexa — future financial account/fintech offer, informational only while BaaS is unavailable.
- NexJud Mini — contextual legal help rather than a marketplace listing.

The product should recommend these only when relevant to a detected need; avoid turning the home screen into an ad catalog.

## Network membership and monetization direction

- Businesses subscribe to NexOffice.
- MODO and SmartBots remain add-ons/capabilities where appropriate.
- Providers participate through a NexOffice Provider identity/workspace.
- Specialized provider badges/capabilities can reflect MODO, TaxAgent or other verified tools used by the provider.
- Initial monetization should favor subscription/provider access and ecosystem adoption over an aggressive transaction take-rate.
- Later options: lead fees, featured providers, managed service contracts, outcome-based reputation, escrow/split only when appropriate financial infrastructure exists.

## Safety and privacy rules

- Cross-workspace discovery exposes only explicitly published provider fields.
- CRM, finance, customer data, documents, legal data and raw business metrics are private by default.
- Delegated provider access is least-privilege and revocable.
- External effects use explicit approvals/gates.
- Fiscal, legal and financial domain boundaries remain explicit.
- Nexa financial functionality stays disabled until separately authorized and homologated.
- SmartBots, MODO, TaxAgent and DocWallet should remain replaceable behind capability/adaptor contracts where practical.

## Current implementation milestone

Branch: `feature/nexoffice-network-v1`

Implemented in this milestone:
- provider profiles, services and portfolios;
- provider service requests between NexOffice workspaces;
- provider outcome records;
- DocWallet reference linking for service requests;
- owner-controlled encrypted Pix profile;
- receivable-to-Pix payment packages;
- `business_operations` lineage for CRM/deal -> DocWallet -> TaxAgent -> collection;
- invoice preparation through existing TaxAgent capability and human approval;
- collection creation from a business operation;
- secret-safe communication draft generation without persisting a raw Pix key.

Still intentionally separated / next milestones:
- DocWallet contract creation-from-template endpoint inside the NexOffice bridge;
- secure SmartBots hydration/send for owner-Pix collection drafts after approval, aligned with the Revenue Loop branch;
- TaxAgent async webhook/poll synchronization back to `business_operations` after authorization/rejection;
- Network provider badges/eligibility and verified outcome scoring;
- contextual NexJud Mini surface;
- Alternative Ventures Studio first-party service card/request flow;
- Nexa informational/future-offer card only.

## Delivery discipline

This ecosystem work is developed in a dedicated feature branch. It must not be merged/deployed merely because development continues; merge/deploy requires explicit authorization and normal CI validation.
