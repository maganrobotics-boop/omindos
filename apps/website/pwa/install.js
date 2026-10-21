(() => {
  'use strict';

  if (document.querySelector('[data-originmind-pwa]')) return;
  const footer = document.querySelector('footer');
  if (!footer) return;

  const english = document.documentElement.lang.toLowerCase().startsWith('en');
  const standalone = window.matchMedia('(display-mode: standalone)');
  const fullscreen = window.matchMedia('(display-mode: fullscreen)');
  let installed = navigator.standalone === true || standalone.matches || fullscreen.matches;
  let installPrompt = null;

  const container = document.createElement('div');
  container.className = 'omindos-pwa-control';
  container.dataset.originmindPwa = '';
  container.hidden = installed;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'omindos-pwa-install';
  button.textContent = english ? 'Install app' : '安装到桌面';
  container.append(button);
  footer.append(container);

  const dialog = document.createElement('dialog');
  dialog.className = 'omindos-pwa-dialog';
  dialog.setAttribute('aria-labelledby', 'omindos-pwa-title');
  const title = document.createElement('h2');
  title.id = 'omindos-pwa-title';
  title.textContent = english ? 'Keep OriginMind on your desktop' : '把 OriginMind 添加到桌面';
  const intro = document.createElement('p');
  intro.textContent = english
    ? 'Open the website from its own icon. An internet connection is needed for website content and online services.'
    : '通过独立图标打开官网。浏览内容和使用在线服务仍需要联网。';
  const steps = document.createElement('ul');
  const instructions = english ? [
    'Android: open this page in Chrome, then choose “Install app” or “Add to Home screen” from the browser menu.',
    'iPhone or iPad: open this page in Safari, tap Share, then “Add to Home Screen”. Enable “Open as Web App” if shown.',
    'Computer: open the browser menu in Chrome or Edge and look for “Install OriginMind”. In Safari on Mac, choose File → Add to Dock.'
  ] : [
    '安卓：在 Chrome 中打开此页面，点击浏览器菜单，选择“安装应用”或“添加到主屏幕”。',
    'iPhone 或 iPad：在 Safari 中打开此页面，点击“分享”→“添加到主屏幕”；如出现“作为网页 App 打开”，请开启。',
    '电脑：在 Chrome 或 Edge 的浏览器菜单中查找“安装 OriginMind”；Mac 的 Safari 可选择“文件”→“添加到程序坞”。'
  ];
  for (const instruction of instructions) {
    const item = document.createElement('li');
    item.textContent = instruction;
    steps.append(item);
  }
  const note = document.createElement('p');
  note.className = 'omindos-pwa-note';
  note.textContent = english
    ? 'The option depends on your browser. If you are inside another app, open this page in your system browser first.'
    : '安装选项因浏览器而异。如在微信等应用内浏览，请先选择“在浏览器中打开”。';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'omindos-pwa-close';
  close.textContent = english ? 'Close' : '关闭';
  close.autofocus = true;
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    if (!container.hidden) button.focus();
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  });
  dialog.append(title, intro, steps, note, close);
  document.body.append(dialog);

  const syncInstalled = () => {
    installed = installed || navigator.standalone === true || standalone.matches || fullscreen.matches;
    container.hidden = installed;
    if (installed && dialog.open) dialog.close();
  };
  standalone.addEventListener?.('change', syncInstalled);
  fullscreen.addEventListener?.('change', syncInstalled);
  window.addEventListener('appinstalled', () => {
    installed = true;
    installPrompt = null;
    syncInstalled();
  });
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
  });
  button.addEventListener('click', async () => {
    const prompt = installPrompt;
    if (!prompt) {
      dialog.showModal();
      return;
    }
    installPrompt = null;
    button.disabled = true;
    try {
      await prompt.prompt();
      await prompt.userChoice;
      // Only appinstalled or standalone mode confirms installation.
    } catch {
      dialog.showModal();
    } finally {
      button.disabled = false;
    }
  });

  if ('serviceWorker' in navigator && window.isSecureContext) {
    // A new worker waits for open pages to close; it never forces a form reload.
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/pwa/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {
        // Installation instructions remain usable when offline support is unavailable.
      });
    }, { once: true });
  }
})();
