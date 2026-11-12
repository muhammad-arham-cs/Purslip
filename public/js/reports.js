/* Reports page — multiple Chart.js charts (CSP-safe) */
(function () {
  'use strict';

  var COLORS = [
    '#e9b949', '#2cc996', '#4ea8ff', '#f06478', '#9b7bff',
    '#41c4c4', '#f59342', '#7cc668', '#e07ab8', '#6888e0',
  ];

  var charts = [];

  function readJson(id, fallbackGlobal) {
    var el = document.getElementById(id);
    if (el && el.textContent) {
      try {
        return JSON.parse(el.textContent);
      } catch (_e) { /* fall through */ }
    }
    return fallbackGlobal || [];
  }

  function textColor() {
    return getComputedStyle(document.documentElement).getPropertyValue('--color-text').trim() || '#e8edf6';
  }

  function gridColor() {
    return getComputedStyle(document.documentElement).getPropertyValue('--color-border').trim() || 'rgba(255,255,255,0.12)';
  }

  function getCurrency() {
    var el = document.querySelector('[data-currency]');
    return (el && el.getAttribute('data-currency')) || window.reportCurrency || 'PKR';
  }

  function dollarCallback(value) {
    return getCurrency() + ' ' + Number(value).toLocaleString('en-US');
  }

  function initSpendingPie() {
    var data = readJson('spendingReportData', window.__SPENDING_DATA__);
    if (!data || !data.length) return;

    var canvas = document.getElementById('spendingPie');
    if (!canvas) return;

    var labels = data.map(function (d) {
      return d.parent_name ? d.parent_name + ' › ' + (d.category_name || 'Uncategorized') : (d.category_name || 'Uncategorized');
    });
    var amounts = data.map(function (d) { return d.total; });

    charts.push(new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: amounts,
          backgroundColor: COLORS.slice(0, Math.max(labels.length, 1)),
          borderWidth: 2,
          borderColor: getComputedStyle(document.documentElement).getPropertyValue('--color-surface-solid').trim() || '#111b2e',
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '64%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 10,
              boxHeight: 10,
              usePointStyle: true,
              padding: 10,
              font: { size: 11 },
              color: textColor(),
            },
          },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                return ctx.label + ': ' + getCurrency() + ' ' + ctx.parsed.toLocaleString('en-US', { minimumFractionDigits: 2 });
              },
            },
          },
        },
      },
    }));
  }

  function initTrendsChart() {
    var data = readJson('trendsReportData', window.__TRENDS_DATA__);
    if (!data || !data.length) return;

    var canvas = document.getElementById('trendsChart');
    if (!canvas) return;

    var labels = data.map(function (d) { return d.month; });

    charts.push(new Chart(canvas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Income',
            data: data.map(function (d) { return d.income; }),
            backgroundColor: '#2cc996',
            borderRadius: 6,
          },
          {
            label: 'Expenses',
            data: data.map(function (d) { return d.expenses; }),
            backgroundColor: '#f06478',
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: {
            ticks: { color: textColor(), font: { size: 11 } },
            grid: { color: gridColor() },
          },
          y: {
            ticks: { color: textColor(), callback: dollarCallback },
            grid: { color: gridColor() },
          },
        },
        plugins: {
          legend: { labels: { color: textColor() } },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                return ctx.dataset.label + ': ' + getCurrency() + ' ' + ctx.parsed.y.toLocaleString('en-US', { minimumFractionDigits: 2 });
              },
            },
          },
        },
      },
    }));
  }

  function initCategoryTrendsChart() {
    var data = readJson('categoryTrendsReportData', window.__CATEGORY_TRENDS_DATA__);
    if (!data || !data.length) return;

    var canvas = document.getElementById('categoryTrendsChart');
    if (!canvas) return;

    var monthSet = [];
    var catSet = [];
    data.forEach(function (d) {
      if (monthSet.indexOf(d.month) === -1) monthSet.push(d.month);
      if (catSet.indexOf(d.category_name) === -1) catSet.push(d.category_name);
    });

    var lookup = {};
    data.forEach(function (d) {
      lookup[d.month + '|' + d.category_name] = d.total;
    });

    var datasets = catSet.map(function (cat, i) {
      return {
        label: cat,
        backgroundColor: COLORS[i % COLORS.length],
        borderRadius: 4,
        data: monthSet.map(function (m) {
          return lookup[m + '|' + cat] || 0;
        }),
      };
    });

    charts.push(new Chart(canvas, {
      type: 'bar',
      data: { labels: monthSet, datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: {
            stacked: true,
            ticks: { color: textColor(), font: { size: 11 } },
            grid: { color: gridColor() },
          },
          y: {
            stacked: true,
            ticks: { color: textColor(), callback: dollarCallback },
            grid: { color: gridColor() },
          },
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 10, padding: 10, color: textColor(), font: { size: 11 } },
          },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                return ctx.dataset.label + ': ' + getCurrency() + ' ' + ctx.parsed.y.toLocaleString('en-US', { minimumFractionDigits: 2 });
              },
            },
          },
        },
      },
    }));
  }

  function initNetWorthChart() {
    var data = readJson('netWorthReportData', window.__NET_WORTH_DATA__);
    if (!data || !data.length) return;

    var canvas = document.getElementById('netWorthChart');
    if (!canvas) return;

    charts.push(new Chart(canvas, {
      type: 'line',
      data: {
        labels: data.map(function (d) { return d.month; }),
        datasets: [{
          label: 'Net Worth',
          data: data.map(function (d) { return d.net_worth; }),
          borderColor: '#e9b949',
          backgroundColor: 'rgba(233, 185, 73, 0.14)',
          fill: true,
          tension: 0.32,
          pointRadius: 3.5,
          pointHoverRadius: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            ticks: { color: textColor(), font: { size: 11 } },
            grid: { color: gridColor() },
          },
          y: {
            ticks: { color: textColor(), callback: dollarCallback },
            grid: { color: gridColor() },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                return 'Net Worth: ' + getCurrency() + ' ' + ctx.parsed.y.toLocaleString('en-US', { minimumFractionDigits: 2 });
              },
            },
          },
        },
      },
    }));
  }

  function init() {
    if (typeof Chart === 'undefined') return;
    charts.forEach(function (c) { c.destroy(); });
    charts = [];
    initSpendingPie();
    initTrendsChart();
    initCategoryTrendsChart();
    initNetWorthChart();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('purslip:themechange', init);
})();
