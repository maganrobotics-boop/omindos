// Explicit /cn and /en URLs always win over the browser's language.
(() => {
  if (/^\/(?:cn|en)(?:\/|$)/.test(location.pathname)) return;
  const preferred = navigator.languages?.[0] || navigator.language || 'en';
  const locale = preferred.toLowerCase().startsWith('zh') ? 'cn' : 'en';
  const route = document.documentElement.dataset.localePath || '/';
  location.replace('/' + locale + route + location.search + location.hash);
})();
