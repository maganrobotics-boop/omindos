import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { runInNewContext } from 'node:vm';

const root = new URL('../apps/website/', import.meta.url);
const source = await readFile(new URL('_worker.js', root), 'utf8');
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const migration = await readFile(new URL('../migrations/website/0003_filtered_visit_stats.sql', import.meta.url), 'utf8');
const collector = await readFile(new URL('portal-client.js', root), 'utf8');

async function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(await readFile(new URL('0001_visit_stats.sql', root), 'utf8'));
  db.exec("UPDATE visit_totals SET visits = 523; INSERT INTO visit_country VALUES ('CN', 523)");
  db.exec(migration);
  db.exec(migration); // Safe on a later deployment or rollback/release retry.
  function prepare(sql, values = []) { return { sql, values, bind(...args) { return prepare(sql, args); } }; }
  const env = {
    ASSETS: { async fetch() { return new Response('<!doctype html><html lang="en"><main>Content</main></html>', { headers: { 'Content-Type': 'text/html' } }); } },
    VISITS_DB: { prepare, async batch(statements) {
      db.exec('BEGIN');
      try { const results = statements.map(item => db.prepare(item.sql).run(...item.values)); db.exec('COMMIT'); return results; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    } },
  };
  function send({ headers = {}, cf, method = 'POST', path = '/api/visits', origin = true, hostname = 'omindos.ai' } = {}) {
    const request = new Request(`https://${hostname}${path}`, { method, headers: { ...(origin ? { Origin: `https://${hostname}` } : {}), ...headers } });
    if (cf !== undefined) Object.defineProperty(request, 'cf', { value: cf });
    return worker.fetch(request, env);
  }
  const counts = () => Object.fromEntries(db.prepare('SELECT classification, visits FROM visit_totals_v2').all().map(row => [row.classification, row.visits]));
  return { db, send, counts };
}

test('new aggregates preserve the legacy era and isolate unknown and scored accepted page views', async () => {
  const { db, send, counts } = await fixture();
  try {
    assert.equal(db.prepare('SELECT COUNT(*) n FROM visit_collection_v2').get().n, 0);
    assert.equal((await send({ cf: { country: 'us' } })).status, 204);
    assert.equal((await send({ cf: { country: 'DE', botManagement: { score: 78 } } })).status, 204);
    assert.deepEqual(counts(), { accepted_unknown: 1, accepted_scored: 1 });
    assert.equal(db.prepare('SELECT visits FROM visit_totals').get().visits, 523);
    assert.deepEqual({ ...db.prepare('SELECT * FROM visit_country').get() }, { country_code: 'CN', visits: 523 });
    const first = db.prepare('SELECT first_event_at, metric FROM visit_collection_v2').get();
    assert.equal(first.metric, 'filtered_page_views');
    assert.ok(Math.abs(first.first_event_at - Date.now()) < 5000);
    const countries = db.prepare('SELECT country_code FROM visit_country_v2 ORDER BY country_code').all().map(row => row.country_code);
    assert.deepEqual(countries, ['DE', 'US']);
    db.exec("INSERT INTO visit_recent_v2 VALUES (0, 'US', 'accepted_unknown', 4)");
    await send();
    assert.equal(db.prepare('SELECT COUNT(*) n FROM visit_recent_v2 WHERE minute_bucket = 0').get().n, 0);
    assert.equal(db.prepare('SELECT first_event_at FROM visit_collection_v2').get().first_event_at, first.first_event_at);
    assert.deepEqual(db.prepare('PRAGMA table_info(visit_recent_v2)').all().map(row => row.name), ['minute_bucket', 'country_code', 'classification', 'visits']);
  } finally { db.close(); }
});

test('trusted bot metadata, explicit automation and preloads are audit events, not accepted views', async () => {
  const { db, send, counts } = await fixture();
  try {
    for (const data of [
      { cf: { botManagement: { verifiedBot: true, score: 99 } } },
      { cf: { botManagement: { score: 1 } } },
      { cf: { botManagement: { score: 29 } } },
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' } },
      { headers: { 'User-Agent': 'Mozilla/5.0 HeadlessChrome/129.0.0' } },
      { headers: { 'User-Agent': 'curl/8.0' } },
      { headers: { 'Sec-Purpose': 'prefetch;prerender' } },
      { headers: { Purpose: 'prefetch' } },
    ]) {
      const response = await send(data);
      assert.equal(response.status, 204);
      assert.equal(await response.text(), '');
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
    }
    assert.deepEqual(counts(), { excluded_verified_bot: 1, excluded_low_score: 2, excluded_automation_ua: 3, excluded_prefetch: 2 });
    const response = await send({ method: 'GET', path: '/en/about/', cf: { botManagement: { verifiedBot: true, score: 1 } }, headers: { 'User-Agent': 'Googlebot/2.1' } });
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Content/);
  } finally { db.close(); }
});

