/** Offline, test-only OIDC JWT verifier: pinned local JWKS, no network, no credentials. */
import { createPublicKey, verify, constants } from 'node:crypto';

const fail = () => { throw Error('Invalid US identity token'); };
function readSegment(value) {
  if (typeof value !== 'string' || value.length > 6000 || !/^[A-Za-z0-9_-]+$/.test(value)) fail();
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.toString('base64url') !== value) fail();
  try {
    const obj = JSON.parse(bytes.toString('utf8'));
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) fail();
    return obj;
  } catch { fail(); }
}
function safeURL(input) {
  if (typeof input !== 'string' || input.length > 300) fail();
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) fail();
    return url.href;
  } catch { fail(); }
}

/** Contract only. No OAuth redirect, PKCE, nonce, JWKS fetching or session creation. */
export function verifyUSOIDCToken(token, {issuer, audience, jwks, now = Date.now()} = {}) {
  if (!Number.isFinite(now) || typeof audience !== 'string' || !/^[\w.:-]{3,200}$/.test(audience)) fail();
  const issuerURL = safeURL(issuer);
  if (typeof token !== 'string' || token.length > 12000) fail();
  const parts = token.split('.');
  if (parts.length !== 3) fail();
  const [headerPart, payloadPart, signaturePart] = parts;
  const header = readSegment(headerPart), payload = readSegment(payloadPart);
  if (!/^[A-Za-z0-9_-]+$/.test(signaturePart)) fail();
  const signature = Buffer.from(signaturePart, 'base64url');
  if (signature.toString('base64url') !== signaturePart) fail();
  if (header.alg !== 'RS256' || (header.typ !== undefined && header.typ !== 'JWT') ||
      typeof header.kid !== 'string' || !/^[\w.-]{1,128}$/.test(header.kid) ||
      header.crit !== undefined || header.jku !== undefined || header.jwk !== undefined ||
      header.x5u !== undefined || header.x5c !== undefined) fail();
  if (!jwks || !Array.isArray(jwks.keys) || jwks.keys.length > 20) fail();
  const matches = jwks.keys.filter(key => key?.kid === header.kid);
  if (matches.length !== 1) fail();
  const key = matches[0];
  if (key.kty !== 'RSA' || key.alg !== 'RS256' || key.use !== 'sig' ||
      typeof key.n !== 'string' || typeof key.e !== 'string' || key.d !== undefined ||
      (key.key_ops !== undefined && (!Array.isArray(key.key_ops) || !key.key_ops.includes('verify')))) fail();
  let trustedKey;
  try { trustedKey = createPublicKey({key:{kty:'RSA',n:key.n,e:key.e},format:'jwk'}); }
  catch { fail(); }
  if (!verify('RSA-SHA256', Buffer.from(headerPart + '.' + payloadPart), {
    key: trustedKey, padding: constants.RSA_PKCS1_PADDING
  }, signature)) fail();
  const sec = Math.floor(now / 1000), skew = 30;
  if (payload.iss !== issuer || issuerURL !== safeURL(payload.iss)) fail();
  if (typeof payload.sub !== 'string' || payload.sub.length < 1 || payload.sub.length > 255) fail();
  if (!(payload.aud === audience ||
      (Array.isArray(payload.aud) && payload.aud.includes(audience) &&
       payload.aud.every(x => typeof x === 'string') &&
       (payload.aud.length === 1 || payload.azp === audience)))) fail();
  if (!Number.isSafeInteger(payload.exp) || payload.exp <= sec - skew) fail();
  if (payload.iat !== undefined && (!Number.isSafeInteger(payload.iat) || payload.iat > sec + skew)) fail();
  if (payload.nbf !== undefined && (!Number.isSafeInteger(payload.nbf) || payload.nbf > sec + skew)) fail();
  if (payload.region !== undefined && payload.region !== 'US') fail();
  if (payload.region_code !== undefined && payload.region_code !== 'US') fail();
  // Signed email and org claims are not a tenant authorization decision.
  return Object.freeze({issuer, subject:payload.sub, expiresAt:payload.exp, region:'US'});
}
