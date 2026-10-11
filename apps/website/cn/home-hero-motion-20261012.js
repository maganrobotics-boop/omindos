(() => {
  const hero = document.querySelector('.mining-hero-immersive');
  const toggle = hero?.querySelector('.hero-motion-toggle');
  if (!hero || !toggle) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let pausedByUser = false;
  let visible = true;
  const update = () => {
    const paused = pausedByUser || reducedMotion.matches;
    hero.dataset.heroMotion = !paused && visible && !document.hidden ? 'running' : 'paused';
    toggle.hidden = reducedMotion.matches;
    toggle.textContent = pausedByUser ? '播放动效' : '暂停动效';
    toggle.setAttribute('aria-label', pausedByUser ? '播放首页背景动效' : '暂停首页背景动效');
  };
  toggle.addEventListener('click', () => { pausedByUser = !pausedByUser; update(); });
  reducedMotion.addEventListener('change', update);
  document.addEventListener('visibilitychange', update);
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); });
    observer.observe(hero);
  }
  update();
})();
