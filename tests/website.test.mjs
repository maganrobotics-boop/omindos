import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFile, access } from 'node:fs/promises';
const root = new URL('../apps/website/', import.meta.url);
const source = await readFile(new URL('_worker.js', root), 'utf8');
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const env = { ASSETS: { async fetch(request) {
  const path = new URL(request.url).pathname;
  for (const file of [path, path.endsWith('/') ? `${path}index.html` : `${path}.html`]) {
    try { const body = await readFile(new URL(`.${file}`, root)); return new Response(body, {headers:{'Content-Type':file.endsWith('.html')?'text/html':'application/octet-stream'}}); } catch {}
  }
  return new Response('not found', {status:404});
}}};
for (const [lang, contentLanguage] of [['zh','zh-CN'],['en','en'],['ja','ja-JP']]) {
  for (const path of ['/', '/founding-oem', '/why-originmind']) {
    test(`${lang}: same-address route ${path}`, async () => {
      const url = `https://omindos.ai${path}`;
      const response = await worker.fetch(new Request(url, {headers:{Cookie:`originmind_language=${lang}`}}),env);
      assert.equal(response.status,200); assert.equal(response.headers.get('Content-Language'),contentLanguage);
      assert.equal(response.headers.get('Location'),null); assert.match(response.headers.get('Cache-Control'),/private/);
      assert.match(await response.text(), /<html/);
      const choose = await worker.fetch(new Request(`${url}?lang=${lang}`),env);
      assert.equal(choose.status,302); assert.equal(choose.headers.get('Location'),url);
      assert.match(choose.headers.get('Set-Cookie'),new RegExp(`originmind_language=${lang};`));
    });
  }
}
test('removed meeting pages and APIs return 404 without credentials',async()=>{
  for(const path of ['/meeting','/meeting/','/meeting/display','/meeting/index.page','/api/meeting/login','/api/meeting/realtime-secret','/api/meeting/rooms','/api/meetings']) {
    const r=await worker.fetch(new Request(`https://omindos.ai${path}`),env);assert.equal(r.status,404,path);
  }
  assert.doesNotMatch(source,/MEETING_|OPENAI|api\.openai|CLOUDFLARE_TURN/);
  await assert.rejects(access(new URL('meeting',root)));
});
test('original legacy-host redirects remain',async()=>{
  for(const host of ['originmindos.com','www.originmindos.com','www.omindos.ai','originmindos.cn','jp.originmindos.com']) {
    const r=await worker.fetch(new Request(`https://${host}/`),env); assert.equal(r.status,308);assert.equal(new URL(r.headers.get('Location')).hostname,'omindos.ai');
  }
});
test('visitor statistics binding remains optional and errors are controlled',async()=>{
  const r=await worker.fetch(new Request('https://omindos.ai/api/visits'),env);assert.equal(r.status,503);assert.equal((await r.json()).enabled,false);
  const method=await worker.fetch(new Request('https://omindos.ai/api/visits',{method:'DELETE'}),env);assert.equal(method.status,405);
  const forbidden=await worker.fetch(new Request('https://omindos.ai/api/visits',{method:'POST',headers:{Origin:'https://other.example'}}),{...env,VISITS_DB:{}});assert.equal(forbidden.status,403);
});
test('brochure download remains available',async()=>{
  const r=await worker.fetch(new Request('https://omindos.ai/assets/brochures/OriginMind_Intelligent_Mobile_Robot_Product_Brochure_EN.pdf'),env);
  assert.equal(r.status,200);assert.equal(r.headers.get('Content-Type'),'application/pdf');assert.match(r.headers.get('Content-Disposition'),/attachment/);
});

async function oemFixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(await readFile(new URL('../migrations/website/0002_oem_applications.sql', import.meta.url), 'utf8'));
  function prepare(query, params = []) { return { bind(...values) { return prepare(query, values); }, async first() { return db.prepare(query).get(...params) || null; }, async run() { return db.prepare(query).run(...params); } }; }
  const bound = { ...env, VISITS_DB: { prepare } };
  const payload = { submissionKey: crypto.randomUUID(), language: 'zh', company: 'Example Robotics', contact: 'Test contact', email: 'test@example.com', phone: '', robot: 'Test robot', stack: 'ROS 2', start: '2027', quantity: '', capabilities: 'Navigation', test_unit: 'Available', track: 'foundation', summary: '', consent: true };
  const send = (body = payload, headers = {}, method = 'POST') => worker.fetch(new Request('https://omindos.ai/api/oem-applications', { method, headers: { Origin: 'https://omindos.ai', 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.10', ...headers }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) }), bound);
  return { db, payload, send };
}
test('OEM applications validate input and never expose stored details publicly', async () => {
  const { db, payload, send } = await oemFixture();
  try {
    assert.equal((await send(payload, {}, 'GET')).status, 405);
    assert.equal((await send(payload, { Origin: 'https://other.example' })).status, 403);
    assert.equal((await send(payload, { 'Content-Type': 'text/plain' })).status, 415);
    for (const change of [{ consent: false }, { email: 'a@b\nBcc:bad@example.com' }, { company: '' }, { track: 'invalid' }, { language: 'de' }, { capabilities: 'x'.repeat(3001) }, { website: 'bot' }, { submissionKey: 'bad' }]) assert.equal((await send({ ...payload, ...change })).status, 400, JSON.stringify(change).slice(0, 100));
    assert.equal((await send({ ...payload, summary: 'x'.repeat(40000) })).status, 413);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM oem_applications').get().n, 0);
  } finally { db.close(); }
});
test('OEM retries, simultaneous retries and changed content preserve one correct receipt', async () => {
  const { db, payload, send } = await oemFixture();
  try {
    const results = await Promise.all([send(), send(), send()]);
    assert.ok(results.every((r) => [200, 201].includes(r.status)));
    const receipts = await Promise.all(results.map((r) => r.json()));
    assert.match(receipts[0].receipt, /^OEM-[0-9a-f-]{36}$/);
    assert.deepEqual(receipts[0], receipts[1]); assert.deepEqual(receipts[1], receipts[2]);
    assert.deepEqual(Object.keys(receipts[0]), ['receipt']);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM oem_applications').get().n, 1);
    assert.equal((await send({ ...payload, company: 'Changed company' })).status, 409);
    assert.equal(JSON.parse(db.prepare('SELECT payload_json FROM oem_applications').get().payload_json).company, 'Example Robotics');
  } finally { db.close(); }
});
test('OEM limits repeated new submissions while allowing safe retries', async () => {
  const { db, payload, send } = await oemFixture();
  try {
    assert.equal((await send()).status, 201);
    const responses = await Promise.all(Array.from({ length: 11 }, () => send({ ...payload, submissionKey: crypto.randomUUID() })));
    assert.equal(responses.filter((r) => r.status === 201).length, 9);
    assert.equal(responses.filter((r) => r.status === 429).length, 2);
    assert.equal((await send()).status, 200);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM oem_applications').get().n, 10);
  } finally { db.close(); }
});
