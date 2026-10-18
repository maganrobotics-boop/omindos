import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../apps/website/cn/lab-summary-20261018.js', import.meta.url), 'utf8');

// Deliberately supplied layout rectangles test the shipped interaction code.
// This is not a CSS/layout engine and makes no claim to visual browser coverage.
function simpleMatch(node, selector, scope) {
  if (selector === ':scope') return node === scope;
  if (selector.startsWith('#')) return node.id === selector.slice(1);
  if (selector.startsWith('.')) return node.classList.contains(selector.slice(1));
  if (selector.startsWith('[')) return node.attributes.has(selector.slice(1, -1));
  return node.tagName.toLowerCase() === selector;
}

function matches(node, selector, scope) {
  const child = selector.trim().split(/\s*>\s*/);
  if (child.length > 1) return simpleMatch(node, child.pop(), scope) && Boolean(node.parentNode && matches(node.parentNode, child.join(' > '), scope));
  const parts = selector.trim().split(/\s+/);
  if (!simpleMatch(node, parts.pop(), scope)) return false;
  let parent = node.parentNode;
  while (parts.length) {
    const part = parts.pop();
    while (parent && !simpleMatch(parent, part, scope)) parent = parent.parentNode;
    if (!parent) return false;
    parent = parent.parentNode;
  }
  return true;
}

