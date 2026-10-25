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
assert.match(html, /<html lang="en-US">/);
assert.match(html, /noindex,nofollow/);
assert.match(redirects, /\/us\s+\/index\.html\s+200/);
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
  await page.goto('http://127.0.0.1:4186/', {waitUntil:'domcontentloaded'});
  await page.getByRole('heading', {name:'See how a business command center could work.'}).waitFor();
  await page.getByRole('heading', {name:'Keep every next step visible.'}).waitFor();
  await page.getByLabel('Opportunity title').fill('Demo customer request');
  await page.getByLabel('Fictional organization').fill('Example Corporation');
  await page.getByRole('button', {name:'Add sample opportunity'}).click();
  await page.getByText('Demo customer request').waitFor();
  assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'), 'noindex,nofollow');
  assert.equal(await page.locator('html').getAttribute('lang'), 'en-US');
  assert.deepEqual(errors, [], 'Standalone runtime JavaScript errors');
  assert.deepEqual(backend, [], 'Standalone made an external backend request');
  console.log('PASS: deployable NexOffices USA-only static bundle, standalone CRM and network isolation');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
