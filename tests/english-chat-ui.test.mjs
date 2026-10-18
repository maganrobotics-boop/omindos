import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const rawSource = fs.readFileSync(new URL('../ops/chat-entry/english-public/chat.js', import.meta.url), 'utf8');
assert.ok(rawSource.includes("import('/learning/platform-chat-scope.js')"));
// Inject only the imported identity dependency; no real API requests are made.
const source = rawSource.replace("import('/learning/platform-chat-scope.js')", 'loadScopeModule()');
class Element {
  constructor(tag = 'div') { this.tagName = tag; this.children = []; this.dataset = {}; this.attrs = {}; this.events = {}; this.value = ''; this.hidden = false; this.textContent = ''; this.scrollHeight = 100; }
  addEventListener(name, handler) { (this.events[name] ||= []).push(handler); }
  dispatch(name, options = {}) { const e = { preventDefault() { this.defaultPrevented = true; }, ...options }; for (const h of this.events[name] || []) h(e); return e; }
  requestSubmit() { this.dispatch('submit'); }
  setAttribute(key, value) { this.attrs[key] = value; }
  appendChild(child) { child.parent = this; this.children.push(child); return child; }
  remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); }
  replaceChildren() { this.children = []; }
  focus() { this.focused = true; }
}
function createEnvironment(initializationError = false) {
  const ids = Object.fromEntries(['chat-form', 'question', 'send', 'new-chat', 'welcome', 'messages', 'chat-main', 'chat-status', 'character-count'].map(id => [id, new Element()]));
  const document = new Element();
  document.getElementById = id => ids[id];
  document.createElement = tag => new Element(tag);
  const calls = [], timers = new Map(), tickets = new Set(); let timerId = 0;
  const window = new Element();
  window.setTimeout = (callback, ms) => { timers.set(++timerId, { callback, ms }); return timerId; };
  window.clearTimeout = id => timers.delete(id);
  const scope = {
    changed: false, onInvalidate: null, verifyCalls: 0, assertCalls: 0, released: 0, closed: false, nextVerify: [],
    async verify() { this.verifyCalls++; if (this.nextVerify.length) await this.nextVerify.shift()(); if (this.changed) throw new Error('账号变化'); return { id: 'mock_identity_123456789' }; },
    capture() { if (this.changed) throw new Error('changed'); const ticket = { id: 'mock_identity_123456789', epoch: 0, controller: new AbortController() }; tickets.add(ticket); return ticket; },
    assert(ticket) { this.assertCalls++; if (this.changed || ticket.controller.signal.aborted) throw new Error('stale_ticket'); },
    release(ticket) { this.released++; tickets.delete(ticket); },
    invalidate() { this.changed = true; for (const t of tickets) t.controller.abort(); this.onInvalidate?.(); },
    close() { this.closed = true; for (const t of tickets) t.controller.abort(); },
  };
  function fetch(url, options) {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    calls.push({ url, options, resolve, reject });
    return promise;
  }
  const loadScopeModule = async () => ({ async createAccountScope(options) {
    assert.equal(options.doc, null);
    if (initializationError) throw new Error('账号状态不正确 mock_identity_123456789');
    return scope;
  } });
  vm.runInNewContext(source, { document, window, fetch, AbortController, URL, Set, console, loadScopeModule });
  return { ids, document, window, calls, timers, scope, tickets };
}
const settle = async () => { await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)); };
const reply = (data, status = 200, type = 'application/json') => ({ ok: status >= 200 && status < 300, status, headers: { get() { return type; } }, async json() { return data; } });
async function send(env, text) { await settle(); env.ids.question.value = text; env.ids['chat-form'].dispatch('submit'); await settle(); }

test('does not send automatically and initializes without displaying identity', async () => {
  const e = createEnvironment(); await settle();
  assert.equal(e.calls.length, 0);
  assert.equal(e.ids.send.disabled, false);
  assert.equal(typeof e.scope.onInvalidate, 'function');
  assert.doesNotMatch(e.ids['chat-status'].textContent, /mock_identity/);
});

