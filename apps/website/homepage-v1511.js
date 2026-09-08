/* Small, dependency-free enhancements. Event delegation survives the existing
   language switch, which replaces body contents without executing new scripts. */
(() => {
  'use strict';
  if (window.__originmindHome1511) return;
  window.__originmindHome1511 = true;

  function revealFragment(fragment) {
    if (!fragment || fragment === '#') return;
    let id;
    try { id = decodeURIComponent(fragment.replace(/^#/, '')); }
    catch { return; }
    const target = document.getElementById(id);
    if (!target) return;
    let element = target;
    while (element) {
      if (element instanceof HTMLDetailsElement) element.open = true;
      element = element.parentElement;
    }
  }

  async function copyEmail(button) {
    const email = button.dataset.copyEmail;
    if (email !== 'sales@omindos.ai') return;
    const status = document.querySelector('[data-copy-status]');
    button.disabled = true;
    let copied = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        try { await navigator.clipboard.writeText(email); copied = true; }
        catch { /* Use a local selection fallback, never submit any data. */ }
      }
      if (!copied) {
        const field = document.createElement('textarea');
        field.value = email;
        field.readOnly = true;
        field.setAttribute('aria-label', 'sales@omindos.ai');
        Object.assign(field.style, { position: 'fixed', top: '0', left: '-9999px' });
        document.body.append(field);
        try {
          field.select();
          copied = typeof document.execCommand === 'function' && document.execCommand('copy');
        } finally { field.remove(); }
        button.focus({ preventScroll: true });
      }
    } catch { copied = false; }
    finally { button.disabled = false; }
    if (status) status.textContent = copied ? button.dataset.copySuccess : button.dataset.copyFailure;
  }

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const copy = event.target.closest('button[data-copy-email]');
    if (copy) { void copyEmail(copy); return; }
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target.closest('a[href]');
    if (!anchor) return;
    try {
      const url = new URL(anchor.href, location.href);
      if (url.origin === location.origin && url.pathname === location.pathname) revealFragment(url.hash);
    } catch { /* Invalid URLs must not break other page interactions. */ }
  }, true);

  // Do not autoplay. When a visitor plays a clip, pause the other clips.
  document.addEventListener('play', (event) => {
    if (!(event.target instanceof HTMLVideoElement)) return;
    document.querySelectorAll('main.logic-home video').forEach((video) => {
      if (video !== event.target && !video.paused) video.pause();
    });
  }, true);
  document.addEventListener('toggle', (event) => {
    if (event.target instanceof HTMLDetailsElement && !event.target.open) {
      event.target.querySelectorAll('video').forEach((video) => video.pause());
    }
  }, true);
  window.addEventListener('hashchange', () => revealFragment(location.hash));
  // The existing locale loader assigns body.innerHTML. Re-open a deep-linked
  // disclosure in the new locale without attaching duplicate event handlers.
  new MutationObserver(() => revealFragment(location.hash))
    .observe(document.body, { childList: true });
  revealFragment(location.hash);
})();