class Element {
  constructor(tag, document) {
    this.tagName = tag.toUpperCase(); this.ownerDocument = document;
    this.children = []; this.parentNode = null; this.attributes = new Map();
    this.listeners = new Map(); this.dataset = {}; this.className = ''; this.id = '';
    this.hidden = false; this.textContent = ''; this.rect = { top: 0, bottom: 0, height: 0 };
    const change = (name, add) => {
      const classes = new Set(this.className.split(/\s+/).filter(Boolean));
      if (add) classes.add(name); else classes.delete(name);
      this.className = [...classes].join(' ');
    };
    this.classList = {
      contains: name => this.className.split(/\s+/).includes(name),
      add: name => change(name, true), remove: name => change(name, false),
    };
  }
  appendChild(node) { node.parentNode = this; this.children.push(node); return node; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  matches(selector) { return matches(this, selector, this); }
  querySelectorAll(selector) {
    const choices = selector.split(',').map(value => value.trim()); const found = [];
    const visit = parent => parent.children.forEach(node => {
      if (choices.some(choice => matches(node, choice, this))) found.push(node);
      visit(node);
    });
    visit(this); return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  getBoundingClientRect() {
    return this.classList.contains('lab-summary-hidden') ? { top: 0, bottom: 0, height: 0 } : this.rect;
  }
  addEventListener(type, callback) {
    const listeners = this.listeners.get(type) ?? []; listeners.push(callback); this.listeners.set(type, listeners);
  }
  dispatch(type, options = {}) { (this.listeners.get(type) ?? []).forEach(callback => callback({ target: this, ...options })); }
  focus() { this.ownerDocument.activeElement = this; }
}

function environment({ lang = 'zh-CN', lab = true, height = 800, cards = false, alumni = false, tallFirst = false } = {}) {
  const document = new Element('document'); document.ownerDocument = document;
  document.createElement = tag => new Element(tag, document);
  const make = (tag, className, parent) => {
    const node = document.createElement(tag); node.className = className;
    if (parent) parent.appendChild(node); return node;
  };
  document.documentElement = make('html', '', document); document.documentElement.lang = lang;
  document.documentElement.clientHeight = height;
  document.body = make('body', lab ? 'lab-page' : '', document.documentElement);
  document.activeElement = document.body;
  const header = make('header', 'site-header', document.body); header.rect = { top: 0, bottom: 80, height: 80 };
  const root = make('section', '', document.body); root.id = alumni ? 'alumni' : cards ? 'research' : 'lab-publications';
  const wrap = make('div', 'lab-wrap', root);
  const list = alumni ? wrap : make(cards ? 'div' : 'ol', cards ? 'lab-directions' : 'lab-chronology', wrap);
  const rectangles = cards ? [[230, 490], [230, 490], [520, 780], [520, 780]] : [[230, 370], [390, 530], [550, 690], [710, 850]];
  if (tallFirst) rectangles[0][1] = 1200;
  const items = rectangles.map(([top, bottom], index) => {
    const item = make(cards ? 'article' : 'li', cards ? 'lab-direction' : 'lab-chronology-entry', list);
    item.rect = { top, bottom, height: bottom - top }; item.textContent = `Record ${index + 1}`; return item;
  });
  let directory;
  if (alumni) {
    items.forEach(item => { item.className = ''; });
    items[0].className = 'lab-graduation-photo';
    directory = items[1]; directory.setAttribute('data-alumni-directory', '');
    items[2].className = 'lab-alumni-invitation'; items[3].className = 'lab-account-settings';
  }
  root.rect = { top: 100, bottom: 930, height: 830 };
  const link = make('a', '', items[3]); link.href = '/original-paper';
  const certificate = make('details', 'lab-certificate-disclosure', items[3]); certificate.open = true;
  const input = make('input', '', certificate); input.value = 'Preserve draft';
  const window = new Element('window', document); window.innerHeight = height; window.scrollY = 0;
  const scrolls = []; window.scrollTo = value => scrolls.push(value);
  const frames = new Map(); let frameId = 0;
  window.requestAnimationFrame = callback => { frames.set(++frameId, callback); return frameId; };
  const observers = []; const fontReady = [];
  document.fonts = { ready: { then: callback => fontReady.push(callback) } };
  class MutationObserver {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(target, options) { this.target = target; this.options = options; }
  }
  const context = vm.createContext({ window, document, MutationObserver });
  const run = () => vm.runInContext(source, context);
  const flush = () => {
    let count = 0;
    while (frames.size) {
      assert.ok(++count < 10, 'animation frames settle');
      const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback());
    }
  };
  run(); flush();
  return { document, window, root, wrap, items, link, certificate, input, directory, observers, fontReady, scrolls, run, flush,
    button: root.querySelector('button'), actions: root.querySelector('.lab-summary-actions'),
    visible: () => items.filter(item => !item.classList.contains('lab-summary-hidden')),
    resize(height) { document.documentElement.clientHeight = height; window.innerHeight = height; window.dispatch('resize'); flush(); },
  };
}

test('initializes only the Chinese lab and injecting the script twice does not duplicate controls', () => {
  for (const options of [{ lang: 'en' }, { lab: false }]) {
    const e = environment(options);
    assert.equal(e.button, null); assert.equal(e.visible().length, 4);
    assert.equal(e.document.body.classList.contains('lab-summary-enabled'), false);
  }
  const e = environment(); e.run(); e.flush();
  assert.equal(e.root.querySelectorAll('button').length, 1);
});

test('keeps complete records inside one viewport and exposes all original nodes through an accessible More control', () => {
  const e = environment();
  assert.deepEqual(e.visible(), e.items.slice(0, 3));
  assert.ok(e.visible().at(-1).rect.bottom + 80 - e.root.rect.top <= 800 - 80 - 16);
  assert.equal(e.actions.hidden, false); assert.equal(e.button.textContent, '更多');
  assert.equal(e.button.getAttribute('aria-expanded'), 'false');
  assert.deepEqual(e.button.getAttribute('aria-controls').split(' '), e.items.map(item => item.id));
  assert.equal(e.items[3].parentNode.children[3], e.items[3]);
});

test('grid cards stay in complete visual rows and a tall first card remains readable', () => {
  const e = environment({ cards: true });
  assert.deepEqual(e.visible(), e.items.slice(0, 2));
  const tall = environment({ height: 400, tallFirst: true });
  assert.equal(tall.visible()[0], tall.items[0]);
  assert.equal(tall.items[0].rect.height, 970);
});

test('More and Collapse retain certificates, links and form values; only Collapse scrolls and keeps button focus', () => {
  const e = environment(); const original = [...e.items];
  e.button.dispatch('click');
  assert.deepEqual(e.visible(), original); assert.equal(e.button.textContent, '收起');
  assert.equal(e.button.getAttribute('aria-expanded'), 'true'); assert.equal(e.scrolls.length, 0);
  e.button.dispatch('click');
  assert.equal(e.document.activeElement, e.button); assert.equal(e.scrolls.length, 1);
  assert.equal(e.scrolls[0].top, 8); assert.equal(e.button.getAttribute('aria-expanded'), 'false');
  assert.equal(e.certificate.open, true); assert.equal(e.input.value, 'Preserve draft');
  assert.equal(e.link.href, '/original-paper'); assert.deepEqual(e.items, original);
});

test('resize preserves deliberate expansion and never hides the currently focused content', () => {
  const e = environment(); e.button.dispatch('click'); e.link.focus(); e.resize(500);
  assert.equal(e.visible().length, 4); assert.equal(e.document.activeElement, e.link);
  assert.equal(e.button.getAttribute('aria-expanded'), 'true'); assert.equal(e.scrolls.length, 0);
  const allFit = environment({ height: 1400 });
  assert.equal(allFit.actions.hidden, true); assert.equal(allFit.visible().length, 4);
  allFit.link.focus(); allFit.resize(500);
  assert.equal(allFit.visible().length, 4); assert.equal(allFit.document.activeElement, allFit.link);
  assert.equal(allFit.button.getAttribute('aria-expanded'), 'true'); assert.equal(allFit.scrolls.length, 0);
});

test('image, font and asynchronous alumni updates remeasure without replacing content or collapsing an expanded section', () => {
  const e = environment();
  e.items[2].rect.bottom = 760;
  const image = e.document.createElement('img'); e.items[0].appendChild(image);
  e.document.dispatch('load', { target: image }); e.flush();
  assert.deepEqual(e.visible(), e.items.slice(0, 2));
  e.items[2].rect.bottom = 690; e.fontReady.forEach(callback => callback()); e.flush();
  assert.equal(e.visible().length, 3);
  const alumni = environment({ alumni: true });
  assert.equal(alumni.observers.length, 1); assert.equal(alumni.observers[0].target, alumni.directory);
  alumni.button.dispatch('click');
  const profile = alumni.document.createElement('a'); profile.href = '/lab/alumni/?id=new'; alumni.directory.appendChild(profile);
  alumni.observers[0].callback([]); alumni.flush();
  assert.equal(alumni.visible().length, 4); assert.equal(profile.parentNode, alumni.directory);
  assert.equal(alumni.button.getAttribute('aria-expanded'), 'true');
});
