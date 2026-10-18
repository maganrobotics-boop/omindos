(() => {
  'use strict';

  if (document.getElementById('en-chat-launcher')) return;

  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = '/en/assets/english-chat/widget.css?v=4-panel';
  document.head.append(stylesheet);

  const launcher = document.createElement('a');
  launcher.id = 'en-chat-launcher';
  launcher.className = 'en-chat-launcher';
  launcher.href = 'https://omindos.cn/chat/assets/english-chat/index.html?v=20261018-2';
  launcher.target = '_blank';
  launcher.rel = 'noopener noreferrer';
  launcher.referrerPolicy = 'no-referrer';
  launcher.draggable = false;
  launcher.title = 'Chat in English';
  launcher.setAttribute('role', 'button');
  launcher.setAttribute('aria-label', 'OriginMind Chat: Open English chat');
  launcher.setAttribute('aria-haspopup', 'dialog');
  launcher.setAttribute('aria-expanded', 'false');
  launcher.setAttribute('aria-controls', 'en-chat-panel');

  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('focusable', 'false');
  const outline = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  outline.setAttribute('d', 'M20 11.5a8 8 0 0 1-8 8 8.6 8.6 0 0 1-3.4-.7L4 20l1.2-4.6a8.6 8.6 0 0 1-.7-3.4 8 8 0 0 1 8-8h.4a7.6 7.6 0 0 1 7.1 7.1Z');
  const dots = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  dots.setAttribute('d', 'M8.5 12h.01M12 12h.01M15.5 12h.01');
  icon.append(outline, dots);
  const label = document.createElement('span');
  label.className = 'en-chat-launcher-text';
  const brand = document.createElement('small');
  brand.textContent = 'OriginMind Chat';
  const prompt = document.createElement('strong');
  prompt.textContent = 'Chat in English';
  label.append(brand, prompt);
  launcher.append(icon, label);

  const wrapper = document.createElement('div');
  wrapper.id = 'en-chat-entry';
  wrapper.className = 'en-chat-entry';
  const hide = document.createElement('button');
  hide.type = 'button';
  hide.className = 'en-chat-hide';
  hide.textContent = '×';
  hide.title = 'Hide chat entry, or swipe right';
  hide.setAttribute('aria-label', 'Hide chat entry');
  wrapper.append(launcher, hide);

  const dock = document.createElement('button');
  dock.type = 'button';
  dock.className = 'en-chat-dock';
  dock.hidden = true;
  dock.title = 'Show chat entry';
  dock.setAttribute('aria-label', 'Show chat entry');
  dock.setAttribute('aria-controls', wrapper.id);
  dock.append(icon.cloneNode(true));
  document.body.append(wrapper, dock);

  const storageKey = 'originmind.englishChat.launcherDocked.v1';
  const setDocked = (value, remember = true) => {
    const wasFocused = wrapper.contains(document.activeElement);
    wrapper.hidden = value;
    dock.hidden = !value;
    if (remember) {
      try { localStorage.setItem(storageKey, value ? '1' : '0'); } catch (_error) {}
    }
    if (value && wasFocused) dock.focus({ preventScroll: true });
  };
  try { setDocked(localStorage.getItem(storageKey) === '1', false); } catch (_error) {}
  hide.addEventListener('click', () => setDocked(true));
  dock.addEventListener('click', () => {
    setDocked(false);
    launcher.focus({ preventScroll: true });
  });

  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };
  const panel = make('section', 'en-chat-panel');
  panel.id = 'en-chat-panel';
  panel.hidden = true;
  panel.tabIndex = -1;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-labelledby', 'en-chat-title');
  const toolbar = make('div', 'en-chat-toolbar');
  const title = make('h2', '', 'OriginMind Chat');
  title.id = 'en-chat-title';
  const actions = make('div', 'en-chat-actions');
  const expand = make('button', 'en-chat-control', 'Fullscreen');
  expand.type = 'button';
  expand.setAttribute('aria-label', 'Show chat fullscreen');
  const collapse = make('button', 'en-chat-control', 'Collapse');
  collapse.type = 'button';
  collapse.setAttribute('aria-label', 'Collapse chat and keep this conversation');
  actions.append(expand, collapse);
  toolbar.append(title, actions);
  const content = make('div', 'en-chat-content');
  const frame = make('iframe', 'en-chat-frame');
  frame.title = 'OriginMind English chat';
  frame.referrerPolicy = 'same-origin';
  frame.hidden = true;
  const feedback = make('div', 'en-chat-feedback');
  const message = make('p', '', 'Opening chat…');
  message.setAttribute('role', 'status');
  message.setAttribute('aria-live', 'polite');
  const recovery = make('div', 'en-chat-recovery');
  recovery.hidden = true;
  const retry = make('button', 'en-chat-control', 'Retry');
  retry.type = 'button';
  const direct = make('a', 'en-chat-direct', 'Open standalone chat');
  direct.href = launcher.href;
  direct.target = '_blank';
  direct.rel = 'noopener noreferrer';
  recovery.append(retry, direct);
  feedback.append(message, recovery);
  content.append(frame, feedback);
  panel.append(toolbar, content);
  document.body.append(panel);

  let fullscreen = false;
  let started = false;
  let loadTimer;
  let frameDocument;
  let overflowBefore = '';
  const inertBefore = new Map();
  const setFullscreen = (value) => {
    if (fullscreen === value) return;
    fullscreen = value;
    panel.classList.toggle('is-fullscreen', value);
    expand.textContent = value ? 'Small window' : 'Fullscreen';
    expand.setAttribute('aria-label', value ? 'Restore small chat window' : 'Show chat fullscreen');
    if (value) {
      panel.setAttribute('aria-modal', 'true');
      overflowBefore = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
      for (const node of document.body.children) {
        if (node === panel || ['SCRIPT', 'STYLE', 'LINK'].includes(node.tagName)) continue;
        inertBefore.set(node, node.inert);
        node.inert = true;
      }
    } else {
      panel.removeAttribute('aria-modal');
      inertBefore.forEach((value, node) => { node.inert = value; });
      inertBefore.clear();
      document.documentElement.style.overflow = overflowBefore;
    }
  };
  const close = () => {
    if (panel.hidden) return;
    setFullscreen(false);
    panel.hidden = true;
    wrapper.hidden = false;
    launcher.setAttribute('aria-expanded', 'false');
    launcher.focus({ preventScroll: true });
  };
  const focusable = (root) => [...root.querySelectorAll('a[href],button,input,textarea,select,iframe,[tabindex]')]
    .filter(node => node.tabIndex >= 0 && !node.disabled && !node.closest('[inert]') && node.getClientRects().length);
  const onKey = (event) => {
    if (panel.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (fullscreen) { setFullscreen(false); expand.focus({ preventScroll: true }); }
      else close();
    } else if (fullscreen && event.key === 'Tab') {
      const stops = focusable(panel);
      const childStops = frameDocument ? focusable(frameDocument) : [];
      if (event.currentTarget === frameDocument) {
        const active = frameDocument.activeElement;
        if (event.shiftKey && active === childStops[0]) { event.preventDefault(); collapse.focus(); }
        else if (!event.shiftKey && active === childStops.at(-1)) { event.preventDefault(); expand.focus(); }
      } else if (event.shiftKey && document.activeElement === stops[0]) {
        event.preventDefault(); (childStops.at(-1) || stops.at(-1))?.focus();
      } else if (!event.shiftKey && document.activeElement === stops.at(-1)) {
        event.preventDefault(); stops[0]?.focus();
      }
    }
  };
  const failed = () => {
    clearTimeout(loadTimer);
    frame.hidden = true;
    feedback.hidden = false;
    message.textContent = 'Chat could not load. Please try again.';
    recovery.hidden = false;
  };
  const load = () => {
    if (frameDocument) frameDocument.removeEventListener('keydown', onKey, true);
    frameDocument = null;
    feedback.hidden = false;
    recovery.hidden = true;
    frame.hidden = true;
    message.textContent = 'Opening chat…';
    clearTimeout(loadTimer);
    loadTimer = setTimeout(failed, 20000);
    frame.src = '/en/assets/english-chat/panel.html?v=20261018-panel';
  };
  frame.addEventListener('load', () => {
    try {
      const doc = frame.contentDocument;
      if (!doc?.getElementById('chat-form')) { failed(); return; }
      clearTimeout(loadTimer);
      frameDocument = doc;
      doc.addEventListener('keydown', onKey, true);
      frame.hidden = false;
      feedback.hidden = true;
    } catch { failed(); }
  });
  frame.addEventListener('error', failed);
  const openChat = () => {
    panel.hidden = false;
    wrapper.hidden = true;
    dock.hidden = true;
    launcher.setAttribute('aria-expanded', 'true');
    if (!started) { started = true; load(); }
    expand.focus({ preventScroll: true });
  };
  launcher.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    openChat();
  });
  launcher.addEventListener('keydown', (event) => {
    if (event.key === ' ') { event.preventDefault(); openChat(); }
  });
  expand.addEventListener('click', () => setFullscreen(!fullscreen));
  collapse.addEventListener('click', close);
  retry.addEventListener('click', load);
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('focusin', (event) => {
    if (fullscreen && !panel.hidden && !panel.contains(event.target)) expand.focus({ preventScroll: true });
  });
  window.addEventListener('pagehide', () => { clearTimeout(loadTimer); setFullscreen(false); });
  // The embedded application closes its session on navigation. Reconnect when
  // the browser restores this document from its back/forward cache.
  window.addEventListener('pageshow', (event) => { if (event.persisted && started) load(); });

  let drag;
  let suppressClickUntil = 0;
  wrapper.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0 || event.target.closest('button')) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
  });
  wrapper.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) { drag = undefined; return; }
    if (dx < 60 || dx < Math.abs(dy) * 1.3) return;
    suppressClickUntil = performance.now() + 500;
    drag = undefined;
    setDocked(true);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(type => {
    wrapper.addEventListener(type, () => { drag = undefined; });
  });
  wrapper.addEventListener('click', (event) => {
    if (performance.now() >= suppressClickUntil) return;
    event.preventDefault();
    event.stopPropagation();
  }, true);
})();
