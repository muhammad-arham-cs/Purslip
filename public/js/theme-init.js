(function () {
  var script = document.currentScript;
  var saved = null;
  try { saved = window.localStorage.getItem('purslip-theme'); } catch (e) { /* storage blocked */ }
  var theme = saved || (script && script.dataset.theme) || 'dark';
  if (theme !== 'light' && theme !== 'dark' && theme !== 'night') theme = 'dark';
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.add('js');
})();
