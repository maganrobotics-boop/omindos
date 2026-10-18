import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../apps/website/en/assets/english-chat/widget.js', import.meta.url), 'utf8');

// Exercise the shipped widget with browser event propagation and controllable
// iframe loads; this does not load the network or duplicate the widget logic.
class Node {
  constructor(tag, document) {
    this.tagName = tag.toUpperCase(); this.ownerDocument = document;
    this.children = []; this.parentNode = null; this.attributes = new Map(); this.listeners = new Map();
    this.style = {}; this.className = ''; this.hidden = false; this.inert = false;
    this.disabled = false; this.textContent = ''; this.srcWrites = [];
    this.classList = {
      contains: value => this.className.split(/\s+/).includes(value),
      toggle: (value, force) => {
        const classes = new Set(this.className.split(/\s+/).filter(Boolean));
        const include = force ?? !classes.has(value);
        if (include) classes.add(value); else classes.delete(value);
        this.className = [...classes].join(' '); return include;
      },
    };
  }
  get tabIndex() { return this._tabIndex ?? (['A', 'BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'IFRAME'].includes(this.tagName) ? 0 : -1); }
  set tabIndex(value) { this._tabIndex = value; }
  get src() { return this._src; }
  set src(value) { this._src = value; this.srcWrites.push(value); }
  setAttribute(key, value) { this.attributes.set(key, String(value)); }
  getAttribute(key) { return this.attributes.get(key) ?? null; }
  removeAttribute(key) { this.attributes.delete(key); }
  append(...nodes) { for (const node of nodes) { node.parentNode = this; this.children.push(node); } }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  matches(selector) {
    if (selector === '[inert]') return this.inert;
    if (selector === '[tabindex]') return this._tabIndex !== undefined;
    if (selector === 'a[href]') return this.tagName === 'A' && Boolean(this.href);
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    return this.tagName.toLowerCase() === selector;
  }
  closest(selector) { return this.matches(selector) ? this : this.parentNode?.closest(selector) ?? null; }
  querySelectorAll(selector) {
    const selectors = selector.split(','); const results = [];
    const visit = node => { for (const child of node.children) { if (selectors.some(s => child.matches(s))) results.push(child); visit(child); } };
    visit(this); return results;
  }
  getClientRects() {
    let node = this;
    while (node) { if (node.hidden) return []; node = node.parentNode; }
    return [{}];
  }
  cloneNode(deep) {
    const node = new Node(this.tagName, this.ownerDocument);
    node.attributes = new Map(this.attributes); node.className = this.className;
    if (deep) node.append(...this.children.map(child => child.cloneNode(true)));
    return node;
  }
  addEventListener(type, callback, capture = false) {
    const listeners = this.listeners.get(type) ?? [];
    if (!listeners.some(l => l.callback === callback && l.capture === capture)) listeners.push({ callback, capture });
    this.listeners.set(type, listeners);
  }
  removeEventListener(type, callback, capture = false) {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter(l => l.callback !== callback || l.capture !== capture));
  }
  dispatch(type, options = {}) {
    const event = {
      type, target: this, defaultPrevented: false, propagationStopped: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.propagationStopped = true; }, ...options,
    };
    const path = []; for (let node = this; node; node = node.parentNode) path.push(node);
    const run = (node, capture) => {
      event.currentTarget = node;
      for (const listener of node.listeners.get(type) ?? []) if (listener.capture === capture) listener.callback(event);
    };
    for (const node of [...path].reverse()) { run(node, true); if (event.propagationStopped) return event; }
    for (const node of path) { run(node, false); if (event.propagationStopped) break; }
    return event;
  }
  focus() {
    const document = this.ownerDocument;
    if (document.activeElement === this) return;
    document.activeElement = this;
    if (document.frame) document.frame.focus();
    this.dispatch('focusin');
  }
}

function makeDocument() {
  const document = new Node('#document'); document.ownerDocument = document;
  document.documentElement = new Node('html', document);
  document.head = new Node('head', document); document.body = new Node('body', document);
  document.append(document.documentElement); document.documentElement.append(document.head, document.body);
  document.createElement = tag => new Node(tag, document);
  document.createElementNS = (_namespace, tag) => new Node(tag, document);
  document.getElementById = id => {
    const find = node => node.id === id ? node : node.children.map(find).find(Boolean);
    return find(document) ?? null;
  };
  document.activeElement = document.body;
  return document;
}

function createEnvironment({ docked = false, blockedStorage = false } = {}) {
  const document = makeDocument(); const window = new Node('window', document);
  const main = document.createElement('main'); const alreadyInert = document.createElement('aside'); alreadyInert.inert = true;
  const script = document.createElement('script'); document.body.append(main, alreadyInert, script);
  document.documentElement.style.overflow = 'clip';
  const stored = new Map(docked ? [['originmind.englishChat.launcherDocked.v1', '1']] : []);
  const localStorage = {
    getItem(key) { if (blockedStorage) throw Error('blocked'); return stored.get(key) ?? null; },
    setItem(key, value) { if (blockedStorage) throw Error('blocked'); stored.set(key, value); },
  };
  const timers = new Map(); let timerId = 0; let now = 1000;
  const context = vm.createContext({ document, window, localStorage, performance: { now: () => now },
    setTimeout(callback, ms) { timers.set(++timerId, { callback, ms }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
  });
  vm.runInContext(source, context);
  const launcher = document.getElementById('en-chat-launcher'); const panel = document.getElementById('en-chat-panel');
  const find = (root, selector) => { const found = root.querySelectorAll(selector); assert.equal(found.length, 1, selector); return found[0]; };
  const frame = find(panel, 'iframe'); const controls = panel.querySelectorAll('button');
  const [expand, collapse, retry] = controls;
  const ready = (valid = true) => {
    const doc = makeDocument(); doc.frame = frame;
    if (valid) {
      const form = doc.createElement('form'); form.id = 'chat-form';
      const question = doc.createElement('textarea'); question.id = 'question';
      const send = doc.createElement('button'); send.textContent = 'Send'; form.append(question, send); doc.body.append(form);
    }
    frame.contentDocument = doc; frame.dispatch('load'); return doc;
  };
  return { document, window, context, main, alreadyInert, script, stored, timers, launcher, panel, frame, expand, collapse, retry, ready,
    wrapper: document.getElementById('en-chat-entry'), dock: find(document.body, '.en-chat-dock'), hide: find(document.body, '.en-chat-hide'),
    feedback: find(panel, '.en-chat-feedback'), recovery: find(panel, '.en-chat-recovery'),
    message: find(panel, 'p'), direct: find(panel, '.en-chat-direct'), advance(ms) { now += ms; },
  };
}

test('ordinary activation opens a small dialog without navigating or eagerly loading chat', () => {
  const e = createEnvironment();
  assert.equal(e.frame.srcWrites.length, 0); assert.equal(e.panel.hidden, true);
  assert.equal(e.launcher.dispatch('click').defaultPrevented, true);
  assert.equal(e.panel.hidden, false); assert.equal(e.panel.classList.contains('is-fullscreen'), false);
  assert.equal(e.panel.getAttribute('aria-modal'), null); assert.equal(e.main.inert, false);
  assert.equal(e.document.documentElement.style.overflow, 'clip');
  assert.equal(e.launcher.getAttribute('aria-expanded'), 'true');
  assert.equal(e.wrapper.hidden, true); assert.equal(e.dock.hidden, true);
  assert.equal(e.frame.srcWrites.length, 1); assert.match(e.frame.src, /^\/en\//);
  assert.equal(e.document.activeElement, e.expand); assert.equal(e.timers.size, 1);
});

test('fullscreen, small-window and collapse preserve the existing iframe and its draft', () => {
  const e = createEnvironment(); e.launcher.dispatch('click'); const doc = e.ready();
  const question = doc.getElementById('question'); question.value = 'Keep this draft';
  e.expand.dispatch('click');
  assert.equal(e.panel.classList.contains('is-fullscreen'), true); assert.equal(e.expand.textContent, 'Small window');
  assert.equal(e.panel.getAttribute('aria-modal'), 'true'); assert.equal(e.main.inert, true);
  assert.equal(e.wrapper.inert, true); assert.equal(e.script.inert, false);
  assert.equal(e.document.documentElement.style.overflow, 'hidden');
  e.expand.dispatch('click');
  assert.equal(e.panel.getAttribute('aria-modal'), null); assert.equal(e.main.inert, false); assert.equal(e.alreadyInert.inert, true);
  assert.equal(e.document.documentElement.style.overflow, 'clip'); assert.equal(e.expand.textContent, 'Fullscreen');
  e.expand.dispatch('click'); e.collapse.dispatch('click');
  assert.equal(e.panel.hidden, true); assert.equal(e.main.inert, false);
  assert.equal(e.document.documentElement.style.overflow, 'clip'); assert.equal(e.document.activeElement, e.launcher);
  assert.equal(e.launcher.getAttribute('aria-expanded'), 'false'); assert.equal(e.wrapper.hidden, false);
  e.launcher.dispatch('click');
  assert.equal(e.frame.srcWrites.length, 1); assert.equal(e.frame.contentDocument, doc);
  assert.equal(question.value, 'Keep this draft'); assert.equal(e.frame.hidden, false);
  assert.equal(e.panel.classList.contains('is-fullscreen'), false);
});

test('Escape in the embedded chat restores the small window, then collapses it', () => {
  const e = createEnvironment(); e.launcher.dispatch('click'); const doc = e.ready(); e.expand.dispatch('click');
  const first = doc.getElementById('question').dispatch('keydown', { key: 'Escape' });
  assert.equal(first.defaultPrevented, true); assert.equal(e.panel.hidden, false);
  assert.equal(e.panel.classList.contains('is-fullscreen'), false); assert.equal(e.document.activeElement, e.expand);
  doc.getElementById('question').dispatch('keydown', { key: 'Escape' });
  assert.equal(e.panel.hidden, true); assert.equal(e.document.activeElement, e.launcher);
});

test('fullscreen retains keyboard focus across the toolbar and iframe', () => {
  const e = createEnvironment(); e.launcher.dispatch('click'); const doc = e.ready(); e.expand.dispatch('click');
  const question = doc.getElementById('question'); const send = doc.querySelectorAll('button')[0];
  question.focus(); assert.equal(question.dispatch('keydown', { key: 'Tab', shiftKey: true }).defaultPrevented, true);
  assert.equal(e.document.activeElement, e.collapse);
  send.focus(); assert.equal(send.dispatch('keydown', { key: 'Tab' }).defaultPrevented, true);
  assert.equal(e.document.activeElement, e.expand);
  assert.equal(e.expand.dispatch('keydown', { key: 'Tab', shiftKey: true }).defaultPrevented, true);
  assert.equal(doc.activeElement, send);
  e.main.focus(); assert.equal(e.document.activeElement, e.expand);
});

test('timeout and invalid iframe content offer recovery, and Retry can load chat successfully', () => {
  const e = createEnvironment(); e.launcher.dispatch('click');
  const timer = [...e.timers.values()][0]; assert.equal(timer.ms, 20000); timer.callback();
  assert.equal(e.frame.hidden, true); assert.equal(e.feedback.hidden, false); assert.equal(e.recovery.hidden, false);
  assert.match(e.message.textContent, /could not load/); assert.equal(e.direct.target, '_blank');
  assert.match(e.direct.href, /^https:\/\/omindos\.cn\/chat\//);
  e.retry.dispatch('click'); assert.equal(e.recovery.hidden, true); assert.equal(e.frame.srcWrites.length, 2);
  e.ready(false); assert.equal(e.recovery.hidden, false); assert.equal(e.frame.hidden, true);
  e.retry.dispatch('click'); e.ready();
  assert.equal(e.frame.hidden, false); assert.equal(e.feedback.hidden, true); assert.equal(e.timers.size, 0);
  e.collapse.dispatch('click'); e.launcher.dispatch('click'); assert.equal(e.frame.srcWrites.length, 3);
});

test('iframe network errors remain recoverable after collapse and reopen', () => {
  const e = createEnvironment(); e.launcher.dispatch('click'); e.frame.dispatch('error');
  assert.equal(e.recovery.hidden, false); assert.equal(e.timers.size, 0);
  e.collapse.dispatch('click'); e.launcher.dispatch('click');
  assert.equal(e.recovery.hidden, false); assert.equal(e.frame.srcWrites.length, 1);
  e.retry.dispatch('click'); e.ready(); assert.equal(e.frame.hidden, false);
});

test('modified clicks keep native standalone navigation; Space opens the small window', () => {
  for (const modifier of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey']) {
    const e = createEnvironment(); const event = e.launcher.dispatch('click', { [modifier]: true });
    assert.equal(event.defaultPrevented, false); assert.equal(e.panel.hidden, true); assert.equal(e.frame.srcWrites.length, 0);
    assert.equal(e.launcher.target, '_blank'); assert.match(e.launcher.rel, /noopener/);
  }
  const e = createEnvironment(); e.launcher.dispatch('click', { defaultPrevented: true }); assert.equal(e.panel.hidden, true);
  assert.equal(e.launcher.dispatch('keydown', { key: ' ' }).defaultPrevented, true);
  assert.equal(e.panel.hidden, false); assert.equal(e.panel.classList.contains('is-fullscreen'), false);
});

test('hidden entry can be restored by the dock, including persisted and blocked-storage sessions', () => {
  const e = createEnvironment(); e.launcher.focus(); e.hide.dispatch('click');
  assert.equal(e.wrapper.hidden, true); assert.equal(e.dock.hidden, false); assert.equal(e.document.activeElement, e.dock);
  assert.equal([...e.stored.values()][0], '1');
  e.dock.dispatch('click'); assert.equal(e.wrapper.hidden, false); assert.equal(e.dock.hidden, true);
  assert.equal(e.document.activeElement, e.launcher); assert.equal([...e.stored.values()][0], '0');
  const persisted = createEnvironment({ docked: true });
  assert.equal(persisted.wrapper.hidden, true); assert.equal(persisted.dock.hidden, false);
  persisted.dock.dispatch('click'); persisted.launcher.dispatch('click'); assert.equal(persisted.panel.hidden, false);
  const blocked = createEnvironment({ blockedStorage: true }); blocked.hide.dispatch('click'); blocked.dock.dispatch('click');
  assert.equal(blocked.wrapper.hidden, false);
});

test('swiping right docks the entry without accidentally opening chat', () => {
  const e = createEnvironment();
  e.launcher.dispatch('pointerdown', { isPrimary: true, button: 0, pointerId: 1, clientX: 100, clientY: 100 });
  e.launcher.dispatch('pointermove', { pointerId: 1, clientX: 170, clientY: 103 });
  assert.equal(e.wrapper.hidden, true); assert.equal(e.dock.hidden, false);
  assert.equal(e.launcher.dispatch('click').defaultPrevented, true); assert.equal(e.panel.hidden, true);
  e.advance(501); e.dock.dispatch('click'); e.launcher.dispatch('click'); assert.equal(e.panel.hidden, false);
});

test('leaving the page releases fullscreen state and loading timers; injection is idempotent', () => {
  const e = createEnvironment(); vm.runInContext(source, e.context);
  assert.equal(e.document.body.querySelectorAll('.en-chat-panel').length, 1);
  e.launcher.dispatch('click'); e.expand.dispatch('click'); e.window.dispatch('pagehide');
  assert.equal(e.main.inert, false); assert.equal(e.alreadyInert.inert, true);
  assert.equal(e.document.documentElement.style.overflow, 'clip'); assert.equal(e.timers.size, 0);
});

test('BFCache restores an opened chat session without preloading unopened chat or reloading on ordinary toggles', () => {
  const unopened = createEnvironment();
  unopened.window.dispatch('pageshow', { persisted: false });
  unopened.window.dispatch('pageshow', { persisted: true });
  assert.equal(unopened.frame.srcWrites.length, 0); assert.equal(unopened.panel.hidden, true);

  const e = createEnvironment(); e.launcher.dispatch('click'); const doc = e.ready();
  doc.getElementById('question').value = 'A draft before leaving';
  e.expand.dispatch('click'); e.expand.dispatch('click'); e.collapse.dispatch('click'); e.launcher.dispatch('click');
  e.window.dispatch('pageshow', { persisted: false });
  assert.equal(e.frame.srcWrites.length, 1); assert.equal(e.frame.contentDocument, doc);
  assert.equal(doc.getElementById('question').value, 'A draft before leaving');

  e.window.dispatch('pagehide'); e.window.dispatch('pageshow', { persisted: true });
  assert.equal(e.frame.srcWrites.length, 2); assert.equal(e.frame.hidden, true);
  assert.equal(e.feedback.hidden, false); assert.equal(e.recovery.hidden, true);
  const restored = e.ready(); assert.notEqual(restored, doc); assert.equal(e.frame.hidden, false);
  e.collapse.dispatch('click'); e.launcher.dispatch('click');
  assert.equal(e.frame.srcWrites.length, 2); assert.equal(e.frame.contentDocument, restored);
});
