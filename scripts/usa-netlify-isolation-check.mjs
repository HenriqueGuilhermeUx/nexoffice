/** Audit only the dedicated NexOffices USA static output; never apps/web/dist. */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const dir = resolve('apps/web/dist-usa');
const read = name => readFileSync(resolve(dir, name), 'utf8');
const walk = (path = dir) => readdirSync(path).flatMap(name => {
  const full = resolve(path, name);
  return statSync(full).isDirectory() ? walk(full) : [relative(dir, full).replaceAll('\\', '/')];
});
const names = walk().sort();
for (const required of ['index.html', 'us/index.html', '404.html', '_headers', '_redirects', 'robots.txt']) {
  assert.ok(names.includes(required), 'Missing NexOffices USA artifact: ' + required);
}
assert.ok(names.some(name => /^assets\/[\w.-]+\.js$/.test(name)), 'Missing USA JavaScript');
assert.ok(names.some(name => /^assets\/[\w.-]+\.css$/.test(name)), 'Missing USA stylesheet');
for (const name of names) {
  assert.match(name, /^(?:index\.html|us\/index\.html|404\.html|_headers|_redirects|robots\.txt|assets\/[\w.-]+\.(?:js|css))$/,
    'Unexpected Brazilian, PWA or server artifact: ' + name);
}
const html = read('index.html');
assert.equal(read('us/index.html'), html, 'USA /us must serve exactly the standalone entry');
assert.match(html, /<html lang="en-US">/);
assert.match(html, /noindex,nofollow/);
assert.doesNotMatch(html, /manifest|serviceWorker|src\/main\.tsx/i);
const sha = process.env.COMMIT_REF || process.env.USA_PREVIEW_SOURCE_SHA;
if (sha) {
  assert.match(sha, /^[a-f0-9]{40}$/i);
  assert.ok(html.includes('name="usa-preview-source-sha" content="' + sha + '"'),
    'USA bundle must disclose exact source revision');
}
const headers = read('_headers');
for (const rule of ['X-Robots-Tag: noindex', 'X-Frame-Options: DENY',
  "connect-src 'none'", "form-action 'none'", "frame-ancestors 'none'"]) {
  assert.ok(headers.includes(rule), 'Missing restrictive USA header: ' + rule);
}
const redirects = read('_redirects');
assert.match(redirects, /^\/us\s+\/index\.html\s+200$/m);
assert.match(redirects, /^\/\*\s+\/404\.html\s+404$/m);
assert.doesNotMatch(redirects, /^\/\*\s+\/index\.html\s+200$/m);
const notFound = read('404.html');
assert.match(notFound, /noindex,nofollow/);
assert.doesNotMatch(notFound, /<script\b|<iframe\b|<form\b|http-equiv="refresh"/i);
assert.ok(read('robots.txt').includes('Disallow: /'), 'USA preview must be excluded from crawlers');
const bundle = names.filter(name => /\.(?:js|css|html)$/.test(name)).map(read).join('\n');
for (const forbidden of [
  /onrender\.com/i, /supabase\.co/i, /trynexa\.com\.br/i,
  /nexoffices\.com\.br/i, /mercadopago/i, /foxbit/i, /woovi/i,
  /\/api\/v1\//i, /serviceWorker\.register/i, /manifest\.json/i,
  /internal-transfer\/send/i,
]) {
  assert.ok(!forbidden.test(bundle), 'Forbidden Brazilian integration in USA bundle: ' + forbidden);
}
console.log('PASS: NexOffices USA-only static output, routes, CSP, no BR providers, no PWA');
