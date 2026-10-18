(() => {
  const body = document.body;
  const done = body.dataset.copyDone || 'Copied';
  const failed = body.dataset.copyFail || 'Select and copy the code';
  document.querySelectorAll('.api-copy').forEach(button => {
    if (!navigator.clipboard?.writeText) return;
    button.hidden = false;
    button.setAttribute('aria-live', 'polite');
    const label = button.textContent;
    let timer;
    button.addEventListener('click', async () => {
      const code = button.closest('.api-code').querySelector('code');
      clearTimeout(timer);
      try {
        await navigator.clipboard.writeText(code.textContent);
        button.textContent = done;
      } catch {
        button.textContent = failed;
      }
      timer = window.setTimeout(() => { button.textContent = label; }, 2500);
    });
  });
  document.querySelectorAll('.api-code-tabs').forEach(group => {
    const list = group.querySelector('[role=tablist]');
    const tabs = [...list.querySelectorAll('[role=tab]')];
    const panels = [...group.querySelectorAll('[role=tabpanel]')];
    function select(tab) {
      tabs.forEach(item => {
        const active = item === tab;
        item.setAttribute('aria-selected', String(active));
        item.tabIndex = active ? 0 : -1;
      });
      panels.forEach(panel => { panel.hidden = panel.id !== tab.getAttribute('aria-controls'); });
    }
    list.hidden = false;
    select(tabs[0]);
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => select(tab));
      tab.addEventListener('keydown', event => {
        const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
        if (!step && !['Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const target = tabs[event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + step + tabs.length) % tabs.length];
        select(target); target.focus();
      });
    });
  });
  const search = document.getElementById('api-search');
  const clear = document.getElementById('api-search-clear');
  const status = document.getElementById('api-search-status');
  if (search && status && clear) {
    const endpoints = [...document.querySelectorAll('.api-endpoint')];
    const texts = endpoints.map(endpoint => endpoint.textContent.toLocaleLowerCase());
    function filter() {
      const terms = search.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
      let count = 0;
      endpoints.forEach((endpoint, index) => {
        const show = terms.every(term => texts[index].includes(term));
        endpoint.hidden = !show;
        if (show) count++;
      });
      clear.hidden = terms.length === 0;
      const suffix = count === 1 ? (status.dataset.countOne || status.dataset.count) : status.dataset.count;
      status.textContent = !terms.length ? status.dataset.all : count ? count + suffix : status.dataset.empty;
    }
    search.addEventListener('input', filter);
    search.addEventListener('keydown', event => {
      if (event.key === 'Escape') { search.value = ''; filter(); }
    });
    clear.addEventListener('click', () => { search.value = ''; filter(); search.focus(); });
  }
  const links = [...document.querySelectorAll('.api-sidebar a[href^="#"]')];
  if (links.length && 'IntersectionObserver' in window) {
    const visible = new Set();
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => entry.isIntersecting ? visible.add(entry.target.id) : visible.delete(entry.target.id));
      const active = links.find(link => visible.has(link.hash.slice(1)));
      if (active) links.forEach(link => {
        if (link === active) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    }, { rootMargin: '-110px 0px -40% 0px', threshold: 0 });
    links.forEach(link => {
      const section = document.getElementById(link.hash.slice(1));
      if (section) observer.observe(section);
    });
  }
})();
