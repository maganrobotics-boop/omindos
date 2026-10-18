/* Compact the existing Chat launcher while the last footer lines are in view. */
(() => {
  'use strict';
  const footerEnd = document.querySelector('.cn-footer-bottom');
  if (!footerEnd || !('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver(([entry]) => {
    document.documentElement.classList.toggle('home-footer-visible', entry.isIntersecting);
  });
  observer.observe(footerEnd);
})();

