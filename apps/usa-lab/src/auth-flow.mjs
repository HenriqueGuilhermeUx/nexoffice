/** Isolated OIDC authorization-code + PKCE contract. No real IdP or HTTP handlers. */
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { verifyUSOIDCToken } from './oidc.mjs';

const digest = value => createHash('sha256').update(value).digest();
const token = () => randomBytes(32).toString('base64url');
const proofPattern = /^[A-Za-z0-9_-]{43}$/;
const orgPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reject = () => { throw Error('US OIDC lab flow rejected'); };
const trustedURL = urlString => {
  try {
    const u = new URL(urlString);
    if (u.protocol !== 'https:' || u.username || u.password || u.hash || u.search) reject();
    return u;
  } catch { reject(); }
};

/** Caller must bind this independently to an HttpOnly SameSite cookie in any future BFF. */
export function newUSLabBrowserBinding() { return token(); }

/**
 * Test-only state machine. exchangeCode and resolveMember are injected trusted fixtures,
 * not automatic network calls or public APIs. Returns no tokens or real sessions.
 */
export function createUSOIDCLabFlow({
  issuer, authorizationEndpoint, redirectUri, clientId, jwks,
  exchangeCode, resolveMember, clock = Date.now
} = {}) {
  if (process.env.USA_LAB_ENABLED !== '1' || process.env.NODE_ENV === 'production') reject();
  const issuerUrl = trustedURL(issuer);
  const authorizeUrl = trustedURL(authorizationEndpoint);
  if (authorizeUrl.origin !== issuerUrl.origin || !authorizeUrl.pathname.startsWith('/')) reject();
  let callback;
  try { callback = new URL(redirectUri); } catch { reject(); }
  if (callback.protocol !== 'http:' || callback.hostname !== '127.0.0.1' ||
      callback.username || callback.password || callback.hash || callback.search ||
      !callback.port || !callback.pathname.startsWith('/lab/')) reject();
  if (typeof clientId !== 'string' || !/^[A-Za-z0-9_.:-]{3,100}$/.test(clientId) ||
      typeof exchangeCode !== 'function' || typeof resolveMember !== 'function' ||
      typeof clock !== 'function' || !jwks || !Array.isArray(jwks.keys)) reject();

  const pending = new Map();
  const maxOutstanding = 40;
  const ttlMs = 5 * 60_000;

  function begin({ orgId, browserBinding } = {}) {
    if (!orgPattern.test(orgId ?? '') || !proofPattern.test(browserBinding ?? '')) reject();
    const now = clock();
    if (!Number.isFinite(now)) reject();
    for (const [state, saved] of pending) if (saved.expiresAt <= now) pending.delete(state);
    if (pending.size >= maxOutstanding) reject();
    const state = token(), nonce = token(), verifier = token();
    pending.set(state, {
      orgId, nonce, verifier,
      bindingDigest: digest(browserBinding), expiresAt: now + ttlMs
    });
    const url = new URL(authorizeUrl);
    url.searchParams.set('response_type','code');
    url.searchParams.set('client_id',clientId);
    url.searchParams.set('redirect_uri',callback.href);
    url.searchParams.set('scope','openid');
    url.searchParams.set('state',state);
    url.searchParams.set('nonce',nonce);
    url.searchParams.set('code_challenge',digest(verifier).toString('base64url'));
    url.searchParams.set('code_challenge_method','S256');
    return Object.freeze({ authorizationUrl:url.href, state });
  }

  async function complete({ state, code, browserBinding } = {}) {
    if (!proofPattern.test(state ?? '')) reject();
    // Consume state BEFORE exchange. Wrong binding/code and failed exchanges also burn it.
    const saved = pending.get(state);
    pending.delete(state);
    if (!saved || !proofPattern.test(browserBinding ?? '') ||
        typeof code !== 'string' || code.length < 4 || code.length > 1024 ||
        !timingSafeEqual(digest(browserBinding), saved.bindingDigest) ||
        saved.expiresAt <= clock()) reject();
    try {
      const response = await exchangeCode(Object.freeze({
        code, codeVerifier:saved.verifier, redirectUri:callback.href, clientId
      }));
      if (!response || typeof response.id_token !== 'string') reject();
      const identity = verifyUSOIDCToken(response.id_token,{
        issuer, audience:clientId, jwks, now:clock(), expectedNonce:saved.nonce
      });
      // Signed org_id or email claims must NEVER be used to authorize membership.
      const member = await resolveMember(Object.freeze({
        issuer:identity.issuer, subject:identity.subject, orgId:saved.orgId
      }));
      if (!member || member.region !== 'US' || member.orgId !== saved.orgId ||
          typeof member.userId !== 'string' || !member.userId) reject();
      return Object.freeze({
        region:'US', orgId:member.orgId, userId:member.userId, subject:identity.subject
      });
    } catch { reject(); }
  }
  return Object.freeze({begin, complete});
}
