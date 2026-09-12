// Apply before paint; storage is optional (private browsing / blocked storage).
(() => {
  let choice = 'system';
  try { choice = localStorage.getItem('paper-theme') || 'system'; } catch {}
  if (!['light', 'dark', 'system'].includes(choice)) choice = 'system';
  const media = matchMedia('(prefers-color-scheme: dark)');
  function apply(value) {
    choice = value;
    document.documentElement.dataset.theme = value === 'system' ? (media.matches ? 'dark' : 'light') : value;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', document.documentElement.dataset.theme === 'dark' ? '#24231f' : '#f7f5ef');
  }
  apply(choice);
  media.addEventListener('change', () => { if (choice === 'system') apply(choice); });
  document.addEventListener('DOMContentLoaded', () => {
    const select = document.querySelector('#theme-select');
    select.value = choice;
    select.closest('label').hidden = false;
    select.addEventListener('change', () => {
      apply(select.value);
      try { localStorage.setItem('paper-theme', select.value); } catch {}
    });
  });
})();
