import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const root = new URL('../apps/website/', import.meta.url);
const load = path => readFile(new URL(path, root), 'utf8');

function cacheKey(value, origin) {
  return new URL(typeof value === 'string' ? value : value.url, origin).href;
}

async function workerFixture(origin = 'https://omindos.cn', online = true) {
  const handlers = new Map();
  const stores = new Map();
  const calls = { fetch: [], requests: [], deleted: [], skipped: 0, claimed: 0 };
  const location = new URL(origin + '/pwa/sw.js');
  const fetch = async value => {
    const url = cacheKey(value, origin);
    calls.fetch.push(url);
    calls.requests.push(value);
    if (!online) throw new TypeError('Offline');
    const pathname = new URL(url).pathname;
    if (pathname.startsWith('/pwa/offline-')) {
      const response = new Response(await load(pathname.slice(1)), { headers: { 'Content-Type': 'text/html' } });
      // Cloudflare Pages may redirect an explicit *.html request to a clean URL.
      Object.defineProperty(response, 'redirected', { value: true });
      return response;
    }
    return new Response('network:' + pathname, { headers: { 'Content-Type': 'text/plain' } });
  };
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async match(value) { return store.get(cacheKey(value, origin))?.clone(); },
        async put(value, response) { store.set(cacheKey(value, origin), response.clone()); },
        async addAll(values) {
          for (const value of values) store.set(cacheKey(value, origin), await fetch(value));
        },
        async add(value) { store.set(cacheKey(value, origin), await fetch(value)); },
      };
    },
    async match(value) {
      const key = cacheKey(value, origin);
      for (const store of stores.values()) if (store.has(key)) return store.get(key).clone();
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { calls.deleted.push(name); return stores.delete(name); },
  };
  const self = {
    location,
    addEventListener(type, handler) { handlers.set(type, handler); },
    async skipWaiting() { calls.skipped++; },
    clients: { async claim() { calls.claimed++; } },
    registration: { scope: origin + '/' },
  };
  class BrowserRequest extends Request {
    constructor(value, init) { super(typeof value === 'string' ? new URL(value, origin) : value, init); }
  }
  runInNewContext(await load('pwa/sw.js'), { self, location, caches, fetch, URL, Request: BrowserRequest, Response, Headers, console });
  async function lifecycle(type) {
    const pending = [];
    handlers.get(type)?.({ waitUntil(promise) { pending.push(Promise.resolve(promise)); } });
    await Promise.all(pending);
  }
  async function request(path, options = {}) {
    let response;
    let handled = false;
    const pending = [];
    const request = { url: new URL(path, origin).href, method: 'GET', mode: 'navigate', headers: new Headers(), ...options };
    handlers.get('fetch')({
      request,
      respondWith(promise) { handled = true; response = Promise.resolve(promise); },
      waitUntil(promise) { pending.push(Promise.resolve(promise)); },
    });
    const result = handled ? await response : undefined;
    await Promise.all(pending);
    return { handled, response: result };
  }
  return { handlers, stores, calls, caches, lifecycle, request, goOffline() { online = false; } };
}

test('PWA manifests keep stable language-specific installation identities', async () => {
  for (const [locale, language, id, start, scope] of [
    ['zh', 'zh-CN', '/', '/?source=pwa', '/'],
    ['en', 'en', '/en/', '/en/?source=pwa', '/en/'],
  ]) {
    const manifest = JSON.parse(await load(`pwa/manifest-${locale}.webmanifest`));
    assert.equal(manifest.lang, language);
    assert.equal(manifest.id, id);
    assert.equal(manifest.start_url, start);
    assert.equal(manifest.scope, scope);
    assert.equal(manifest.display, 'standalone');
    assert.ok(manifest.name && manifest.short_name);
    assert.ok(manifest.icons.some(icon => icon.sizes === '192x192' && icon.type === 'image/png'));
    assert.ok(manifest.icons.some(icon => icon.sizes === '512x512' && icon.type === 'image/png' && icon.purpose === 'maskable'));
    for (const icon of manifest.icons) {
      const bytes = await readFile(new URL(icon.src.slice(1), root));
      assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
      const [width, height] = icon.sizes.split('x').map(Number);
      assert.equal(bytes.readUInt32BE(16), width);
      assert.equal(bytes.readUInt32BE(20), height);
    }
  }
});

