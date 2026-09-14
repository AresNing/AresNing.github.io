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
    const control = document.querySelector('.theme-control');
    if (!control) return;
    const radios = control.querySelectorAll('input[name="theme"]');
    radios.forEach(radio => { radio.checked = radio.value === choice; });
    control.hidden = false;
    control.addEventListener('change', event => {
      const radio = event.target;
      if (!radio.matches('input[name="theme"]') || !radio.checked) return;
      apply(radio.value);
      try { localStorage.setItem('paper-theme', radio.value); } catch {}
    });
  });
})();
