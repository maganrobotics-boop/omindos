/* English public-site controls; no application, identity or account changes. */
(() => {
  const chatScript = document.createElement('script');
  chatScript.src = '/en/assets/english-chat/widget.js?v=2';
  chatScript.defer = true;
  document.body.append(chatScript);
  const button = document.querySelector('.en-menu-toggle');
  const menu = document.querySelector('.en-menu-panel');
  const setMenu = (open, returnFocus = false) => {
    if (!button || !menu) return;
    menu.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    document.body.classList.toggle('menu-open', open);
    if (open) menu.querySelector('a')?.focus();
    else if (returnFocus) button.focus();
  };
  button?.addEventListener('click', () => setMenu(menu.hidden));
  menu?.addEventListener('click', event => { if (event.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', event => {
    if (!menu || menu.hidden) return;
    if (event.key === 'Escape') setMenu(false, true);
    if (event.key !== 'Tab') return;
    const focusable = [button, ...menu.querySelectorAll('a')];
    if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1).focus(); }
    else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); button.focus(); }
  });
  matchMedia('(min-width:1280px)').addEventListener('change', event => { if (event.matches) setMenu(false); });
  document.querySelector('.skip-link')?.addEventListener('click', () => {
    const main = document.getElementById('main-content');
    if (main) { main.tabIndex = -1; requestAnimationFrame(() => main.focus({ preventScroll: true })); }
  });
  document.querySelectorAll('[data-accordion-group] details').forEach(item => item.addEventListener('toggle', () => {
    if (item.open) item.parentElement.querySelectorAll('details').forEach(other => { if (other !== item) other.open = false; });
  }));
  const reducedMotion = matchMedia('(prefers-reduced-motion:reduce)');
  document.querySelectorAll('[data-carousel]').forEach(control => control.addEventListener('click', () => {
    const track = document.querySelector(control.dataset.carousel);
    track?.scrollBy({ left: track.clientWidth * .8 * Number(control.dataset.direction), behavior: reducedMotion.matches ? 'auto' : 'smooth' });
  }));
  document.querySelectorAll('[data-open-dialog]').forEach(control => control.addEventListener('click', () => document.getElementById(control.dataset.openDialog)?.showModal()));
  document.querySelectorAll('[data-close-dialog]').forEach(control => control.addEventListener('click', () => control.closest('dialog')?.close()));
  document.querySelectorAll('dialog').forEach(dialog => {
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => dialog.querySelectorAll('video').forEach(video => video.pause()));
  });
  document.querySelectorAll('[data-scroll-products]').forEach(control => control.addEventListener('click', () => {
    const track = document.getElementById('robot-rail');
    track?.scrollBy({ left: track.clientWidth * .85 * Number(control.dataset.scrollProducts), behavior: reducedMotion.matches ? 'auto' : 'smooth' });
  }));
  document.querySelectorAll('.film-fold').forEach(details => details.addEventListener('toggle', () => {
    if (!details.open) details.querySelectorAll('video').forEach(video => video.pause());
  }));
  document.addEventListener('play', event => {
    if (event.target.matches?.('[data-demo-video]')) document.querySelectorAll('video').forEach(video => { if (video !== event.target) video.pause(); });
  }, true);
  document.querySelectorAll('[data-video-src]').forEach(control => control.addEventListener('click', () => {
    const dialog = document.getElementById('film-dialog');
    const video = dialog?.querySelector('video');
    if (video) { video.src = control.dataset.videoSrc; dialog.showModal(); video.play().catch(() => {}); }
  }));
  const video = document.querySelector('.hero video');
  const videoControl = document.querySelector('.video-control');
  if (video && videoControl) {
    const sync = () => { videoControl.textContent = video.paused ? 'Play film' : 'Pause film'; };
    if (reducedMotion.matches) video.pause();
    else video.play().catch(sync);
    videoControl.addEventListener('click', () => { if (video.paused) video.play().catch(sync); else video.pause(); });
    video.addEventListener('play', sync); video.addEventListener('pause', sync); sync();
  }
})();
