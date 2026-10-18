(() => {
  'use strict';

  if (document.getElementById('en-chat-launcher')) return;

  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = '/en/assets/english-chat/widget.css?v=2';
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
  launcher.setAttribute('aria-label', 'OriginMind Chat: Chat in English (opens in a new window)');

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
