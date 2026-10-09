(() => {
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  document.querySelectorAll('[data-controls-for]').forEach(controls => {
    const track = document.getElementById(controls.dataset.controlsFor);
    if (!track) return;
    const previous = controls.querySelector('[data-product-scroll="-1"]');
    const next = controls.querySelector('[data-product-scroll="1"]');
    const update = () => {
      const end = Math.max(0, track.scrollWidth - track.clientWidth);
      controls.hidden = end < 2;
      previous.disabled = track.scrollLeft < 2;
      next.disabled = track.scrollLeft >= end - 2;
    };
    controls.querySelectorAll('[data-product-scroll]').forEach(button => {
      button.addEventListener('click', () => {
        const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
        const step = (track.firstElementChild?.getBoundingClientRect().width || track.clientWidth) + gap;
        track.scrollBy({left: step * Number(button.dataset.productScroll), behavior: motion.matches ? 'auto' : 'smooth'});
      });
    });
    track.addEventListener('scroll', update, {passive: true});
    new ResizeObserver(update).observe(track);
    update();
  });
})();
