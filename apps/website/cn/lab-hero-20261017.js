/* Decorative lab footage respects motion preferences and pauses out of view. */
(function () {
  'use strict';
  var footer = document.querySelector('.lab-family .cn-footer');
  if (footer && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      document.documentElement.classList.toggle('lab-footer-visible', entries[0].isIntersecting);
    }).observe(footer);
  }
  var hero = document.querySelector('.lab-hero-screen');
  if (!hero) return;
  var video = hero.querySelector('.lab-hero-video');
  var toggle = hero.querySelector('.lab-hero-motion-toggle');
  if (!video || !toggle) return;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var userPaused = false;
  var visible = true;
  video.muted = true;
  video.defaultMuted = true;
  function reconcile() {
    var paused = userPaused || reduced.matches;
    toggle.hidden = reduced.matches;
    toggle.dataset.paused = String(paused);
    toggle.setAttribute('aria-pressed', String(userPaused));
    toggle.setAttribute('aria-label', paused ? '播放背景视频' : '暂停背景视频');
    if (paused || !visible || document.hidden) {
      video.pause();
      return;
    }
    var playing = video.play();
    if (playing && typeof playing.then === 'function') playing.then(function () {
      delete hero.dataset.motion;
    }).catch(function (error) {
      if (error.name === 'AbortError' || userPaused || reduced.matches || !visible || document.hidden) return;
      hero.dataset.motion = 'unavailable';
      userPaused = true;
      toggle.dataset.paused = 'true';
      toggle.setAttribute('aria-pressed', 'true');
      toggle.setAttribute('aria-label', '播放背景视频');
    });
  }
  toggle.addEventListener('click', function () { userPaused = !userPaused; reconcile(); });
  document.addEventListener('visibilitychange', reconcile);
  if (reduced.addEventListener) reduced.addEventListener('change', reconcile);
  else if (reduced.addListener) reduced.addListener(reconcile);
  if ('IntersectionObserver' in window) new IntersectionObserver(function (entries) {
    visible = entries[0].isIntersecting;
    reconcile();
  }).observe(hero);
  reconcile();
}());
