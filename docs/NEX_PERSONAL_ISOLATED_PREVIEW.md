# Nex Personal — homologação isolada (23/10/2026)

## Recursos provisionados
- **Frontend de testes**: https://nex-personal-preview.onrender.com
  - Render static site \`srv-dbdrdh67bikc73867p5g\`
  - Branch: \`feature/nex-personal-foundation-20261022\`
  - \`VITE_API_URL=https://nex-personal-preview-api.onrender.com\`
  - \`VITE_PERSONAL_STAGING=true\`
  - autoDeploy = no
- **API de testes**: https://nex-personal-preview-api.onrender.com
  - Render web service \`srv-dbdrdd5g1s2s73ar3f70\`
  - Entry: \`apps/api/dist/server-personal.js\`, not \`server.js\`
  - \`NEXOFFICE_EXTERNAL_ACTIONS=false\`, all business jobs disabled
  - \`NEX_PERSONAL_PREVIEW=true\`, email allowlist and SHA-256 hashed invite code
  - \`ALLOWED_ORIGINS\` restricted to the frontend URL
  - autoDeploy = no
- **Dedicated Postgres**: Neon project \`orange-fog-28021931\`, \`nex-personal-isolated-homolog-20261023\`, database \`nex_personal_preview\`. Completely separate from NexOffices PJ, Nexa and other Neon projects.

## Single required manual secret binding

A cross-service credential-transfer security protection prevents copying the Neon DATABASE_URL into the Render service programmatically.

1. Open **https://console.neon.tech/**; select the project \`nex-personal-isolated-homolog-20261023\`.
2. In **Connect**, select database \`nex_personal_preview\` and copy the secure Postgres connection string (include TLS/SSL query parameters). **Do not paste the URL into chats, source code, GitHub issues, files or public docs.**
3. Open **https://dashboard.render.com/web/srv-dbdrdd5g1s2s73ar3f70**, navigate to Environment, and add \`DATABASE_URL\` as a **secret** with that connection string.
4. Save, and deploy the isolated API if Render does not automatically redeploy after the environment change.
5. Visit \`https://nex-personal-preview-api.onrender.com/health\`; expect \`{"status":"ok","service":"nex-personal-preview",...}\`. Then visit \`https://nex-personal-preview.onrender.com\` to create a testing account using the allowlisted email and the private invite code shared separately.

## Security controls
- The API exposes only \`/health\`, PF auth login/logout/register, and \`/v1/personal/*\`. No workspace, CRM, business ledger, billing, payments, Pix or customer transfer routes are registered.
- Preview bootstrap reads only \`infra/personal-preview/001_identity.sql\`, \`infra/postgres/046_...\`, and \`047_...\`. It explicitly refuses databases with preexisting nonpersonal public tables/schemas.
- Code leaves protected server-side invitation hash in Render env; the frontend asks for the invite code at signup. No invite secret is committed.
- Never use a NexOffice production/staging DB connection string here.
- \`AUTO_MIGRATE=true\` creates required personal tables only when attached to a clean dedicated database.
- No authentic bank account information, linked institution, provider credential, real Pix, payment or automatic balance update is available.
- Personal preview sessions have a 1-day TTL and are deliberately isolated from production NexOffices identities. This is a homologation only.
- Avoid importing sensitive real customer statements in this test environment before security and privacy approval; test with non-sensitive data.

## Current verification status
- GitHub main CI and independent preview smoke tests passed for \`4719aa28c17af9558e21029e6698fd0c30d8f2ec\` (workflow \`40012139323\`).
- Frontend Render initial deploy reached \`live\`.
- API Render build initially failed under \`NODE_ENV=production\` due to TypeScript devDependencies not installed; added \`NPM_CONFIG_INCLUDE=dev\`. Subsequent process reached app startup and correctly refused to start without \`DATABASE_URL\`. It is NOT operational until the secret is supplied.
- Additional migration-refusal CI check added subsequently; rerun current PR CI before release.

## Subsequent gates
1. API \`/health\` responds over HTTPS.
2. Create PF account with permitted email and invitation code.
3. Verify private sessions and own-only accounts/transactions.
4. Test CSV/OFX imports and deterministic Maya with non-sensitive trial data.
5. Confirm no PJ endpoint responds.
6. Security review: OTP/email verification, account recovery, per-user quotas, access logs and data deletion lifecycle before allowing general public use.
7. Require owner approval for merge and production deploy. The PR remains draft.
