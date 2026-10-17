/* Keep the existing, same-origin Chat application and its session in one frame. */
(() => {
  'use strict';

  const entry = document.querySelector('.home-chat-entry');
  if (!entry || document.getElementById('home-chat-panel')) return;

  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };

  const launcher = make('div', 'home-chat-launcher');
  launcher.id = 'home-chat-launcher';
  entry.before(launcher);
  const hideEntry = make('button', 'home-chat-hide-button', '×');
  hideEntry.type = 'button';
  hideEntry.setAttribute('aria-label', '向右收起了解我们入口');
  hideEntry.title = '收起入口，也可向右滑动';
  launcher.append(entry, hideEntry);
  entry.draggable = false;

  const dock = make('button', 'home-chat-dock');
  dock.type = 'button';
  dock.hidden = true;
  dock.setAttribute('aria-label', '展开了解我们入口');
  dock.setAttribute('aria-controls', launcher.id);
  dock.title = '展开了解我们';
  const chatIcon = entry.querySelector('svg');
  if (chatIcon) dock.append(chatIcon.cloneNode(true));
  else dock.textContent = '聊';
  launcher.after(dock);

  const dockStorageKey = 'originmind.homeChat.launcherDocked.v1';
  const setDocked = (value, remember = true) => {
    const wasFocused = launcher.contains(document.activeElement);
    launcher.classList.toggle('is-docked', value);
    launcher.inert = value;
    launcher.setAttribute('aria-hidden', String(value));
    dock.hidden = !value;
    dock.setAttribute('aria-expanded', String(!value));
    if (remember) {
      try { localStorage.setItem(dockStorageKey, value ? '1' : '0'); } catch (_error) {}
    }
    if (value && wasFocused) dock.focus({ preventScroll: true });
  };
  try { setDocked(localStorage.getItem(dockStorageKey) === '1', false); } catch (_error) {}
  hideEntry.addEventListener('click', () => setDocked(true));
  dock.addEventListener('click', () => {
    setDocked(false);
    entry.focus({ preventScroll: true });
  });

  let drag = null;
  let suppressClickUntil = 0;
  const resetDrag = () => {
    const id = drag?.id;
    drag = null;
    launcher.classList.remove('is-dragging');
    launcher.style.removeProperty('--chat-drag-x');
    if (id !== undefined && launcher.hasPointerCapture(id)) launcher.releasePointerCapture(id);
  };
  launcher.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0 || event.target.closest('.home-chat-hide-button')) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, horizontal: false, width: launcher.offsetWidth };
  });
  launcher.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.horizontal) {
      if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) { resetDrag(); return; }
      if (dx <= 16 || dx <= Math.abs(dy) * 1.3) return;
      drag.horizontal = true;
      launcher.classList.add('is-dragging');
      try { launcher.setPointerCapture(event.pointerId); } catch (_error) {}
    }
    if (event.cancelable) event.preventDefault();
    launcher.style.setProperty('--chat-drag-x', `${Math.max(0, Math.min(dx, drag.width + 32))}px`);
  });
  launcher.addEventListener('pointerup', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    const shouldDock = drag.horizontal && dx >= Math.min(60, drag.width * .3) && dx > Math.abs(dy) * 1.3;
    const wasHorizontal = drag.horizontal;
    if (wasHorizontal) suppressClickUntil = performance.now() + 350;
    resetDrag();
    if (shouldDock) setDocked(true);
    // Pointer capture targets the wrapper, so an unfinished swipe must open directly.
    else if (wasHorizontal) openChat();
  });
  launcher.addEventListener('pointercancel', (event) => {
    if (drag?.id === event.pointerId) resetDrag();
  });
  launcher.addEventListener('lostpointercapture', (event) => {
    // Touch transfers its implicit capture from the inner link to this wrapper.
    if (event.target === launcher && drag?.id === event.pointerId) resetDrag();
  });
  launcher.addEventListener('pointerleave', () => { if (drag && !drag.horizontal) resetDrag(); });
  launcher.addEventListener('click', (event) => {
    if (performance.now() >= suppressClickUntil) return;
    event.preventDefault();
    event.stopPropagation();
  }, true);

  const panel = make('section', 'home-chat-panel');
  panel.id = 'home-chat-panel';
  panel.hidden = true;
  panel.tabIndex = -1;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-labelledby', 'home-chat-title');

  const toolbar = make('div', 'home-chat-toolbar');
  const heading = make('div', 'home-chat-heading');
  const title = make('h2', '', '了解我们');
  title.id = 'home-chat-title';
  heading.append(title, make('p', '', '机器人、系统与团队，随时提问'));
  const actions = make('div', 'home-chat-actions');
  const expand = make('button', 'home-chat-control', '全屏');
  expand.type = 'button';
  expand.setAttribute('aria-label', '全屏显示聊天');
  const collapse = make('button', 'home-chat-control', '收起');
  collapse.type = 'button';
  collapse.setAttribute('aria-label', '收起聊天，保留当前会话');
  actions.append(expand, collapse);
  toolbar.append(heading, actions);

  const content = make('div', 'home-chat-content');
  const frame = make('iframe', 'home-chat-frame');
  frame.title = '了解我们，在线提问';
  frame.referrerPolicy = 'same-origin';
  frame.hidden = true;
  const feedback = make('div', 'home-chat-feedback');
  const message = make('p', 'home-chat-message', '正在打开聊天，请稍候…');
  message.setAttribute('role', 'status');
  message.setAttribute('aria-live', 'polite');
  const recovery = make('div', 'home-chat-recovery');
  recovery.hidden = true;
  const retry = make('button', 'home-chat-retry', '重新加载');
  retry.type = 'button';
  const direct = make('a', 'home-chat-direct', '独立打开聊天');
  direct.href = '/chat/';
  direct.target = '_blank';
  direct.rel = 'noopener noreferrer';
  recovery.append(retry, direct);
  feedback.append(message, recovery);
  content.append(frame, feedback);
  panel.append(toolbar, content);
  document.body.append(panel);

  entry.setAttribute('role', 'button');
  entry.setAttribute('aria-haspopup', 'dialog');
  entry.setAttribute('aria-expanded', 'false');
  entry.setAttribute('aria-controls', panel.id);
  entry.setAttribute('aria-label', '了解我们，打开聊天小窗');

  let started = false;
  let fullscreen = false;
  let returnFocus = entry;
  let loadTimer;
  let iframeDocument;
  let copyObserver;
  let overflowBefore = '';
  const inertBefore = new Map();

  const restorePage = () => {
    inertBefore.forEach((value, node) => { node.inert = value; });
    inertBefore.clear();
    document.documentElement.style.overflow = overflowBefore;
  };

  const setFullscreen = (value) => {
    if (fullscreen === value) return;
    fullscreen = value;
    panel.classList.toggle('is-fullscreen', value);
    expand.textContent = value ? '小窗' : '全屏';
    expand.setAttribute('aria-label', value ? '恢复聊天小窗' : '全屏显示聊天');
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
      restorePage();
    }
  };

  const close = () => {
    if (panel.hidden) return;
    setFullscreen(false);
    panel.hidden = true;
    entry.hidden = false;
    launcher.hidden = false;
    entry.setAttribute('aria-expanded', 'false');
    if (returnFocus && returnFocus.isConnected && !returnFocus.inert) returnFocus.focus({ preventScroll: true });
    else entry.focus({ preventScroll: true });
  };

  const focusable = (root) => Array.from(root.querySelectorAll(
    'a[href], button, input, textarea, select, summary, iframe, [tabindex], [contenteditable="true"]'
  )).filter((node) => node.tabIndex >= 0 && !node.disabled && !node.closest('[inert]') && node.getClientRects().length > 0);

  const onKey = (event) => {
    if (panel.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (fullscreen) {
        setFullscreen(false);
        expand.focus({ preventScroll: true });
      } else close();
      return;
    }
    if (fullscreen && event.key === 'Tab') {
      const parentStops = focusable(panel);
      const first = parentStops[0];
      const last = parentStops[parentStops.length - 1];
      if (event.currentTarget === iframeDocument) {
        const childStops = focusable(iframeDocument);
        const active = iframeDocument.activeElement;
        if (event.shiftKey && (!childStops.length || active === childStops[0])) {
          event.preventDefault();
          collapse.focus({ preventScroll: true });
        } else if (!event.shiftKey && (!childStops.length || active === childStops[childStops.length - 1])) {
          event.preventDefault();
          expand.focus({ preventScroll: true });
        }
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        const childStops = last === frame && iframeDocument ? focusable(iframeDocument) : [];
        const destination = childStops[childStops.length - 1] || last;
        if (destination) destination.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        if (first) first.focus({ preventScroll: true });
      }
    }
  };

  const failed = () => {
    clearTimeout(loadTimer);
    frame.hidden = true;
    feedback.hidden = false;
    recovery.hidden = false;
    content.removeAttribute('aria-busy');
    message.textContent = '聊天暂时未能加载，请重试或独立打开。';
  };

  const startFrame = () => {
    clearTimeout(loadTimer);
    if (copyObserver) copyObserver.disconnect();
    copyObserver = undefined;
    if (iframeDocument) iframeDocument.removeEventListener('keydown', onKey, true);
    iframeDocument = undefined;
    frame.hidden = true;
    feedback.hidden = false;
    recovery.hidden = true;
    content.setAttribute('aria-busy', 'true');
    message.textContent = '正在打开聊天，请稍候…';
    loadTimer = window.setTimeout(failed, 20000);
    frame.src = '/chat/';
    started = true;
  };

  frame.addEventListener('load', () => {
    if (!started) return;
    try {
      const doc = frame.contentDocument;
      // Ignore the initial empty document if its queued load arrives after opening.
      if (doc?.location?.href === 'about:blank') return;
      if (!doc || !doc.body || doc.location.origin !== window.location.origin) return failed();
      const pageTitle = doc.title.toLowerCase();
      if (/\b(40[134]|50[0234])\b|not found|bad gateway|service unavailable/.test(pageTitle)) return failed();
      if (/^\/chat\/(?:index\.html)?$/.test(doc.location.pathname)) {
        // Trim only this embedded view; the standalone Chat keeps its navigation.
        doc.documentElement.setAttribute('data-home-chat-embed', '');
        const embedStyle = doc.createElement('style');
        embedStyle.id = 'home-chat-embed-style';
        embedStyle.textContent = `
          html[data-home-chat-embed] body .app-shell > .workspace > .topbar,
          html[data-home-chat-embed] body .app-shell > .sidebar,
          html[data-home-chat-embed] body .login-guide,
          html[data-home-chat-embed] body #omindos-account-link {
            display: none !important;
          }
          html[data-home-chat-embed] body .app-shell > .workspace > .chat-surface {
            flex: 1 1 auto !important;
            min-height: 0 !important;
            height: auto !important;
          }
        `;
        doc.head.append(embedStyle);
        // Adapt this homepage entry's interface copy without rewriting messages.
        const teamCopy = (text) => text.replace(/实验室/g, '团队');
        const syncTeamCopy = () => {
          doc.querySelectorAll('.entry-card .hero-title, .entry-card .hero-subtitle, .suggestions .suggestion span').forEach((node) => {
            const updated = teamCopy(node.textContent);
            if (node.textContent !== updated) node.textContent = updated;
          });
          const question = doc.querySelector('#question');
          if (question) {
            const updated = teamCopy(question.placeholder);
            if (question.placeholder !== updated) question.placeholder = updated;
          }
          doc.querySelectorAll('.suggestions .suggestion[data-prompt]').forEach((node) => {
            const updated = teamCopy(node.dataset.prompt);
            if (node.dataset.prompt !== updated) node.dataset.prompt = updated;
          });
        };
        syncTeamCopy();
        const copyRoots = '.entry-card, .suggestions, #question';
        copyObserver = new doc.defaultView.MutationObserver((changes) => {
          const copyChanged = changes.some((change) => {
            const target = change.target.nodeType === 1 ? change.target : change.target.parentElement;
            if (target?.closest(copyRoots)) return true;
            return [...change.addedNodes].some((node) => node.nodeType === 1 && (node.matches(copyRoots) || node.querySelector(copyRoots)));
          });
          if (copyChanged) syncTeamCopy();
        });
        // The Chat app rebuilds its shell after identity loads; watch a stable root.
        copyObserver.observe(doc.body, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['placeholder', 'data-prompt'] });
      }
      clearTimeout(loadTimer);
      iframeDocument = doc;
      doc.addEventListener('keydown', onKey, true);
      feedback.hidden = true;
      frame.hidden = false;
      content.removeAttribute('aria-busy');
    } catch (_error) {
      failed();
    }
  });
  frame.addEventListener('error', failed);
  retry.addEventListener('click', startFrame);
  expand.addEventListener('click', () => setFullscreen(!fullscreen));
  collapse.addEventListener('click', close);
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('focusin', (event) => {
    if (fullscreen && !panel.hidden && !panel.contains(event.target)) expand.focus({ preventScroll: true });
  });
  const openChat = () => {
    returnFocus = document.activeElement;
    panel.hidden = false;
    entry.hidden = true;
    launcher.hidden = true;
    entry.setAttribute('aria-expanded', 'true');
    if (!started) startFrame();
    collapse.focus({ preventScroll: true });
  };
  entry.addEventListener('click', (event) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    openChat();
  });
  entry.addEventListener('keydown', (event) => {
    if (event.key !== ' ') return;
    event.preventDefault();
    entry.click();
  });
})();
