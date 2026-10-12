(() => {
  const mobile = window.matchMedia('(max-width: 760px)');
  document.querySelectorAll('[data-content-tabs]').forEach(group => {
    const nav = group.querySelector('.content-tabs');
    const tabs = [...nav.querySelectorAll('[data-tab-target]')];
    const panels = tabs.map(tab => document.getElementById(tab.dataset.tabTarget));
    if (panels.some(panel => !panel)) return;
    let active = 0;
    const enabled = () => !group.hasAttribute('data-tabs-mobile') || mobile.matches;
    const update = () => {
      const on = enabled();
      group.classList.add('tabs-ready');
      nav.hidden = !on;
      if (on) nav.setAttribute('role', 'tablist');
      else nav.removeAttribute('role');
      tabs.forEach((tab, i) => {
        const panel = panels[i];
        panel.hidden = on && i !== active;
        if (on) {
          tab.setAttribute('role', 'tab');
          tab.setAttribute('aria-controls', panel.id);
          tab.setAttribute('aria-selected', String(i === active));
          tab.tabIndex = i === active ? 0 : -1;
          panel.setAttribute('role', 'tabpanel');
          panel.tabIndex = 0;
        } else {
          ['role', 'aria-controls', 'aria-selected', 'tabindex'].forEach(name => tab.removeAttribute(name));
          panel.removeAttribute('role');
          panel.removeAttribute('tabindex');
        }
        if (panel.hidden) panel.querySelectorAll('video').forEach(video => video.pause());
      });
      document.dispatchEvent(new Event('home:panelchange'));
    };
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => { active = i; update(); });
      tab.addEventListener('keydown', event => {
        if (!enabled()) return;
        let target = null;
        if (event.key === 'ArrowRight') target = (i + 1) % tabs.length;
        if (event.key === 'ArrowLeft') target = (i + tabs.length - 1) % tabs.length;
        if (event.key === 'Home') target = 0;
        if (event.key === 'End') target = tabs.length - 1;
        if (target === null) return;
        event.preventDefault(); active = target; update(); tabs[target].focus();
      });
    });
    mobile.addEventListener('change', update);
    update();
  });
})();
