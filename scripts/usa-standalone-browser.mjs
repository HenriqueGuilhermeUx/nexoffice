/** Validate the deployable US-only static bundle; no Brazilian application entrypoint. */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright';

const output = 'apps/web/dist-usa';
const html = readFileSync(join(output, 'index.html'), 'utf8');
const redirects = readFileSync(join(output, '_redirects'), 'utf8');
const usIndex = readFileSync(join(output, 'us', 'index.html'), 'utf8');
const crawlerRules = readFileSync(join(output, 'robots.txt'), 'utf8');
assert.equal(usIndex, html, 'Render /us/ must render the exact isolated USA app');
assert.ok(crawlerRules.split('\n').some(line => line.trim() === 'Disallow: /'), 'Crawler rules must disallow all staging paths');

const headers = readFileSync(join(output, '_headers'), 'utf8');
assert.match(headers, /X-Robots-Tag: noindex, nofollow/);
assert.match(headers, /connect-src 'none'/);
assert.match(headers, /frame-ancestors 'none'/);

assert.match(html, /<html lang="en-US">/);
// The isolated bundle must disclose the exact source revision, or explicitly
// say unverified. Never infer a Render deployment SHA from a passing browser test.
const expectedSourceSha = process.env.RENDER_GIT_COMMIT || process.env.USA_PREVIEW_SOURCE_SHA || 'unverified';
assert.ok(expectedSourceSha === 'unverified' || /^[a-f0-9]{40}$/i.test(expectedSourceSha),
  'Expected USA source SHA must be a full commit hash');
const embeddedSourceSha = html.match(/<meta\s+name="usa-preview-source-sha"\s+content="([^"]+)"/i)?.[1];
assert.equal(embeddedSourceSha, expectedSourceSha, 'USA static bundle source SHA is missing or incorrect');
assert.match(html, /<meta\s+name="usa-preview-source"\s+content="(?:render|ci|unverified)"/i,
  'USA static bundle must identify its source SHA provenance');
assert.match(html, /noindex,nofollow/);
assert.match(redirects, /^\\/us\\s+\\/index\\.html\\s+200$/m);
assert.match(redirects, /^\\/us\\/\\s+\\/index\\.html\\s+200$/m);
assert.match(redirects, /^\\/\\*\\s+\\/404\\.html\\s+404$/m,
  'Netlify must return a 404 for disabled Brazilian and API routes');
assert.doesNotMatch(redirects, /^\\/us\\/\\*\\s+\\/index\\.html\\s+200$/m,
  'No catch-all USA SPA rewrite is permitted');
assert.doesNotMatch(redirects, /^\\/\\*\\s+\\/index\\.html\\s+200$/m,
  'No global SPA rewrite is permitted');
const notFound = readFileSync(join(output, '404.html'), 'utf8');
assert.match(notFound, /<html lang="en-US">/);
assert.match(notFound, /noindex,nofollow/);
assert.match(notFound, /Page not available in this preview/);
assert.match(notFound, /href="\\/us\\/"/);
const assets = readdirSync(join(output, 'assets')).filter(file => file.endsWith('.js'));
assert.ok(assets.length, 'Expected built JS chunks');
const js = assets.map(file => readFileSync(join(output, 'assets', file), 'utf8')).join('\n');
for (const forbidden of ['trynexa.com.br/api', 'nexoffices.com.br/api', 'supabase.co', 'receiving-account-onboarding', 'internal-transfer/send']) {
  assert.ok(!js.includes(forbidden), 'Unexpected Brazilian integration string in standalone output: ' + forbidden);
}

