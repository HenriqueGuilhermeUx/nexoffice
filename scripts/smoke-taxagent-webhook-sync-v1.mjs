import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const must=(value,label)=>{if(!value)throw new Error(`TaxAgent webhook sync contract failed: ${label}`)};
const has=(text,value,label)=>must(text.includes(value),label||`missing ${value}`);
const lacks=(text,value,label)=>must(!text.includes(value),label||`unexpected ${value}`);

const routes=read('apps/api/src/routes-taxagent-webhooks.ts');
const crypto=read('apps/api/src/integration-secret-crypto.ts');
const standalone=read('apps/api/src/routes-standalone.ts');
const migration=read('infra/postgres/032_taxagent_webhook_sync.sql');
const env=read('.env.example');
const plan=read('docs/NEXOFFICE_EXECUTION_PLAN.md');

has(routes,"allowedEvents=['invoice.authorized','invoice.rejected']",'fiscal event allowlist');
has(routes,"NEXOFFICE_TAXAGENT_WEBHOOK_SETUP",'separate setup gate');
has(routes,"taxagent_webhook_setup_disabled",'setup defaults to blocked unless explicitly enabled');
has(routes,"NEXOFFICE_PUBLIC_API_URL",'explicit public callback origin');
has(routes,"url.protocol!=='https:'",'HTTPS callback requirement');
has(routes,"/v1/companies/${encodeURIComponent(connection.companyId)}/webhooks",'TaxAgent company webhook registration contract');
has(routes,"externalEffect:true",'remote webhook setup declares external effect');
has(routes,"taxagent-signature",'TaxAgent signature header');
has(routes,"taxagent-timestamp",'TaxAgent timestamp header');
has(routes,"taxagent-event-id",'TaxAgent event-id header');
has(routes,"createHmac('sha256'",'HMAC-SHA256 verification');
has(routes,'timingSafeEqual','constant-time signature comparison');
has(routes,'>300','five-minute replay window');
has(routes,"on conflict(event_id) do nothing",'event idempotency');
has(routes,"invoice_not_managed_by_nexoffice",'unmanaged TaxAgent invoices are ignored safely');
has(routes,"fiscal_external_ref=$3,fiscal_status=$4",'verified event updates only fiscal lineage/status');
has(routes,"taxAgentWebhookEventId",'minimal webhook lineage metadata');
lacks(routes,'JSON.stringify(body),JSON.stringify(body)','no duplicate raw-payload persistence');
lacks(migration,'payload jsonb','raw webhook payload is not stored');
has(migration,'event_id text primary key','event idempotency ledger');
has(migration,'secret_ciphertext text','encrypted webhook secret storage');
has(migration,"status text not null default 'pending'",'receiver lifecycle status');

has(crypto,"NEXOFFICE_INTEGRATION_SECRET_KEY",'dedicated integration secret encryption key');
has(crypto,"createCipheriv('aes-256-gcm'",'AES-GCM integration secret encryption');
has(crypto,"createDecipheriv('aes-256-gcm'",'AES-GCM integration secret decryption');
lacks(crypto,'NEXOFFICE_PAYMENT_DATA_KEY','webhook secret encryption must remain separate from Pix encryption');

has(standalone,'registerTaxAgentWebhookRoutes(app)','TaxAgent webhook routes registered');
has(env,'NEXOFFICE_TAXAGENT_WEBHOOK_SETUP=false','webhook setup disabled by default');
has(env,'NEXOFFICE_INTEGRATION_SECRET_KEY=','integration secret key documented');
has(env,'NEXOFFICE_PUBLIC_API_URL=','public callback origin documented');
has(plan,'webhook-driven status updates','webhook milestone preserved in execution plan');

console.log('NexOffice TaxAgent Webhook Sync V1 security contract OK');
