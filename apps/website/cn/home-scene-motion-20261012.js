(() => {
  document.querySelectorAll('.scene-motion[data-src]').forEach(video => {
  const figure = video?.closest('figure');
  const toggle = figure?.querySelector('.scene-motion-toggle');
  const status = figure?.querySelector('.scene-motion-status');
  if (!video || !toggle) return;
  const sceneLabel = video.dataset.sceneLabel || '综采工作面';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let visible = false;
  let userChoice = null;
  let failed = false;
  let pending = false;
  const shouldPlay = () => !failed && visible && !document.hidden && !video.closest('[hidden]') &&
    (userChoice === true || (userChoice === null && !reduced.matches));
  const label = () => {
    toggle.textContent = video.paused ? '播放视频' : '暂停视频';
    toggle.setAttribute('aria-label', video.paused ? '播放' + sceneLabel + '视频' : '暂停' + sceneLabel + '视频');
  };
  const update = () => {
    if (!shouldPlay()) { video.pause(); label(); return; }
    if (!video.getAttribute('src')) video.src = video.dataset.src;
    if (!video.paused || pending) return;
    pending = true;
    video.play().then(() => {
      if (!shouldPlay()) video.pause();
    }).catch(error => {
      if (error.name !== 'AbortError' && !failed) {
        userChoice = false;
        status.textContent = '点击播放视频';
      }
    }).finally(() => { pending = false; label(); });
  };
  video.muted = true;
  video.addEventListener('playing', () => {
    if (!shouldPlay()) { video.pause(); return; }
    video.classList.add('motion-visible'); status.textContent = ''; label();
  });
  video.addEventListener('pause', label);
  video.addEventListener('error', () => {
    failed = true;
    video.classList.remove('motion-visible');
    toggle.hidden = true;
    status.textContent = '视频暂不可用，显示静态图';
  });
  toggle.hidden = false;
  toggle.addEventListener('click', () => {
    userChoice = video.paused;
    if (userChoice) visible = true;
    update();
  });
  reduced.addEventListener('change', () => { userChoice = null; update(); });
  document.addEventListener('visibilitychange', update);
  document.addEventListener('home:panelchange', update);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting; update();
    }, { threshold: 0.15 }).observe(video);
  } else { visible = true; update(); }
  });
})();
