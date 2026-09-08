import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
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
test('each homepage language downloads its matching PDF without changing the homepage address',async()=>{
  for (const lang of ['zh', 'en', 'ja']) {
    const filename = `OriginMind_Intelligent_Mobile_Robot_Product_Brochure_${lang.toUpperCase()}.pdf`;
    const home = await worker.fetch(new Request('https://omindos.ai/', {headers:{Cookie:`originmind_language=${lang}`}}),env);
    assert.equal(home.headers.get('Location'),null);
    const html=await home.text();
    assert.ok(html.includes(`download="${filename}"`));
    const r=await worker.fetch(new Request(`https://omindos.ai/assets/brochures/${filename}`),env);
    assert.equal(r.status,200);assert.equal(r.headers.get('Content-Type'),'application/pdf');
    assert.equal(r.headers.get('Content-Disposition'),`attachment; filename="${filename}"`);
    assert.equal(new TextDecoder().decode((await r.arrayBuffer()).slice(0,5)),'%PDF-');
  }
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

const homepageRoot = new URL('../apps/website/', import.meta.url);
const enhancement = await readFile(new URL('homepage-v1511.js', homepageRoot), 'utf8');

test('V1.5.13 orders collapsed capability and field demos while retaining downloads, contact and statistics', async () => {
  for (const lang of ['en', 'zh', 'ja']) {
    const source = await readFile(new URL(`index.${lang}.html`, homepageRoot), 'utf8');
    const sections = [...source.matchAll(/<section\b[^>]*\bid="([^"]+)"/g)].map(match => match[1]);
    assert.deepEqual(sections.slice(0, 6), ['what', 'tasks', 'production', 'why', 'products', 'company']);
    // Two capability pairs lead to warehouse, then mine task examples.
    // Every video starts collapsed; legacy demo anchors remain reachable.
    const groups = [...source.matchAll(/<details\b([^>]*\bid="demo-[^"]+"[^>]*)>([\s\S]*?)<\/details>/g)];
    assert.equal(groups.length, 4);
    const expected = [
      ['demo-navigation', ['1000087152', '1000087155']],
      ['demo-language', ['1000087157', '1000087156']],
      ['demo-pharma', ['1000087160']],
      ['demo-mine', ['1000087153']],
    ];
    for (const [index, [, attrs, contents]] of groups.entries()) {
      const [id, videos] = expected[index];
      assert.ok(attrs.includes(`id="${id}"`));
      assert.doesNotMatch(attrs, /\bopen(?:\s|=|$)/);
      assert.match(contents, /<summary>/);
      assert.deepEqual([...contents.matchAll(/<source src="\/assets\/videos\/(\d+)-web\.mp4"/g)].map(match => match[1]), videos);
    }
    const mobility = source.match(/<section\b[^>]*id="tasks"[^>]*>([\s\S]*?)<\/section>/)[1];
    const field = source.match(/<section\b[^>]*id="production"[^>]*>([\s\S]*?)<\/section>/)[1];
    assert.equal([...mobility.matchAll(/<article\b/g)].length, 2);
    assert.equal([...mobility.matchAll(/<video\b/g)].length, 4);
    assert.equal([...field.matchAll(/<video\b/g)].length, 2);
    for (const id of ['capabilities', 'demo-field', 'demo-mine', 'demo-pharma']) assert.ok(source.includes(`id="${id}"`));
    const ids = [...source.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(ids.length, new Set(ids).size, 'deep links need unique targets');
    for (const id of ['ai-os', 'inspection']) {
      const card = source.match(new RegExp(`<article\\b[^>]*id="${id}"[^>]*>([\\s\\S]*?)<\\/article>`))[1];
      const mail = card.match(/href="(mailto:[^"]+)"/)[1].replaceAll('&amp;', '&');
      const draft = new URL(mail);
      assert.equal(draft.pathname, 'sales@omindos.ai');
      assert.ok(draft.searchParams.get('subject'));
      assert.ok(draft.searchParams.get('body').includes('\n'));
      const detail = await readFile(new URL(`why/${lang}/index.html`, homepageRoot), 'utf8');
      assert.ok(detail.includes(`href="/?lang=${lang}#${id}"`), 'both audiences can return to their homepage entry');
    }
    assert.match(source, /data-nav="production" href="#production"/);
    assert.match(source, new RegExp(`chat\\.omindos\\.ai/widget\\.html\\?lang=${lang}`));
    assert.ok(source.includes(`download="OriginMind_Intelligent_Mobile_Robot_Product_Brochure_${lang.toUpperCase()}.pdf"`));
    assert.match(source, /data-visitor-map hidden aria-hidden="true" style="display: none;"/);
    assert.match(source, /data-sales-email data-sales-email-text/);
    assert.match(source, /originmind-mark-92\.webp/);
    assert.doesNotMatch(source, /homepage-v159|\/meeting(?:["/?#])/);
    const videos = [...source.matchAll(/<video\b([^>]*)>/g)];
    assert.equal(videos.length, 6);
    for (const [, attrs] of videos) {
      assert.match(attrs, /preload="none"/);
      assert.match(attrs, /poster="[^" ]+"/);
      assert.match(attrs, /\bcontrols\b/);
      assert.doesNotMatch(attrs, /\bautoplay\b/);
    }
  }
  assert.equal(await readFile(new URL('index.html', homepageRoot), 'utf8'), await readFile(new URL('index.en.html', homepageRoot), 'utf8'));
});

test('every updated page loads its own styles and keeps the current shared script', async () => {
  for (const page of ['index.html', 'index.en.html', 'index.zh.html', 'index.ja.html', ...['en', 'zh', 'ja'].map(lang => `why/${lang}/index.html`)]) {
    const source = await readFile(new URL(page, homepageRoot), 'utf8');
    assert.match(source, /homepage-v1511\.css/);
    assert.match(source, /homepage-v1511\.js/);
    assert.match(source, /script\.js\?v=20260907-contact/);
    for (const match of source.matchAll(/<link\b[^>]*>/g)) {
      if (!/rel="stylesheet"/.test(match[0])) continue;
      const href = match[0].match(/href="([^"]+)"/)[1].split('?')[0];
      await readFile(new URL(href.startsWith('/') ? href.slice(1) : href, homepageRoot));
    }
  }
});

// A minimal DOM boundary for the dependency-free script. The calls below test
// observable behavior, including fresh elements after the real loader's body swap.
function fixture({ hash = '', clipboard, fallback = false } = {}) {
  const handlers = new Map(), windowHandlers = new Map(), ids = new Map();
  const videos = [], fields = [];
  let observer;
  class Element {
    constructor() { this.parentElement = null; this.dataset = {}; }
    closest(selector) { return this.matches?.[selector] || null; }
  }
  class Details extends Element {
    constructor() { super(); this.open = false; this.videos = []; }
    querySelectorAll() { return this.videos; }
  }
  class Video extends Element {
    constructor() { super(); this.paused = false; this.pauseCalls = 0; }
    pause() { this.paused = true; this.pauseCalls++; }
  }
  const status = { textContent: '' };
  const document = {
    body: { append(field) { fields.push(field); } },
    getElementById: id => ids.get(id),
    querySelector: () => status,
    querySelectorAll: () => videos,
    addEventListener(type, handler) { handlers.set(type, handler); },
    createElement() {
      return { style: {}, setAttribute() {}, select() {}, remove() { this.removed = true; } };
    },
    execCommand: () => fallback,
  };
  const location = { href: 'https://omindos.ai/', origin: 'https://omindos.ai', pathname: '/', hash };
  const window = { isSecureContext: true, addEventListener(type, handler) { windowHandlers.set(type, handler); } };
  const context = {
    window, document, location, navigator: { clipboard }, URL,
    Element, HTMLDetailsElement: Details, HTMLVideoElement: Video,
    MutationObserver: class { constructor(callback) { observer = callback; } observe() {} },
  };
  runInNewContext(enhancement, context);
  const click = target => handlers.get('click')({ target, button: 0 });
  return { handlers, windowHandlers, ids, videos, fields, status, location, Element, Details, Video, click, observer: () => observer(), context };
}

test('task links reveal nested demos after a language body replacement', () => {
  const f = fixture();
  const parent = new f.Details(), inner = new f.Details(), target = new f.Element();
  target.parentElement = inner; inner.parentElement = parent;
  f.ids.set('demo-navigation', target);
  const link = new f.Element();
  link.href = 'https://omindos.ai/#demo-navigation'; link.matches = { 'a[href]': link };
  f.click(link);
  assert.equal(inner.open, true); assert.equal(parent.open, true);
  const translated = new f.Details(); f.ids.set('demo-navigation', translated);
  f.location.hash = '#demo-navigation'; f.observer();
  assert.equal(translated.open, true);
  assert.doesNotThrow(() => { f.location.hash = '#%E0%A4%A'; f.observer(); });
});

test('starting one clip pauses others and collapsing a demo pauses its videos', () => {
  const f = fixture();
  const playing = new f.Video(), other = new f.Video(), paused = new f.Video(); paused.paused = true;
  f.videos.push(playing, other, paused);
  f.handlers.get('play')({ target: playing });
  assert.equal(playing.pauseCalls, 0); assert.equal(other.pauseCalls, 1); assert.equal(paused.pauseCalls, 0);
  const disclosure = new f.Details(); disclosure.videos = [playing];
  f.handlers.get('toggle')({ target: disclosure });
  assert.equal(playing.pauseCalls, 1);
});

test('copying email reports clipboard success and fallback failure without leaving fields', async () => {
  for (const succeeds of [true, false]) {
    let copied;
    const f = fixture({ clipboard: { async writeText(text) { if (!succeeds) throw new Error('denied'); copied = text; } } });
    const button = new f.Element();
    button.dataset = { copyEmail: 'sales@omindos.ai', copySuccess: 'copied', copyFailure: 'copy manually' };
    button.matches = { 'button[data-copy-email]': button }; button.focus = () => {};
    f.click(button);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(button.disabled, false);
    assert.equal(f.status.textContent, succeeds ? 'copied' : 'copy manually');
    assert.equal(copied, succeeds ? 'sales@omindos.ai' : undefined);
    assert.ok(f.fields.every(field => field.removed));
  }
});

test('email selection fallback works and duplicate script execution keeps one handler set', async () => {
  const f = fixture({ fallback: true });
  const originalHandler = f.handlers.get('click');
  runInNewContext(enhancement, f.context);
  assert.equal(f.handlers.get('click'), originalHandler);
  const button = new f.Element();
  button.dataset = { copyEmail: 'sales@omindos.ai', copySuccess: 'copied', copyFailure: 'failed' };
  button.matches = { 'button[data-copy-email]': button }; button.focus = () => {};
  f.click(button);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.status.textContent, 'copied');
  assert.equal(f.fields.length, 1); assert.equal(f.fields[0].removed, true);
});
