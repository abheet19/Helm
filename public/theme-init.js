(function () {
  try {
    const theme = localStorage.getItem('helm.theme');
    if (theme === 'light' || theme === 'dark') {
      document.documentElement.setAttribute('data-theme', theme);
    }
    if (localStorage.getItem('helm.flat') === '1') {
      document.documentElement.setAttribute('data-flat', '1');
    }
  } catch {
    // Storage can be unavailable in locked-down or private browser contexts.
  }
})();
