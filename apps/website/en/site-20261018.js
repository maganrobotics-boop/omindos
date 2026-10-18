/* English public-site controls; no application, identity or account changes. */
(() => {
  // Fit page/section headings to their actual container; retain readable
  // scrolling for unusually long publication and award titles on phones.
  const headingSelector = '.en-site :is(h1,h2,h3,h4,h5,h6)';
  let headings = [...document.querySelectorAll(headingSelector)];
  let headingFrame = 0;
  const fitHeadings = () => {
    headingFrame = 0;
    headings = [...document.querySelectorAll(headingSelector)];
    for (const heading of headings) {
      if (!heading.getClientRects().length || !heading.clientWidth) continue;
      heading.style.removeProperty('font-size');
      heading.classList.remove('en-heading-overflow');
      const available = heading.clientWidth;
      let size = parseFloat(getComputedStyle(heading).fontSize);
      for (let pass = 0; pass < 4 && heading.scrollWidth > available + 1 && size > 12; pass++) {
        size = Math.max(12, Math.floor(size * available / heading.scrollWidth * 100) / 100);
        heading.style.setProperty('font-size', `${size}px`, 'important');
      }
      const overflow = heading.scrollWidth > available + 1;
      heading.classList.toggle('en-heading-overflow', overflow);
      if (overflow && !heading.hasAttribute('tabindex')) {
        heading.tabIndex = 0;
        heading.dataset.headingFocus = 'added';
      } else if (!overflow && heading.dataset.headingFocus === 'added') {
        heading.removeAttribute('tabindex');
        delete heading.dataset.headingFocus;
      }
    }
  };
  const queueHeadingFit = () => { if (!headingFrame) headingFrame = requestAnimationFrame(fitHeadings); };
  queueHeadingFit();
  document.fonts?.ready.then(queueHeadingFit);
  window.addEventListener('resize', queueHeadingFit, { passive: true });
  document.addEventListener('toggle', queueHeadingFit, true);
  document.addEventListener('click', queueHeadingFit);
  new MutationObserver(queueHeadingFit).observe(document.body, {
    subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden'],
  });
  if (typeof ResizeObserver !== 'undefined') {
    const widths = new WeakMap();
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (widths.get(entry.target) !== entry.contentRect.width) {
          widths.set(entry.target, entry.contentRect.width);
          queueHeadingFit();
        }
      }
    });
    new Set(headings.map(heading => heading.parentElement)).forEach(parent => observer.observe(parent));
  }
  const chatScript = document.createElement('script');
  chatScript.src = '/en/assets/english-chat/widget.js?v=3';
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

