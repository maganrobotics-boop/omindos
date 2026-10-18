(() => {
  'use strict';

  if (document.getElementById('en-chat-launcher')) return;

  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = '/en/assets/english-chat/widget.css?v=1';
  document.head.append(stylesheet);

  const launcher = document.createElement('a');
  launcher.id = 'en-chat-launcher';
  launcher.className = 'en-chat-launcher';
  launcher.href = 'https://omindos.cn/chat/assets/english-chat/index.html';
  launcher.target = '_blank';
  launcher.rel = 'noopener noreferrer';
  launcher.referrerPolicy = 'no-referrer';
  launcher.title = 'English chat';
  launcher.setAttribute('aria-label', 'Chat with OriginMind (opens in a new window)');

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
  label.textContent = 'English chat';
  launcher.append(icon, label);
  document.body.append(launcher);
})();
