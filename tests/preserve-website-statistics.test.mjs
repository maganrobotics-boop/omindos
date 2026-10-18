import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { baselineFile, preserveWorker, preserveClient } from '../scripts/preserve-website-statistics.mjs';

const current = await readFile(new URL('../apps/website/_worker.js', import.meta.url), 'utf8');
const currentClient = await readFile(new URL('../apps/website/portal-client.js', import.meta.url), 'utf8');
const baseline = process.env.WEBSITE_TEST_BASELINE_DIR
  ? await readFile(resolve(process.env.WEBSITE_TEST_BASELINE_DIR, 'baseline-worker.js'), 'utf8')
  : baselineFile('apps/website/_worker.js');
const baselineClient = process.env.WEBSITE_TEST_BASELINE_DIR
  ? await readFile(resolve(process.env.WEBSITE_TEST_BASELINE_DIR, 'baseline-portal-client.js'), 'utf8')
  : baselineFile('apps/website/portal-client.js');
const preserved = preserveWorker(current, baseline);
const preservedClient = preserveClient(currentClient, baselineClient);
const worker = (await import('data:text/javascript;base64,' + Buffer.from(preserved).toString('base64'))).default;

test('page-only artifact retains production analytics without a v2 schema dependency', () => {
  assert.doesNotMatch(preserved, /visit_\w+_v2|visitClassification|visitAcknowledgement/);
  for (const name of ['recordVisit', 'handleVisits']) {
    const extract = source => source.match(new RegExp(`(?:async )?function ${name}\\([\\s\\S]*?^}`, 'm'))[0];
    assert.equal(extract(preserved), extract(baseline));
  }
  // All routing, security headers, asset serving and OEM logic stay current.
  const strip = source => source
    .replace(/function isSame(?:Origin|Site)BrowserRequest\([\s\S]*?(?=async function digestText\()/, '')
    .replace(/async function recordVisit\([\s\S]*?(?=function languageForHostname\()/, '');
  assert.equal(strip(preserved), strip(current));
  assert.equal(preservedClient, baselineClient);
  assert.throws(() => preserveWorker(current.replace('async function recordVisit(', 'async function changedVisit('), baseline));
  assert.throws(() => preserveClient(currentClient.replace('const home =', 'let home ='), baselineClient));
});

test('preserved collector writes only existing tables and retains API privacy', async () => {
  const statements = [];
  const database = {
    prepare(sql) { assert.doesNotMatch(sql, /_v2/); return { sql, bind(...params) { this.params = params; return this; } }; },
    async batch(items) { statements.push(...items); },
  };
  const request = new Request('https://omindos.ai/api/visits', { method: 'POST', headers: { Origin: 'https://omindos.ai', 'Content-Type': 'application/json' }, body: '{}' });
  Object.defineProperty(request, 'cf', { value: { country: 'CN' } });
  assert.equal((await worker.fetch(request, { VISITS_DB: database }, {})).status, 204);
  assert.equal(statements.length, 4);
  assert.deepEqual(statements.map(item => item.sql.match(/(?:INTO|FROM) (\w+)/)[1]), ['visit_totals', 'visit_recent', 'visit_country', 'visit_recent']);
  assert.equal(statements[2].params[0], 'CN');
  assert.equal((await worker.fetch(new Request(request.url), { VISITS_DB: database }, {})).status, 405);
  assert.equal((await worker.fetch(new Request(request.url, { method: 'POST', headers: { Origin: 'https://other.example' } }), { VISITS_DB: database }, {})).status, 403);
  assert.equal((await worker.fetch(new Request(request.url, { method: 'POST', headers: { Origin: 'https://omindos.ai' } }), {}, {})).status, 503);
  assert.equal(statements.length, 4);
});

test('English entry and explicit Chinese selection retain current routing', async () => {
  for (const [path, status, location] of [
    ['/?source=release', 302, 'https://omindos.ai/en/?source=release'],
    ['/?lang=zh&source=release', 308, 'https://omindos.cn/?source=release'],
    ['/cn/robots/', 308, 'https://omindos.cn/robots/'],
  ]) {
    const response = await worker.fetch(new Request('https://omindos.ai' + path), {}, {});
    assert.equal(response.status, status); assert.equal(response.headers.get('Location'), location);
  }
});

test('preserved browser client remains compatible with anonymous same-origin collection', () => {
  for (const host of ['omindos.ai', 'omindos.cn']) {
    const calls = [];
    runInNewContext(preservedClient, {
      document: { querySelectorAll: () => [] }, location: { hostname: host, origin: 'https://' + host, pathname: '/en/' }, URL, AbortSignal,
      fetch(url, options) { calls.push({ url, options }); return Promise.resolve({ body: { cancel() {} } }); },
    });
    assert.equal(calls.length, host === 'omindos.ai' ? 1 : 0);
    if (calls.length) { assert.equal(calls[0].url, '/api/visits'); assert.equal(calls[0].options.body, '{}'); }
  }
});

test('final artifact contains exactly the tested collector and current English assets', { skip: !process.env.WEBSITE_ARTIFACT }, async () => {
  const artifact = process.env.WEBSITE_ARTIFACT;
  assert.equal(await readFile(resolve(artifact, '_worker.js'), 'utf8'), preserved);
  assert.equal(await readFile(resolve(artifact, 'portal-client.js'), 'utf8'), preservedClient);
  for (const path of ['en/index.html', 'en/home-20261018.css', 'en/site-20261018.js']) {
    assert.equal(await readFile(resolve(artifact, path), 'utf8'), await readFile(new URL('../apps/website/' + path, import.meta.url), 'utf8'));
  }
});
