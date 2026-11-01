import fs from 'node:fs';
import assert from 'node:assert/strict';

const route=fs.readFileSync('apps/api/src/routes-connect-microsoft.ts','utf8');
const secrets=fs.readFileSync('apps/api/src/connector-secrets.ts','utf8');

assert.ok(route.includes("MAIL_READ_BASIC_SCOPE='Mail.ReadBasic'"),'Outlook connector must use Mail.ReadBasic');
assert.ok(route.includes("CALENDAR_READ_BASIC_SCOPE='Calendars.ReadBasic'"),'Microsoft Calendar must use Calendars.ReadBasic');
assert.ok(route.includes("'offline_access'"),'OAuth must request offline_access for explicit future sync');
for(const forbidden of ['Mail.Send','Mail.ReadWrite','Mail.ReadWrite.Shared','Calendars.ReadWrite','Calendars.ReadWrite.Shared']){
  assert.ok(!route.includes(forbidden),`forbidden Microsoft write scope present: ${forbidden}`);
}
assert.ok(route.includes("sendEmail:false"),'connector must explicitly deny email send');
assert.ok(route.includes("modifyMailbox:false"),'connector must explicitly deny mailbox mutation');
assert.ok(route.includes("createCalendarEvent:false"),'connector must explicitly deny calendar create');
assert.ok(route.includes("modifyCalendarEvent:false"),'connector must explicitly deny calendar modify');
assert.ok(route.includes("privacy:'mail_read_basic'"),'mail observations must disclose basic-read privacy');
assert.ok(route.includes("bodyStored:false"),'mail bodies must not be stored');
assert.ok(route.includes("bodyPreviewStored:false"),'mail previews must not be stored');
assert.ok(route.includes("attachmentsStored:false"),'mail attachments must not be stored');
assert.ok(route.includes("externalModificationAllowed:false"),'calendar observations must be read-only');
assert.ok(route.includes("source='external.microsoft.mail'"),'Outlook must normalize to external business events');
assert.ok(route.includes("source='external.microsoft.calendar'"),'Microsoft Calendar must normalize to external business events');
assert.ok(route.includes("provider='microsoft_365'"),'integration provider must be explicit');
assert.ok(route.includes("secret_ref"),'OAuth token bundle must use secret_ref');
assert.ok(route.includes("encryptConnectorSecret(token)"),'OAuth tokens must be encrypted before persistence');
assert.ok(route.includes("decryptConnectorSecret<MicrosoftTokenSecret>"),'OAuth tokens must only be decrypted server-side');
assert.ok(route.includes("timingSafeEqual"),'OAuth state signature must use timing-safe verification');
assert.ok(route.includes("workspace_members"),'OAuth callback must revalidate workspace membership');
assert.ok(route.includes("login.microsoftonline.com"),'connector must use Microsoft identity platform');
assert.ok(route.includes("graph.microsoft.com/v1.0"),'connector must use Microsoft Graph v1.0');
assert.ok(route.includes("/me/messages?"),'mail sync must use signed-in mailbox');
assert.ok(route.includes("/me/calendarView?"),'calendar sync must use signed-in calendar view');
assert.ok(route.includes("$select"),'Graph reads must explicitly select required fields');
assert.ok(secrets.includes("createCipheriv('aes-256-gcm'"),'connector secret storage must use AES-256-GCM');
assert.ok(secrets.includes("NEXOFFICE_CONNECTOR_SECRET_KEY"),'connector secret key must come from environment');
assert.ok(!route.includes('console.log(token)'),'tokens must never be logged');

console.log(JSON.stringify({
  ok:true,
  module:'Microsoft 365 Nex Connect V1',
  outlook:'Mail.ReadBasic',
  calendar:'Calendars.ReadBasic',
  oauthStateSigned:true,
  tokensEncrypted:true,
  workspaceMembershipRevalidated:true,
  outboundActions:false
},null,2));