test('PWA does not intercept accounts, APIs, learning, cloud, unsafe methods or unknown pages', async () => {
  const fixture = await workerFixture();
  const excluded = [
    '/api/visits', '/api/course-ros2/status', '/account/login', '/account/',
    '/learning', '/learning/', '/learning/api/session', '/lab/learning/', '/lab/honors/',
    '/arena/', '/chat/', '/unknown-page/', '/pwa/not-allowlisted.js',
    '/?token=private', '/?source=pwa&account=private', '/robots/?preview=private',
    'https://cloud.omindos.cn/', 'https://oa.omindos.cn/',
  ];
  for (const path of excluded) assert.equal((await fixture.request(path)).handled, false, path);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']) {
    assert.equal((await fixture.request('/', { method })).handled, false, method);
  }
  assert.equal(fixture.calls.fetch.length, 0);
  assert.equal(fixture.stores.size, 0);
});

test('PWA public navigation uses the network without storing live HTML', async () => {
  const fixture = await workerFixture();
  for (const path of ['/', '/robots/', '/contact/', '/lab/', '/en/', '/en/robots/', '/?source=pwa']) {
    const result = await fixture.request(path);
    assert.equal(result.handled, true, path);
    assert.equal(await result.response.text(), 'network:' + new URL(path, 'https://omindos.cn').pathname);
  }
  assert.equal(fixture.stores.size, 0);
});

test('PWA offline fallback follows the requested page language and never caches its HTML', async () => {
  const fixture = await workerFixture();
  await fixture.lifecycle('install');
  const cacheKeys = [...fixture.stores.values()].flatMap(store => [...store.keys()]);
  assert.ok(cacheKeys.some(url => url.endsWith('/pwa/offline-zh.html')));
  assert.ok(cacheKeys.some(url => url.endsWith('/pwa/offline-en.html')));
  assert.ok(cacheKeys.every(url => new URL(url).pathname.startsWith('/pwa/')));
  assert.ok(fixture.calls.requests.every(request => request.credentials === 'omit' && request.cache === 'reload'));
  for (const store of fixture.stores.values()) for (const response of store.values()) {
    assert.equal(response.redirected, false, 'Cache normalized responses after a host redirects .html');
  }
  assert.equal(fixture.calls.skipped, 0, 'Do not force a waiting worker to replace active pages');
  fixture.goOffline();
  for (const [path, language] of [['/', 'zh-CN'], ['/robots/', 'zh-CN'], ['/en/', 'en'], ['/en/robots/', 'en']]) {
    const result = await fixture.request(path);
    assert.equal(result.handled, true);
    assert.match(await result.response.text(), new RegExp(`<html[^>]+lang="${language}"`));
  }
  assert.deepEqual([...fixture.stores.values()].flatMap(store => [...store.keys()]).sort(), cacheKeys.sort());
});

test('PWA activation leaves caches owned by course and account apps intact', async () => {
  const fixture = await workerFixture();
  await fixture.lifecycle('install');
  const currentNames = [...fixture.stores.keys()];
  const unrelated = ['learning-runtime-v1', 'oa-cache-v7', 'cloud-assets', 'arbitrary-site-cache'];
  const obsolete = 'originmind-website-pwa-older-version';
  fixture.stores.set(obsolete, new Map());
  for (const name of unrelated) fixture.stores.set(name, new Map());
  await fixture.lifecycle('activate');
  for (const name of [...currentNames, ...unrelated]) assert.ok(fixture.stores.has(name), name);
  assert.equal(fixture.stores.has(obsolete), false);
  assert.ok(fixture.calls.deleted.every(name => !unrelated.includes(name)));
});