test('unknown scores, specific browser names, proxy users and fake score headers are not treated as confirmed bots', async () => {
  const { db, send, counts } = await fixture();
  try {
    for (const score of [undefined, 0, -1, 100, '1']) await send({ cf: { botManagement: { score } } });
    await send({ cf: { botManagement: { score: 1, corporateProxy: true } } });
    await send({ cf: { botManagement: { score: 30 } } });
    await send({ headers: { 'User-Agent': 'RobotBrowser/2.0 Mobile Safari/537.36', 'CF-Bot-Score': '1', 'CF-Verified-Bot': 'true' } });
    assert.deepEqual(counts(), { accepted_unknown: 6, accepted_scored: 2 });
  } finally { db.close(); }
});

test('cross-origin and sibling-subdomain writes fail before touching counters, while exact same-origin fallback works', async () => {
  const { db, send, counts } = await fixture();
  try {
    for (const data of [
      { headers: { Origin: 'https://omindos.cn' } },
      { headers: { Origin: 'https://oa.omindos.ai' } },
      { headers: { 'Sec-Fetch-Site': 'same-site' } },
      { headers: { 'Sec-Fetch-Site': 'cross-site' } },
      { origin: false, headers: { 'Sec-Fetch-Site': 'same-site' } },
      { origin: false },
      { headers: { Origin: 'null', 'Sec-Fetch-Site': 'same-origin' } },
    ]) assert.equal((await send(data)).status, 403);
    assert.deepEqual(counts(), {});
    assert.equal((await send({ origin: false, headers: { 'Sec-Fetch-Site': 'same-origin' } })).status, 204);
    assert.equal((await send({ headers: { 'Sec-Fetch-Site': 'same-origin' } })).status, 204);
    assert.deepEqual(counts(), { accepted_unknown: 2 });
    const read = await send({ method: 'GET' });
    assert.equal(read.status, 405);
    assert.doesNotMatch(await read.text(), /accepted|excluded|visits|countries|first_event_at/);
  } finally { db.close(); }
});

function browser({ hostname = 'omindos.ai', visible = true, prerendering = false, webdriver = false } = {}) {
  const calls = [], listeners = new Map();
  const document = {
    visibilityState: visible ? 'visible' : 'hidden', prerendering,
    querySelectorAll: () => [],
    addEventListener(type, handler) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(handler); },
    removeEventListener(type, handler) { listeners.get(type)?.delete(handler); },
  };
  const context = { document, navigator: { webdriver }, location: new URL(`https://${hostname}/en/about/`), AbortSignal,
    fetch(...args) { calls.push(args); return Promise.resolve({ body: { cancel() {} } }); } };
  return { document, calls, run() { runInNewContext(collector, context); },
    fire(type) { for (const handler of [...listeners.get(type) || []]) handler(); } };
}

test('collector waits for visibility and prerender activation and emits only once per document', () => {
  const page = browser({ visible: false, prerendering: true });
  page.run(); page.run();
  assert.equal(page.calls.length, 0);
  page.document.visibilityState = 'visible'; page.fire('visibilitychange');
  assert.equal(page.calls.length, 0);
  page.document.prerendering = false; page.fire('prerenderingchange');
  assert.equal(page.calls.length, 1);
  page.fire('visibilitychange'); page.run();
  assert.equal(page.calls.length, 1);
  assert.equal(page.calls[0][0], '/api/visits');
  assert.equal(page.calls[0][1].method, 'POST');
  assert.equal(page.calls[0][1].credentials, 'same-origin');
  const secondDocument = browser(); secondDocument.run();
  assert.equal(secondDocument.calls.length, 1, 'a new document/refresh is another page view, not a unique person');
});

test('Chinese documents, preview aliases and WebDriver sessions do not write to the English collection', () => {
  for (const hostname of ['omindos.cn', 'www.omindos.cn', 'omindos-website.pages.dev', 'preview.omindos-website.pages.dev', 'localhost', 'originmindos.com', 'www.omindos.ai']) {
    const page = browser({ hostname }); page.run(); page.fire('visibilitychange');
    assert.equal(page.calls.length, 0);
  }
  const automated = browser({ webdriver: true }); automated.run();
  assert.equal(automated.calls.length, 0);
});


test('server excludes Pages aliases and previews even if they share production D1', async () => {
  const { db, send, counts } = await fixture();
  try {
    for (const hostname of ['omindos-website.pages.dev', 'preview.omindos-website.pages.dev', 'localhost', 'omindos.cn']) {
      const response = await send({ hostname });
      assert.equal(response.status, 204, hostname);
      assert.equal(await response.text(), '');
    }
    assert.deepEqual(counts(), {});
    assert.equal(db.prepare('SELECT COUNT(*) n FROM visit_collection_v2').get().n, 0);
    assert.equal((await send()).status, 204);
    assert.deepEqual(counts(), { accepted_unknown: 1 });
  } finally { db.close(); }
});
