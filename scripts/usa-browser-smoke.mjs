/** NexOffices USA browser QA: a real rendered preview with fictional tasks only. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright';

const base = 'http://127.0.0.1:4184';
const server = spawn(process.execPath, [resolve('node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', '4184', '--strictPort'], {
  cwd: 'apps/web',
  env: { ...process.env, VITE_API_URL: 'http://127.0.0.1:65535' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
for (const stream of [server.stdout, server.stderr]) stream.on('data', bytes => { output += String(bytes).slice(-2400); });
let browser;
try {
  let started = false;
  for (let retry = 0; retry < 60; retry++) {
    if (server.exitCode !== null) throw new Error('Preview process ended: ' + output);
    try { if ((await fetch(base + '/us')).ok) { started = true; break; } }
    catch { /* waiting for local server */ }
    await sleep(500);
  }
  assert.ok(started, 'Vite production preview failed to start: ' + output);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const backendRequests = [];
  const scriptErrors = [];
  page.on('request', request => {
    if (/onrender\.com|supabase\.co|\/api\//i.test(request.url())) backendRequests.push(request.url());
  });
  page.on('pageerror', error => scriptErrors.push(error.message));
  await page.goto(base + '/us', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.getByRole('heading', { name: 'See how a business command center could work.' }).waitFor();
  // US routes must never fall back into the Brazilian authenticated app or legal page.
  await page.goto(base + '/us?app&legal&material=11111111-1111-4111-8111-111111111111', { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'See how a business command center could work.' }).waitFor();

  assert.equal(await page.locator('html').getAttribute('lang'), 'en-US');
  assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'), 'noindex,nofollow');

  const metric = async index => Number((await page.locator('.avnw-metrics strong').nth(index).innerText()).trim());
  assert.equal(await metric(0), 3);
  assert.equal(await metric(1), 2);
  assert.equal(await metric(2), 1);
  await page.getByLabel('Task description').fill('Review fictional US contract');
  await page.getByLabel('Team owner').selectOption('Operations');
  await page.getByRole('button', { name: 'Add sample task' }).click();
  await page.locator('.avnw-list').getByText('Review fictional US contract').waitFor();
  assert.ok((await page.locator('.avhub-events article').count()) >= 1, 'Task creation must appear in shared activity feed');
  assert.equal(await metric(0), 4);
  assert.equal(await metric(1), 3);
  const target = page.locator('.avnw-list article').last();
  await target.getByLabel('Stage').selectOption('Completed');
  assert.equal(await metric(1), 2);
  assert.equal(await metric(2), 2);
  await page.getByRole('button', { name: 'Reset board' }).click();
  assert.equal(await metric(0), 3);
  assert.equal(await page.locator('.avnw-list').getByText('Review fictional US contract').count(), 0);
  await page.getByRole('heading', { name: 'Keep every next step visible.' }).waitFor();
  const opportunities = page.locator('.avsp-list article');
  assert.equal(await opportunities.count(), 3);
  await page.getByLabel('Opportunity title').fill('Sample US proposal');
  await page.getByLabel('Fictional organization').fill('Example Consulting');
  await page.getByRole('button', { name: 'Add sample opportunity' }).click();
  assert.ok((await page.locator('.avhub-events article').count()) >= 2, 'CRM must report activity to the shared feed');
  assert.equal(await opportunities.count(), 4);
  await page.getByLabel('Sample US proposal stage').selectOption('Won');
  const wonCount = page.locator('.avsp-stats article').last().locator('strong');
  assert.equal((await wonCount.innerText()).trim(), '1');
  await page.getByLabel('Filter stage').selectOption('Won');
  assert.equal(await opportunities.count(), 1);
  await page.getByRole('button', { name: 'Reset pipeline' }).click();
  assert.equal(await opportunities.count(), 3);
  assert.equal((await wonCount.innerText()).trim(), '0');

  // Document review: fictional creation, stage changes, simulated activity, reset and reload.
  await page.getByRole('heading', { name: 'Know exactly what needs review.' }).waitFor();
  const reviews = page.locator('.avdr-list article');
  const docMetric = async index => Number((await page.locator('.avdr-counts strong').nth(index).innerText()).trim());
  assert.equal(await reviews.count(), 3);
  assert.equal(await docMetric(0), 3);
  assert.equal(await docMetric(1), 1);
  assert.equal(await docMetric(2), 1);
  await page.getByLabel('Fictional document title').fill('Example US review checklist');
  await page.getByLabel('Reviewer team').selectOption('Legal');
  await page.getByRole('button', { name: 'Add sample document' }).click();
  assert.equal(await reviews.count(), 4);
  await page.getByLabel('Filter demo activity').selectOption('Documents');
  assert.ok((await page.locator('.avhub-events article').count()) >= 1, 'Document review must report to the shared feed');
  await page.getByLabel('Filter demo activity').selectOption('All');
  assert.equal(await docMetric(0), 4);
  await page.getByLabel('Example US review checklist review stage').selectOption('In review');
  assert.equal(await docMetric(1), 2);
  await page.getByLabel('Example US review checklist review stage').selectOption('Approved');
  assert.equal(await docMetric(1), 1);
  assert.equal(await docMetric(2), 2);
  assert.ok((await page.locator('.avdr-activity li').count()) >= 2);
  await page.getByRole('button', { name: 'Reset reviews' }).click();
  assert.equal(await reviews.count(), 3);
  assert.equal(await page.locator('.avdr-activity li').count(), 0);
  await page.getByLabel('Fictional document title').fill('Ephemeral review');
  await page.getByRole('button', { name: 'Add sample document' }).click();
  assert.equal(await reviews.count(), 4);
  await page.reload({ waitUntil: 'domcontentloaded' });
  assert.equal(await page.locator('.avhub-events article').count(), 0, 'Shared workflow must not persist after page reload');
  await page.getByRole('heading', { name: 'Know exactly what needs review.' }).waitFor();
  assert.equal(await page.locator('.avdr-list article').count(), 3);
  assert.equal(await page.getByText('Ephemeral review').count(), 0);
  await page.getByRole('heading', { name: 'Know exactly what needs review.' }).waitFor();
  const reviewRows = page.locator('.avdr-list article');
  assert.equal(await reviewRows.count(), 3);
  await page.getByLabel('Fictional document title').fill('Fictional US contract checklist');
  await page.getByLabel('Reviewer team', { exact: true }).selectOption('Legal');
  await page.getByRole('button', { name: 'Add sample document' }).click();
  assert.equal(await reviewRows.count(), 4);
  await page.getByLabel('Fictional US contract checklist review stage').selectOption('In review');
  await page.getByText('Fictional US contract checklist: Draft → In review').waitFor();
  assert.equal(await page.locator('.avdr-counts strong').nth(1).innerText(), '2');
  await page.getByLabel('Fictional US contract checklist review stage').selectOption('Approved');
  assert.equal(await page.locator('.avdr-counts strong').nth(2).innerText(), '2');
  await page.getByRole('button', { name: 'Reset reviews' }).click();
  assert.equal(await reviewRows.count(), 3);
  assert.equal(await page.locator('.avdr-activity li').count(), 0);
  await page.getByRole('heading', { name: 'Turn scattered signals into a next-step briefing.' }).waitFor();
  await page.getByLabel('Sample team focus').selectOption('Sales');
  await page.getByRole('button', {name:'Prepare sample brief'}).click();
  await page.getByText('Sales sample briefing').waitFor();
  assert.equal(await page.locator('.avcb-list article').count(), 2);
  await page.getByRole('button', {name:'Mark Follow up on a sample proposal as reviewed'}).click();
  await page.getByText('1 of 2 reviewed').waitFor();
  await page.getByRole('button', {name:'Reset briefing'}).click();
  assert.equal(await page.locator('.avcb-list article').count(), 0);
  assert.equal(backendRequests.length, 0, 'US preview contacted a Brazilian API: ' + backendRequests.join(', '));
  assert.deepEqual(scriptErrors, [], 'Unexpected browser runtime errors');
  console.log('PASS: NexOffices USA mobile task board, role labels, local mutation, reset and no BR API calls');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