const server = spawn('python3', ['-m', 'http.server', '4186', '--bind', '127.0.0.1', '--directory', output], {stdio:'ignore'});
let browser;
try {
  let live = false;
  for (let i = 0; i < 50; i++) {
    if (server.exitCode !== null) throw new Error('Isolated static server exited');
    try { if ((await fetch('http://127.0.0.1:4186/')).ok) { live = true; break; } }
    catch { /* starting */ }
    await sleep(300);
  }
  assert.ok(live, 'US static build did not serve');
  browser = await chromium.launch({headless:true});
  const page = await browser.newPage({ viewport: {width:390,height:844} });
  const errors=[], backend=[];
  page.on('pageerror', error=>errors.push(error.message));
  page.on('request', r=>{
    if (/supabase\.co|onrender\.com|\/api\//i.test(r.url())) backend.push(r.url());
  });
  await page.goto('http://127.0.0.1:4186/us/', {waitUntil:'domcontentloaded'});
  await page.getByRole('heading', {name:'One place to keep the business moving.'}).waitFor();
  assert.equal(await page.locator('a[href^="http://"], a[href^="https://"]').count(), 0,
    'US-only preview must not send visitors to external or Brazilian sites');
  assert.equal(await page.locator('meta[name="usa-preview-source-sha"]').getAttribute('content'),
    expectedSourceSha, 'Published /us/ HTML must expose the exact build source SHA');
  assert.equal(new URL(page.url()).pathname, '/us/', 'Render staging must support direct /us/ loading');
  await page.goto('http://127.0.0.1:4186/', {waitUntil:'domcontentloaded'});
  await page.getByRole('heading', {name:'See how a business command center could work.'}).waitFor();
  await page.getByRole('heading', {name:'Keep every next step visible.'}).waitFor();
  await page.getByLabel('Opportunity title').fill('Demo customer request');
  await page.getByLabel('Fictional organization').fill('Example Corporation');
  await page.getByRole('button', {name:'Add sample opportunity'}).click();
  await page.locator('.avsp-list').getByText('Demo customer request').waitFor();
  assert.ok((await page.locator('.avhub-events article').count()) > 0, 'Live CRM sample must report to the integrated feed');
  // The US-only deployable artifact must include the document review experience.
  await page.getByRole('heading', {name:'Know exactly what needs review.'}).waitFor();
  await page.getByLabel('Fictional document title').fill('Fictional policy outline');
  await page.getByLabel('Reviewer team').selectOption('Legal');
  await page.getByRole('button', {name:'Add sample document'}).click();
  assert.equal(await page.locator('.avdr-list article').count(), 4);
  await page.getByLabel('Fictional policy outline review stage').selectOption('Approved');
  assert.equal((await page.locator('.avdr-counts strong').nth(2).innerText()).trim(), '2');
  await page.getByRole('button', {name:'Reset reviews'}).click();
  assert.equal(await page.locator('.avdr-list article').count(), 3);
  assert.equal(await page.locator('.avdr-activity li').count(), 0);
  await page.getByRole('heading', { name: 'Know exactly what needs review.' }).waitFor();
  assert.equal(await page.locator('.avdr-list article').count(), 3);
  await page.getByLabel('Fictional document title').fill('Fictional NDA review');
  await page.getByRole('button', { name: 'Add sample document' }).click();
  await page.getByLabel('Fictional NDA review review stage').selectOption('In review');
  assert.equal(await page.locator('.avdr-list article').count(), 4);
  await page.reload({ waitUntil: 'domcontentloaded' });
  assert.equal(await page.locator('.avhub-events article').count(), 0, 'Standalone integrated demo must not persist');
  await page.getByRole('heading', { name: 'Know exactly what needs review.' }).waitFor();
  assert.equal(await page.locator('.avdr-list article').count(), 3, 'Review input cannot persist');
  assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'), 'noindex,nofollow');
  await page.getByRole('link', { name: 'Review docs' }).click();
  assert.equal(new URL(page.url()).hash, '#sample-documents', 'Interactive review navigation must point to a real section');
  await page.getByRole('link', { name: 'Try tasks' }).click();
  assert.equal(new URL(page.url()).hash, '#sample-tasks', 'Tasks navigation must point to a real section');
  const widths = await page.evaluate(() => ({viewport:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
  assert.ok(widths.scroll <= widths.viewport + 2, 'US mobile preview overflows horizontally');
  await page.getByRole('heading', { name: 'Turn scattered signals into a next-step briefing.' }).waitFor();
  await page.getByRole('button', {name:'Prepare sample brief'}).click();
  assert.equal(await page.locator('.avcb-list article').count(), 2);
  await page.reload({waitUntil:'domcontentloaded'});
  assert.equal(await page.locator('.avcb-list article').count(), 0, 'Fictional coordination brief cannot persist');
  assert.equal(await page.locator('html').getAttribute('lang'), 'en-US');
  const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  assert.match(policy, /connect-src 'none'/);
  const blockedByCsp = await page.evaluate(async () => {
    try {
      await fetch('/blocked-csp-check');
      return false;
    } catch {
      return true;
    }
  });
  assert.equal(blockedByCsp, true, 'Standalone preview must block even same-origin fetches');

  assert.deepEqual(errors, [], 'Standalone runtime JavaScript errors');
  assert.deepEqual(backend, [], 'Standalone made an external backend request');
  console.log('PASS: deployable NexOffices USA-only static bundle, standalone CRM and network isolation');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