async function installationFixture({ language = 'zh-CN', standalone = false } = {}) {
  const elements = [];
  const handlers = new Map();
  const registrations = [];
  class Element {
    constructor(tagName) {
      this.tagName = tagName;
      this.children = [];
      this.handlers = new Map();
      this.dataset = {};
      this.open = false;
      elements.push(this);
    }
    append(...children) { this.children.push(...children); }
    setAttribute(name, value) { this[name] = value; }
    addEventListener(name, handler) { this.handlers.set(name, handler); }
    showModal() { this.open = true; }
    close() { this.open = false; this.handlers.get('close')?.({}); }
    focus() { this.focused = true; }
    getBoundingClientRect() { return { left: 0, right: 100, top: 0, bottom: 100 }; }
  }
  const footer = new Element('footer');
  const body = new Element('body');
  const window = {
    isSecureContext: true,
    matchMedia(query) { return { matches: standalone && query.includes('standalone'), addEventListener() {} }; },
    addEventListener(name, handler) { handlers.set(name, handler); },
  };
  const navigator = { serviceWorker: { async register(...args) { registrations.push(args); } } };
  const document = {
    documentElement: { lang: language },
    body,
    querySelector(selector) { return selector === 'footer' ? footer : null; },
    createElement(tagName) { return new Element(tagName); },
  };
  runInNewContext(await load('pwa/install.js'), { document, window, navigator, console });
  return {
    handlers, registrations, footer,
    button: elements.find(element => element.className === 'omindos-pwa-install'),
    container: elements.find(element => element.className === 'omindos-pwa-control'),
    dialog: elements.find(element => element.tagName === 'dialog'),
    close: elements.find(element => element.className === 'omindos-pwa-close'),
  };
}

test('PWA installation fallback shows localized instructions and restores keyboard focus', async () => {
  for (const [language, label] of [['zh-CN', '安装到桌面'], ['en', 'Install app']]) {
    const fixture = await installationFixture({ language });
    assert.equal(fixture.button.textContent, label);
    await fixture.button.handlers.get('click')();
    assert.equal(fixture.dialog.open, true);
    fixture.close.handlers.get('click')();
    assert.equal(fixture.dialog.open, false);
    assert.equal(fixture.button.focused, true);
    assert.equal(fixture.container.hidden, false);
  }
});

test('PWA installation prompt is user-triggered and only confirmed installs hide the entry', async () => {
  const fixture = await installationFixture();
  let prevented = 0;
  let prompted = 0;
  fixture.handlers.get('beforeinstallprompt')({
    preventDefault() { prevented++; },
    async prompt() { prompted++; },
    userChoice: Promise.resolve({ outcome: 'dismissed' }),
  });
  assert.equal(prevented, 1);
  assert.equal(prompted, 0);
  await fixture.button.handlers.get('click')();
  assert.equal(prompted, 1);
  assert.equal(fixture.container.hidden, false, 'Dismissing the system prompt must not claim installation');
  assert.equal(fixture.button.disabled, false);
  fixture.handlers.get('appinstalled')();
  assert.equal(fixture.container.hidden, true);
  assert.equal((await installationFixture({ standalone: true })).container.hidden, true);
});

test('PWA registers its worker with root scope and update checks bypass script caches', async () => {
  const fixture = await installationFixture();
  assert.equal(fixture.registrations.length, 0);
  await fixture.handlers.get('load')();
  assert.equal(fixture.registrations.length, 1);
  assert.equal(fixture.registrations[0][0], '/pwa/sw.js');
  assert.equal(fixture.registrations[0][1].scope, '/');
  assert.equal(fixture.registrations[0][1].updateViaCache, 'none');
});

test('international hosting serves PWA resources without locale redirects and allows root worker scope', async () => {
  const source = await load('_worker.js');
  const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const env = { ASSETS: { async fetch() {
    return new Response('asset', { headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000' } });
  } } };
  for (const [path, type] of [
    ['/pwa/sw.js', 'application/javascript'],
    ['/pwa/manifest-zh.webmanifest', 'application/manifest+json'],
    ['/pwa/manifest-en.webmanifest', 'application/manifest+json'],
  ]) {
    for (const method of ['GET', 'HEAD']) {
      const response = await worker.fetch(new Request('https://omindos.ai' + path, { method }), env);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('Location'), null);
      assert.ok(response.headers.get('Content-Type').startsWith(type));
      assert.match(response.headers.get('Cache-Control'), /no-cache|must-revalidate/);
      assert.equal(await response.text(), method === 'HEAD' ? '' : 'asset');
      if (path.endsWith('sw.js')) assert.equal(response.headers.get('Service-Worker-Allowed'), '/');
    }
    const response = await worker.fetch(new Request('https://omindos.ai' + path, { method: 'POST', body: 'do not store' }), env);
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('Location'), null);
  }
});
