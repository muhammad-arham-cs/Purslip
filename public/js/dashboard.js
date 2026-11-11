/* Dashboard chart — spending by category doughnut */
(function () {
  'use strict';

  var COLORS = [
    '#2f6f4f', '#4fae7d', '#6cc494', '#96d6b4', '#c0e8d4',
    '#b8860b', '#d4a843', '#e8c97b', '#f0daa8', '#f8ecd5',
    '#5b7fb4', '#7d9ccb', '#a0b9de', '#c3d6ee', '#e6f0fa',
    '#9b59b6', '#b07cc7', '#c59fd8', '#dac2e9', '#efe5fa',
  ];

  function initSpendingChart() {
    var data = window.__SPENDING_DATA__;
    if (!data || !data.length) return;

    var canvas = document.getElementById('spendingChart');
    if (!canvas) return;

    var labels = data.map(function (d) {
      return d.parent_name ? d.parent_name + ' › ' + (d.category_name || 'Uncategorized') : (d.category_name || 'Uncategorized');
    });
    var amounts = data.map(function (d) { return d.total; });

    new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: amounts,
          backgroundColor: COLORS.slice(0, labels.length),
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 12,
              padding: 10,
              font: { size: 11 },
              color: getComputedStyle(document.documentElement).getPropertyValue('--color-text').trim() || '#1a1d23',
            },
          },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                return ctx.label + ': ' + (window.dashboardCurrency || 'PKR') + ' ' + ctx.parsed.toLocaleString('en-US', { minimumFractionDigits: 2 });
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
})();
