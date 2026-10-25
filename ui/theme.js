const $ = (id) => document.getElementById(id);

export function setupTheme(onChange, initialPreference) {
  function themeLabel() {
    $('theme').setAttribute(
      'aria-label',
      `Switch to ${document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'} theme`,
    );
    $('theme').textContent =
      document.documentElement.dataset.theme === 'dark' ? '☼' : '☾';
  }
  const themePreference = matchMedia('(prefers-color-scheme: dark)');
  let manualTheme = ['light', 'dark'].includes(initialPreference);
  function refreshTheme() {
    themeLabel();
    onChange();
  }
  let themeTransition;
  function setTheme(theme) {
    themeTransition?.skipTransition();
    const updateTheme = () => {
      document.documentElement.dataset.theme = theme;
      refreshTheme();
    };
    if (
      document.startViewTransition &&
      !matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      themeTransition = document.startViewTransition(updateTheme);
    } else updateTheme();
  }
  themePreference.addEventListener('change', (event) => {
    if (manualTheme) return;
    setTheme(event.matches ? 'dark' : 'light');
  });
  $('theme').onclick = () => {
    manualTheme = true;
    const theme =
      document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    setTheme(theme);
    try {
      localStorage.setItem('theme', theme);
    } catch {}
  };
  themeLabel();
}