test('verifies before POST and render, sends expected identity and an English instruction', async () => {
  const e = createEnvironment(); await send(e, '  What is OmindOS?  ');
  assert.equal(e.calls.length, 1);
  assert.equal(e.scope.verifyCalls, 1);
  const c = e.calls[0];
  assert.equal(c.url, '/learning/api/chat');
  assert.equal(c.options.credentials, 'same-origin');
  assert.equal(c.options.redirect, 'error');
  assert.equal(c.options.headers.Accept, 'application/json');
  assert.equal(c.options.headers['X-OmindOS-Expected-Account'], 'mock_identity_123456789');
  assert.deepEqual(JSON.parse(c.options.body), { topic: 'research', messages: [{ role: 'user', content: 'Please answer in English.\n\nWhat is OmindOS?' }] });
  assert.equal(e.ids.messages.children[0].children[1].textContent, 'What is OmindOS?');
  assert.equal(e.ids.question.readOnly, true);
  e.ids.question.dispatch('keydown', { key: 'Enter' });
  assert.equal(e.calls.length, 1);
  c.resolve(reply({ answer: 'OmindOS is robot software.', conversationToken: 'x'.repeat(40000) })); await settle();
  assert.equal(e.scope.verifyCalls, 2); assert.equal(e.scope.assertCalls, 2); assert.equal(e.scope.released, 1);
  assert.equal(e.ids.question.value, ''); assert.equal(e.ids.question.readOnly, false);
  assert.equal(e.ids.messages.children.length, 2);
  await send(e, 'And the robots?');
  assert.equal(JSON.parse(e.calls[1].options.body).conversationToken.length, 40000);
});

test('renders answer and source titles as text; rejects unsafe and duplicate source links', async () => {
  const e = createEnvironment(); await send(e, 'Robots');
  const answer = '<img src=x onerror=alert(1)>\nPlain text';
  e.calls[0].resolve(reply({ answer, images: ['https://example.com/image.jpg'], sources: [
    { url: 'javascript:alert(1)', title: 'Unsafe' }, { url: '/local', title: 'Relative' },
    { url: 'http://example.com', title: 'HTTP' }, { url: 'https://user:pass@example.com', title: 'Credentials' },
    { url: 'https://example.com/source', title: '<script>literal title</script>' },
    { url: 'https://example.com/source', title: 'Duplicate' },
  ] })); await settle();
  const assistant = e.ids.messages.children[1];
  assert.equal(assistant.children[1].textContent, answer);
  assert.equal(assistant.children[1].children.length, 0);
  const sourceList = assistant.children[2].children[1];
  assert.equal(sourceList.children.length, 1);
  assert.equal(sourceList.children[0].children[0].textContent, '<script>literal title</script>');
  assert.equal(sourceList.children[0].children[0].rel, 'noopener noreferrer');
});

test('HTTP errors keep the draft and do not display backend error content', async () => {
  const e = createEnvironment(); await send(e, 'A question');
  e.calls[0].resolve(reply({ error: '内部中文错误和敏感信息' }, 500)); await settle();
  assert.equal(e.ids.question.value, 'A question');
  assert.equal(e.ids.messages.children.length, 0);
  assert.match(e.ids['chat-status'].textContent, /Please try again/);
  assert.doesNotMatch(e.ids['chat-status'].textContent, /[\u4e00-\u9fff]/);
});

test('Stop aborts and ignores a later successful response while retaining the draft', async () => {
  const e = createEnvironment(); await send(e, 'Keep this draft');
  e.ids['chat-form'].dispatch('submit');
  assert.equal(e.calls[0].options.signal.aborted, true);
  e.calls[0].resolve(reply({ answer: 'A late answer' })); await settle();
  assert.equal(e.ids.messages.children.length, 0);
  assert.equal(e.ids.question.value, 'Keep this draft');
  assert.match(e.ids['chat-status'].textContent, /Response stopped/);
});

test('timeout is 60 seconds and produces an English retry message', async () => {
  const e = createEnvironment(); await send(e, 'Timeout test');
  const timer = [...e.timers.values()][0]; assert.equal(timer.ms, 60000);
  timer.callback();
  assert.equal(e.calls[0].options.signal.aborted, true);
  e.calls[0].reject(new Error('AbortError')); await settle();
  assert.match(e.ids['chat-status'].textContent, /took too long/);
  assert.equal(e.ids.question.value, 'Timeout test');
});

