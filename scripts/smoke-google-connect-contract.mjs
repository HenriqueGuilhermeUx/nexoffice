import fs from 'node:fs';
import assert from 'node:assert/strict';

const route=fs.readFileSync('apps/api/src/routes-connect-google.ts','utf8');
const secrets=fs.readFileSync('apps/api/src/connector-secrets.ts','utf8');

assert.ok(route.includes("https://www.googleapis.com/auth/gmail.metadata"),'Gmail connector must stay metadata-only');
assert.ok(route.includes("https://www.googleapis.com/auth/calendar.readonly"),'Calendar connector must stay readonly');
for(const forbidden of [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.events.owned'
])assert.ok(!route.includes(forbidden),`forbidden Google write scope present: ${forbidden}`);

assert.ok(route.includes("sendEmail:false"),'connector must explicitly deny email send');
assert.ok(route.includes("modifyMailbox:false"),'connector must explicitly deny mailbox mutation');
assert.ok(route.includes("createCalendarEvent:false"),'connector must explicitly deny calendar create');
assert.ok(route.includes("modifyCalendarEvent:false"),'connector must explicitly deny calendar modify');
assert.ok(route.includes("privacy:'metadata_only'"),'email observations must disclose metadata-only privacy');
assert.ok(route.includes("bodyStored:false"),'email bodies must not be stored');
assert.ok(route.includes("attachmentsStored:false"),'email attachments must not be stored');
assert.ok(route.includes("externalModificationAllowed:false"),'calendar observations must be read-only');
assert.ok(route.includes("source='external.google.gmail'"),'Gmail must normalize to external business events');
assert.ok(route.includes("source='external.google.calendar'"),'Calendar must normalize to external business events');
assert.ok(route.includes("provider='google_workspace'"),'integration provider must be explicit');
assert.ok(route.includes("secret_ref"),'OAuth token bundle must use secret_ref');
assert.ok(route.includes("encryptConnectorSecret(token)"),'OAuth tokens must be encrypted before persistence');
assert.ok(route.includes("timingSafeEqual"),'OAuth state signature must use timing-safe verification');
assert.ok(route.includes("workspace_members"),'OAuth callback must revalidate workspace membership');
assert.ok(route.includes("access_type','offline"),'OAuth must request offline access for explicit future sync');
assert.ok(route.includes("include_granted_scopes','true"),'OAuth must support incremental consent');
assert.ok(route.includes("prompt','consent"),'OAuth must explicitly request consent');

assert.ok(secrets.includes("createCipheriv('aes-256-gcm'"),'connector secret storage must use AES-256-GCM');
assert.ok(secrets.includes("createDecipheriv('aes-256-gcm'"),'connector secret storage must decrypt AES-256-GCM');
assert.ok(secrets.includes("NEXOFFICE_CONNECTOR_SECRET_KEY"),'connector secret key must come from environment');
assert.ok(secrets.includes("key.length!==32"),'connector secret key length must fail closed');
assert.ok(!route.includes('console.log(token)'),'tokens must never be logged');

console.log(JSON.stringify({
  ok:true,
  module:'Google Workspace Nex Connect V1',
  gmail:'metadata_only',
  calendar:'readonly',
  oauthStateSigned:true,
  tokensEncrypted:true,
  workspaceMembershipRevalidated:true,
  outboundActions:false
},null,2));
