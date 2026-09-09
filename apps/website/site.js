const isChinese = document.documentElement.lang === 'zh-CN';
const ui = (english, chinese) => isChinese ? chinese : english;
const menuButton = document.querySelector('.menu-button');
const menu = document.querySelector('#mobile-menu');
function setMenu(open, returnFocus = true) {
  if (!menu || !menuButton) return;
  menu.hidden = !open;
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.setAttribute('aria-label', open ? ui('Close menu','关闭菜单') : ui('Open menu','打开菜单'));
  document.body.classList.toggle('menu-open', open);
  if (open) menu.querySelector('a')?.focus();
  else if (returnFocus) menuButton.focus();
}
menuButton?.addEventListener('click', () => setMenu(menu.hidden));
menu?.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setMenu(false, false)));
document.addEventListener('keydown', event => {
  if (!menu || menu.hidden) return;
  if (event.key === 'Escape') setMenu(false);
  if (event.key === 'Tab') {
    const items = [menuButton, ...menu.querySelectorAll('a')].filter(el => el.getClientRects().length);
    const first = items[0], last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) {event.preventDefault(); last.focus();}
    else if (!event.shiftKey && document.activeElement === last) {event.preventDefault(); first.focus();}
  }
});
matchMedia('(min-width:821px)').addEventListener('change', event => {
  if (event.matches && menu && !menu.hidden) setMenu(false, false);
});

const motion = matchMedia('(prefers-reduced-motion:reduce)');
document.querySelectorAll('[data-scroll-products]').forEach(button => button.addEventListener('click', () => {
  const rail = document.querySelector('#robot-rail');
  rail?.scrollBy({left:rail.clientWidth * 0.85 * Number(button.dataset.scrollProducts), behavior:motion.matches ? 'auto' : 'smooth'});
}));

const hero = document.querySelector('[data-hero-video]');
const filmButton = document.querySelector('[data-film-toggle]');
if (hero && filmButton) {
  let pausedByUser = false, inView = true;
  const updateLabel = () => {
    filmButton.textContent = hero.paused ? ui('Play film','播放视频') : ui('Pause film','暂停视频');
    filmButton.setAttribute('aria-label', hero.paused ? ui('Play background film','播放背景视频') : ui('Pause background film','暂停背景视频'));
    filmButton.setAttribute('aria-pressed', String(!hero.paused));
  };
  const playIfAllowed = () => {
    const otherPlaying = [...document.querySelectorAll('[data-demo-video]')].some(v => !v.paused);
    if (pausedByUser || document.hidden || !inView || motion.matches || otherPlaying) {hero.pause(); return;}
    hero.play().catch(updateLabel);
  };
  filmButton.addEventListener('click', () => {
    if (hero.paused) {
      pausedByUser = false;
      hero.play().catch(updateLabel);
    } else {pausedByUser = true; hero.pause();}
  });
  hero.addEventListener('play', updateLabel);
  hero.addEventListener('pause', updateLabel);
  hero.addEventListener('error', () => {filmButton.textContent = ui('Film unavailable','视频暂不可用'); filmButton.disabled = true;});
  document.addEventListener('visibilitychange', playIfAllowed);
  motion.addEventListener('change', playIfAllowed);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {inView = entries[0].isIntersecting; playIfAllowed();},{threshold:0.05}).observe(hero);
  }
  updateLabel();
  playIfAllowed();
}
document.querySelectorAll('.film-fold').forEach(details => details.addEventListener('toggle', () => {
  if (!details.open) details.querySelectorAll('video').forEach(v => v.pause());
}));
document.addEventListener('play', event => {
  if (event.target.matches?.('[data-demo-video]')) {
    document.querySelectorAll('video').forEach(v => {if (v !== event.target) v.pause();});
  }
}, true);