test('New chat aborts, clears memory and ignores a stale response', async () => {
  const e = createEnvironment(); await send(e, 'Old question');
  e.ids['new-chat'].dispatch('click');
  assert.equal(e.calls[0].options.signal.aborted, true);
  e.calls[0].resolve(reply({ answer: 'Stale answer', conversationToken: 'stale-token' })); await settle();
  assert.equal(e.ids.messages.children.length, 0); assert.equal(e.ids.welcome.hidden, false);
  await send(e, 'New question'); assert.equal(JSON.parse(e.calls[1].options.body).conversationToken, undefined);
});

test('empty and oversized questions do not reach the API; Shift+Enter remains a newline', async () => {
  const e = createEnvironment(); await send(e, '   '); await send(e, 'x'.repeat(4001));
  assert.equal(e.calls.length, 0);
  const event = e.ids.question.dispatch('keydown', { key: 'Enter', shiftKey: true });
  assert.equal(event.defaultPrevented, undefined);
});

test('scope initialization failure preserves English UI and disables Send', async () => {
  const e = createEnvironment(true); await settle();
  assert.equal(e.ids.send.disabled, true); assert.match(e.ids['chat-status'].textContent, /Refresh this page/);
  assert.doesNotMatch(e.ids['chat-status'].textContent, /[\u4e00-\u9fff]|mock_identity/);
  await send(e, 'Never send'); assert.equal(e.calls.length, 0);
});

test('identity change before sending prevents POST and clears all conversation state', async () => {
  const e = createEnvironment(); await settle(); e.scope.nextVerify.push(() => e.scope.invalidate());
  await send(e, 'Do not send to a new identity');
  assert.equal(e.calls.length, 0); assert.equal(e.ids.messages.children.length, 0); assert.equal(e.ids.question.value, '');
  assert.equal(e.ids.send.disabled, true); assert.match(e.ids['chat-status'].textContent, /session has changed/);
  assert.doesNotMatch(e.ids['chat-status'].textContent, /[\u4e00-\u9fff]|mock_identity/);
});

test('identity change between response and rendering suppresses answer and token', async () => {
  const e = createEnvironment(); await send(e, 'Account A question');
  e.scope.nextVerify.push(() => e.scope.invalidate());
  e.calls[0].resolve(reply({ answer: 'Do not show in a different session', conversationToken: 'private-token' })); await settle();
  assert.equal(e.ids.messages.children.length, 0); assert.equal(e.ids.question.value, ''); assert.equal(e.ids.send.disabled, true);
  assert.equal(e.calls[0].options.signal.aborted, true); assert.equal(e.scope.released, 1);
});

test('scope invalidation aborts pending fetch and ignores stale completion', async () => {
  const e = createEnvironment(); await send(e, 'Account A'); e.scope.invalidate();
  assert.equal(e.calls[0].options.signal.aborted, true);
  e.calls[0].resolve(reply({ answer: 'Stale response', conversationToken: 'stale-token' })); await settle();
  assert.equal(e.ids.messages.children.length, 0); assert.match(e.ids['chat-status'].textContent, /Refresh this page/); assert.equal(e.scope.released, 1);
});

test('pagehide closes the scope and suppresses pending content', async () => {
  const e = createEnvironment(); await send(e, 'Close this page'); e.window.dispatch('pagehide');
  assert.equal(e.scope.closed, true); assert.equal(e.calls[0].options.signal.aborted, true); assert.equal(e.ids.send.disabled, true);
  e.calls[0].resolve(reply({ answer: 'Too late' })); await settle(); assert.equal(e.ids.messages.children.length, 0); assert.equal(e.scope.released, 1);
});

test('409 clears the conversation token so retry does not repeat an invalid token', async () => {
  const e = createEnvironment(); await send(e, 'First question');
  e.calls[0].resolve(reply({ answer: 'First answer', conversationToken: 'old-token' })); await settle();
  await send(e, 'Keep this question'); assert.equal(JSON.parse(e.calls[1].options.body).conversationToken, 'old-token');
  e.calls[1].resolve(reply({ error: '后端错误不得显示' }, 409)); await settle();
  assert.equal(e.ids.question.value, 'Keep this question'); assert.match(e.ids['chat-status'].textContent, /New chat/);
  await send(e, 'Keep this question'); assert.equal(JSON.parse(e.calls[2].options.body).conversationToken, undefined);
});


