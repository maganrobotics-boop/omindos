(() => {
  const done = document.body.dataset.copyDone || 'Copied';
  const failed = document.body.dataset.copyFail || 'Select and copy the code';
  document.querySelectorAll('.api-copy').forEach(button => {
    if (!navigator.clipboard?.writeText) return;
    button.hidden = false;
    button.setAttribute('aria-live', 'polite');
    const label = button.textContent;
    button.addEventListener('click', async () => {
      const code = button.closest('.api-code').querySelector('code');
      try {
        await navigator.clipboard.writeText(code.textContent);
        button.textContent = done;
      } catch {
        button.textContent = failed;
      }
      window.setTimeout(() => { button.textContent = label; }, 2500);
    });
  });
})();
