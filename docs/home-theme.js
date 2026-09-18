(() => {
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  const storageKey = 'sleepy-pokemon-theme';
  let choice = readChoice();

  function readChoice() {
    let saved = '';
    try {
      saved = window.localStorage.getItem(storageKey) || '';
    } catch {
      // Private browsing or file previews may make storage unavailable.
    }
    if (saved !== 'light' && saved !== 'dark') {
      const match = document.cookie.match(new RegExp(`(?:^|; )${storageKey}=([^;]*)`));
      saved = match ? decodeURIComponent(match[1]) : '';
    }
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  }

  function saveChoice(value) {
    try {
      window.localStorage.setItem(storageKey, value);
    } catch {
      // Private browsing or file previews may make storage unavailable.
    }
    document.cookie = `${storageKey}=${encodeURIComponent(value)}; path=/; max-age=31536000; SameSite=Lax`;
  }

  function apply() {
    document.documentElement.dataset.theme = choice === 'system'
      ? (system.matches ? 'dark' : 'light') : choice;
    const toggle = document.getElementById('themeToggle');
    if (toggle) {
      const dark = document.documentElement.dataset.theme === 'dark';
      toggle.setAttribute('aria-checked', String(dark));
      toggle.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
    }
  }
  apply();
  system.addEventListener('change', apply);
  document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('themeToggle');
    apply();
    if (!toggle) return;
    toggle.addEventListener('click', () => {
      choice = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      saveChoice(choice);
      apply();
    });
  });
})();
