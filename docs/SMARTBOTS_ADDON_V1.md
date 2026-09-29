# SmartBots add-on V1

Private add-on for eligible NexOffice subscribers.

- Partner price: R$ 79/month.
- Public SmartBots price remains R$ 149/month.
- NexOffice remains the orchestrator; SmartBots owns communication and WhatsApp onboarding.
- No provider-specific credentials or identifiers in the normal customer experience.
- SmartBots Scheduling Core V1 is included in the add-on.
- Scheduling capabilities exposed to NexOffice: `scheduling`, `availability`, and `booking`.
- SmartBots owns the canonical scheduling engine, including services, professionals/resources, working hours, availability, conversational booking, rescheduling/cancellation state, and double-booking protection.
- NexOffice does not duplicate scheduling rules; it advertises the capability and hands the customer to the SmartBots operational surface using the existing workspace binding.
- Existing SmartBots clients continue to work even when scheduling is not configured; the conversation router falls back to the normal SmartBots brain.

## Operational status

As of 2026-09-29, SmartBots Scheduling Core V1 has been merged into SmartBots `main`, the production database schema is present with RLS enabled and direct anon/authenticated access disabled, and the Netlify production project reports a ready current deployment after the merge.

NexOffice integration metadata now marks scheduling as included for new or refreshed SmartBots bindings. No extra NexOffice price or second scheduling subscription is introduced by this capability.
