(() => {
  // The URL selects the language; switching keeps the current page and context.
  document.querySelectorAll('.locale-switch a').forEach(link => {
    const destination = new URL(link.getAttribute('href'), location.origin);
    destination.search = location.search;
    destination.searchParams.delete('lang');
    destination.hash = location.hash;
    link.href = destination.href;
  });
  // Retain bookmarks from the former homepage after the move to /cn and /en.
  const home = location.pathname.match(/^\/(cn|en)\/$/);
  if (home) {
    const destinations = {
      '#what': '/#main-content', '#tasks': '/mobility/',
      '#production': '/field-work/', '#why': '/about/', '#products': '/robots/',
      '#company': '/about/', '#contact': '/contact/', '#capabilities': '/omindos/',
      '#ai-os': '/omindos/', '#inspection': '/field-work/',
      '#demo-navigation': '/mobility/', '#demo-language': '/mobility/',
      '#demo-field': '/field-work/', '#demo-mine': '/field-work/mining/',
      '#demo-pharma': '/field-work/warehouse/',
    };
    if (Object.hasOwn(destinations, location.hash)) {
      const destination = new URL('/' + home[1] + destinations[location.hash], location.origin);
      destination.search = location.search;
      location.replace(destination.href);
      return;
    }
  }
  // Only the canonical English host belongs to this collection. Chinese
  // analytics are separate; previews and Pages aliases must not mix in.
  if (location.hostname !== 'omindos.ai') return;
  if (typeof navigator !== 'undefined' && navigator.webdriver === true) return;
  // Count at most once per document, after a page is actually made visible.
  // This reduces hidden preloads; it does not establish a human identity.
  const collectVisit = () => {
    if (document.prerendering || document.visibilityState !== 'visible') return;
    document.removeEventListener('visibilitychange', collectVisit);
    document.removeEventListener('prerenderingchange', collectVisit);
    if (document.__originmindVisitRecordedV2) return;
    document.__originmindVisitRecordedV2 = true;
    fetch('/api/visits', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: '{}',
      signal: AbortSignal.timeout(5000),
    }).then(response => response.body?.cancel()).catch(() => {});
  };
  document.addEventListener('visibilitychange', collectVisit);
  document.addEventListener('prerenderingchange', collectVisit);
  collectVisit();
})();
