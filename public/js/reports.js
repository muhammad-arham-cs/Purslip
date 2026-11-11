/* Reports page — multiple Chart.js charts */
(function () {
  'use strict';

  var COLORS = [
    '#2f6f4f', '#4fae7d', '#6cc494', '#96d6b4', '#c0e8d4',
    '#b8860b', '#d4a843', '#e8c97b', '#f0daa8', '#f8ecd5',
    '#5b7fb4', '#7d9ccb', '#a0b9de', '#c3d6ee', '#e6f0fa',
    '#9b59b6', '#b07cc7', '#c59fd8', '#dac2e9', '#efe5fa',
  ];

  function textColor() {
    return getComputedStyle(document.documentElement).getPropertyValue('--color-text').trim() || '#1a1d23';
  }

  function gridColor() {
    return getComputedStyle(document.documentElement).getPropertyValue('--color-border').trim() || '#e1e4e9';
  }

  function dollarCallback(value) {
    return (window.reportCurrency || 'PKR') + ' ' + Number(value).toLocaleString('en-US');
  }

  // ---- Spending by Category Doughnut ----
  function initSpendingPie() {
    var data = window.__SPENDING_DATA__;
    if (!data || !data.length) return;

    var canvas = document.getElementById('spendingPie');
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
              padding: 8,
              font: { size: 11 },
              color: textColor(),
            },
          },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                return ctx.label + ': ' + (window.reportCurrency || 'PKR') + ' ' + ctx.parsed.toLocaleString('en-US', { minimumFractionDigits: 2 });
              },
            },
          },
        },
      },
    });
  }

  // ---- Monthly Trends (income vs expenses bar chart) ----
  function initTrendsChart() {
    var data = window.__TRENDS_DATA__;
    if (!data || !data.length) return;

    var canvas = document.getElementById('trendsChart');
    if (!canvas) return;

    var labels = data.map(function (d) { return d.month; });

    new Chart(canvas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Income',
            data: data.map(function (d) { return d.income; }),
            backgroundColor: '#4fae7d',
          },
          {
            label: 'Expenses',
            data: data.map(function (d) { return d.expenses; }),
            backgroundColor: '#b3261e',
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
          legend: {
            labels: { color: textColor() },
          },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                return ctx.dataset.label + ': ' + (window.reportCurrency || 'PKR') + ' ' + ctx.parsed.y.toLocaleString('en-US', { minimumFractionDigits: 2 });
              },
            },
          },
        },
      },
    });
  }

  // ---- Category Spending Over Time (grouped bar) ----
  function initCategoryTrendsChart() {
    var data = window.__CATEGORY_TRENDS_DATA__;
    if (!data || !data.length) return;

    var canvas = document.getElementById('categoryTrendsChart');
    if (!canvas) return;

    // Pivot: unique months as x-axis labels, unique categories as datasets
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
        data: monthSet.map(function (m) {
          return lookup[m + '|' + cat] || 0;
        }),
      };
    });

    new Chart(canvas, {
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
            labels: { boxWidth: 12, padding: 8, color: textColor(), font: { size: 11 } },
          },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                return ctx.dataset.label + ': ' + (window.reportCurrency || 'PKR') + ' ' + ctx.parsed.y.toLocaleString('en-US', { minimumFractionDigits: 2 });
              },
            },
          },
        },
      },
    });
  }

  // ---- Net Worth Over Time (line chart) ----
  function initNetWorthChart() {
    var data = window.__NET_WORTH_DATA__;
    if (!data || !data.length) return;

    var canvas = document.getElementById('netWorthChart');
    if (!canvas) return;

    new Chart(canvas, {
      type: 'line',
      data: {
        labels: data.map(function (d) { return d.month; }),
        datasets: [{
          label: 'Net Worth',
          data: data.map(function (d) { return d.net_worth; }),
          borderColor: '#2f6f4f',
          backgroundColor: 'rgba(47, 111, 79, 0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 5,
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
                return 'Net Worth: ' + (window.reportCurrency || 'PKR') + ' ' + ctx.parsed.y.toLocaleString('en-US', { minimumFractionDigits: 2 });
              },
            },
          },
        },
      },
    });
  }

  function init() {
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
})();
