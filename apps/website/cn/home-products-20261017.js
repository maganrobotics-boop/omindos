(() => {
  const gallery = document.querySelector('[data-home-products]');
  if (!gallery) return;
  const panels = [...gallery.querySelectorAll('[data-product-panel]')];
  const selector = gallery.querySelector('[data-product-selector]');
  const buttons = [...(selector?.querySelectorAll('[data-product-select]') || [])];
  const surface = gallery.querySelector('.home-product-panels');
  if (!surface || !selector || panels.length < 2 || buttons.length !== panels.length) return;
  let current = 0;
  const select = index => {
    current = Math.max(0, Math.min(panels.length - 1, index));
    panels.forEach((panel, panelIndex) => {
      const active = panelIndex === current;
      panel.hidden = !active;
      panel.toggleAttribute('inert', !active);
      panel.setAttribute('aria-hidden', String(!active));
    });
    buttons.forEach((button, buttonIndex) => button.setAttribute('aria-pressed', String(buttonIndex === current)));
  };
  buttons.forEach((button, index) => button.addEventListener('click', () => select(index)));
  // Optional horizontal gesture; vertical scrolling stays browser-native.
  let start = null;
  surface.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.pointerType === 'mouse') return;
    if (event.target.closest('a, button, input, textarea, select')) return;
    start = { x: event.clientX, y: event.clientY, id: event.pointerId };
  }, { passive: true });
  surface.addEventListener('pointerup', event => {
    if (!start || event.pointerId !== start.id) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    start = null;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.3) select(current + (dx < 0 ? 1 : -1));
  }, { passive: true });
  surface.addEventListener('pointercancel', () => { start = null; }, { passive: true });
  select(0);
  selector.hidden = false;
})();
