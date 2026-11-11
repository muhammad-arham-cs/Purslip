(function () {
  const savedTheme = window.localStorage.getItem('purslip-theme');
  const theme = savedTheme || 'dark';
  document.documentElement.dataset.theme = theme;
})();
