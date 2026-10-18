/* Local presentation only; the shared service owns the account link and session. */
(function () {
  'use strict';
  var actions = document.getElementById('chat-actions');
  var newChat = document.getElementById('new-chat');
  if (!actions || !newChat) return;

  function updateAccountLink() {
    var link = document.getElementById('omindos-account-link');
    if (!link) return;
    // Move the original anchor so its destination and listeners remain intact.
    if (link.parentNode !== actions || link.nextSibling !== newChat) actions.insertBefore(link, newChat);
    if (link.textContent !== 'My account') link.textContent = 'My account';
    if (link.getAttribute('aria-label') !== 'My account') link.setAttribute('aria-label', 'My account');
    if (link.getAttribute('title') !== 'My account') link.setAttribute('title', 'My account');
    if (link.getAttribute('lang') !== 'en') link.setAttribute('lang', 'en');
  }

  var observer = typeof MutationObserver === 'function' ? new MutationObserver(updateAccountLink) : null;
  var observing = false;
  function start() {
    updateAccountLink();
    if (!observer || observing || !document.body) return;
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['id', 'aria-label', 'title', 'lang']
    });
    observing = true;
  }
  window.addEventListener('pagehide', function () {
    if (observer) observer.disconnect();
    observing = false;
  });
  window.addEventListener('pageshow', start);
  start();
}());
