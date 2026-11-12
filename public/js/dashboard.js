/* Dashboard chart — spending by category doughnut (CSP-safe) */
(function () {
  'use strict';

  var COLORS = [
    '#e9b949', '#2cc996', '#4ea8ff', '#f06478', '#9b7bff',
    '#41c4c4', '#f59342', '#7cc668', '#e07ab8', '#6888e0',
  ];

  var chartInstance = null;

  function readJsonScript(id, fallbackGlobal) {
    var el = document.getElementById(id);
    if (el && el.textContent) {
      try {
        return JSON.parse(el.textContent);
      } catch (_e) { /* fall through */ }
    }
    return fallbackGlobal || [];
  }

  function currentTextColor() {
    return getComputedStyle(document.documentElement).getPropertyValue('--color-text').trim() || '#e8edf6';
  }

  function initSpendingChart() {
    var data = readJsonScript('spendingData', window.__SPENDING_DATA__);
    if (!data || !data.length || typeof Chart === 'undefined') return;

    var canvas = document.getElementById('spendingChart');
    if (!canvas) return;

    var currency = canvas.getAttribute('data-currency') || window.dashboardCurrency || 'PKR';
    var labels = data.map(function (d) {
      return d.parent_name ? d.parent_name + ' › ' + (d.category_name || 'Uncategorized') : (d.category_name || 'Uncategorized');
    });
    var amounts = data.map(function (d) { return Number(d.total) || 0; });

    if (chartInstance) {
      chartInstance.destroy();
    }

    chartInstance = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: amounts,
          backgroundColor: COLORS.slice(0, Math.max(labels.length, 1)),
          borderWidth: 2,
          borderColor: getComputedStyle(document.documentElement).getPropertyValue('--color-surface-solid').trim() || '#111b2e',
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '66%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 10,
              boxHeight: 10,
              usePointStyle: true,
              padding: 14,
              font: { size: 12, family: "'Onest', system-ui, sans-serif" },
              color: currentTextColor(),
            },
          },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                return ctx.label + ': ' + currency + ' ' + Number(ctx.parsed).toLocaleString('en-US', { minimumFractionDigits: 2 });
              },
            },
          },
        },
      },
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSpendingChart);
  } else {
    initSpendingChart();
  }

  window.addEventListener('purslip:themechange', function () {
    initSpendingChart();
  });
})();
