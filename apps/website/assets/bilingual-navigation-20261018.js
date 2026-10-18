(() => {
  const groups = [...document.querySelectorAll('[data-site-submenu]')];
  const close = except => groups.forEach(group => { if (group !== except) group.open = false; });
  const desktopPointer = matchMedia('(hover:hover) and (pointer:fine)');
  groups.forEach(group => {
    const summary = group.querySelector('summary');
    group.addEventListener('toggle', () => {
      summary.setAttribute('aria-expanded', String(group.open));
      if (group.open) close(group);
    });
    group.addEventListener('pointerenter', () => {
      if (desktopPointer.matches && !group.closest('.mobile-menu,.en-menu-panel')) { close(group); group.open = true; }
    });
    group.addEventListener('pointerleave', () => {
      if (desktopPointer.matches && !group.contains(document.activeElement)) group.open = false;
    });
    group.addEventListener('keydown', event => {
      if (event.key === 'Escape' && group.open) { group.open = false; summary.focus(); event.stopPropagation(); }
    });
    group.addEventListener('focusout', event => { if (!group.contains(event.relatedTarget)) group.open = false; });
  });
  document.addEventListener('click', event => { if (!event.target.closest('[data-site-submenu]')) close(); });
  window.addEventListener('pagehide', () => close());
})();
