(() => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  document.querySelectorAll('[data-scene-gallery]').forEach(gallery => {
    const images = [...gallery.querySelectorAll('.scene-slide')];
    const dots = [...gallery.querySelectorAll('.scene-gallery-progress i')];
    const toggle = gallery.querySelector('.scene-gallery-toggle');
    const next = gallery.querySelector('.scene-gallery-next');
    if (images.length < 2 || !toggle || !next) return;
    let index = 0, visible = false, pausedByUser = false, timer = null;
    const advance = () => {
      const ready = images.map((img, i) => ({ img, i })).filter(({img}) => img.complete && img.naturalWidth > 0);
      if (ready.length < 2) return;
      const current = ready.findIndex(item => item.i === index);
      index = ready[(current + 1) % ready.length].i;
      images.forEach((img, i) => img.classList.toggle('is-current', i === index));
      dots.forEach((dot, i) => dot.classList.toggle('is-current', i === index));
      gallery.dataset.slide = String(index);
    };
    const update = () => {
      const running = visible && !document.hidden && !reduced.matches && !pausedByUser;
      gallery.dataset.motion = running ? 'running' : 'paused';
      toggle.hidden = reduced.matches;
      toggle.textContent = pausedByUser ? '播放动效' : '暂停动效';
      toggle.setAttribute('aria-label', (pausedByUser ? '播放' : '暂停') + gallery.dataset.sceneLabel + '图像动效');
      if (running && timer === null) timer = window.setInterval(advance, 4500);
      if (!running && timer !== null) { window.clearInterval(timer); timer = null; }
    };
    gallery.dataset.slide = '0';
    images.forEach((img, i) => img.classList.toggle('is-current', i === 0));
    next.hidden = false;
    next.addEventListener('click', () => { advance(); });
    toggle.addEventListener('click', () => { pausedByUser = !pausedByUser; update(); });
    document.addEventListener('visibilitychange', update);
    reduced.addEventListener('change', () => { pausedByUser = false; update(); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); }, { threshold: 0.15 }).observe(gallery);
    } else { visible = true; }
    update();
  });
})();
