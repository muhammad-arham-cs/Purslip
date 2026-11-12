// Purslip ACRU Dashboard — 7-day stacked bar chart, interactive glass tooltip, card carousel & modal
(function () {
  function parseJsonScript(id) {
    const el = document.getElementById(id);
    if (!el) return [];
    try {
      const parsed = JSON.parse(el.textContent || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function formatCompact(n) {
    const val = Math.round(Number(n) || 0);
    return val.toLocaleString();
  }

  function formatAxisTick(n) {
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (abs >= 1000000) return `${sign}${(abs / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
    if (abs >= 1000) return `${sign}${Math.round(abs / 1000)}k`;
    return `${sign}${Math.round(abs)}`;
  }

  function buildEmptyWeek() {
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const now = new Date();
    const out = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(now.getTime() - i * 86400000);
      out.push({
        date: d.toISOString().slice(0, 10),
        dayLabel: names[d.getUTCDay()],
        fullLabel: d.toLocaleDateString('en-US', {
          weekday: 'long',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          timeZone: 'UTC',
        }),
        income: 0,
        expenses: 0,
        savings: 0,
      });
    }
    return out;
  }

  function renderWeeklyChart() {
    const stage = document.getElementById('acruWeeklyStage');
    const tooltip = document.getElementById('acruWeeklyTooltip');
    const yAxis = document.getElementById('acruWeeklyYAxis');
    if (!stage) return;

    const rawDays = parseJsonScript('dashboardDailyFlowData');
    const days = rawDays.length ? rawDays : buildEmptyWeek();
    const hasActivity = days.some((d) => Number(d.income) > 0 || Number(d.expenses) > 0);

    const maxPositive = Math.max(
      1,
      ...days.map((d) => Number(d.income || 0) + Number(d.savings || 0))
    );
    const maxExpense = Math.max(
      1,
      ...days.map((d) => Number(d.expenses || 0))
    );

    if (yAxis) {
      if (hasActivity) {
        const topScale = Math.ceil(maxPositive / 100) * 100;
        const midHigh = Math.round(topScale * 0.66);
        const midLow = Math.round(topScale * 0.33);
        const negScale = Math.ceil(maxExpense / 100) * 100;
        yAxis.innerHTML = `
          <span>${formatAxisTick(topScale)}</span>
          <span>${formatAxisTick(midHigh)}</span>
          <span>${formatAxisTick(midLow)}</span>
          <span>0</span>
          <span>-${formatAxisTick(negScale)}</span>
        `;
      } else {
        yAxis.innerHTML = `
          <span>0</span>
          <span>0</span>
          <span>0</span>
          <span>0</span>
          <span>0</span>
        `;
      }
    }

    // Highlight the most recent day with activity, or today (last bar) when empty
    let activeIdx = days.length - 1;
    let bestScore = 0;
    days.forEach((d, idx) => {
      const score = Number(d.income || 0) + Number(d.expenses || 0);
      if (score >= bestScore && score > 0) {
        bestScore = score;
        activeIdx = idx;
      }
    });

    stage.innerHTML = '';

    function updateTooltip(idx) {
      if (!tooltip) return;
      const d = days[idx];
      if (!d) return;

      tooltip.hidden = false;
      tooltip.innerHTML = `
        <div class="acru-weekly-tooltip__date">${d.fullLabel || d.date || d.dayLabel}</div>
        <div class="acru-weekly-tooltip__row"><span class="dot dot--savings"></span><span>Savings</span><strong class="num">${formatCompact(d.savings)}</strong></div>
        <div class="acru-weekly-tooltip__row"><span class="dot dot--income"></span><span>Income</span><strong class="num">${formatCompact(d.income)}</strong></div>
        <div class="acru-weekly-tooltip__row"><span class="dot dot--expenses"></span><span>Expenses</span><strong class="num">${formatCompact(d.expenses)}</strong></div>
      `;
      const pctLeft = ((idx + 0.5) / days.length) * 100;
      tooltip.style.left = `${Math.min(82, Math.max(18, pctLeft))}%`;
    }

    days.forEach((d, idx) => {
      const col = document.createElement('button');
      col.type = 'button';
      col.className = `acru-day-col${idx === activeIdx ? ' is-highlighted' : ''}`;
      col.setAttribute('aria-label', `${d.dayLabel}: Income ${formatCompact(d.income)}, Expenses ${formatCompact(d.expenses)}`);

      const savVal = Number(d.savings || 0);
      const incVal = Number(d.income || 0);
      const expVal = Number(d.expenses || 0);

      const savPct = savVal > 0 ? Math.max(10, Math.min(28, Math.round((savVal / maxPositive) * 35))) : 6;
      const incPct = incVal > 0 ? Math.max(16, Math.min(68, Math.round((incVal / maxPositive) * 70))) : 10;
      const expPct = expVal > 0 ? Math.max(12, Math.min(28, Math.round((expVal / (maxExpense * 1.4)) * 28))) : 6;

      col.innerHTML = `
        <div class="acru-day-col__bars">
          <span class="acru-bar acru-bar--savings" style="height:${savPct}%"></span>
          <span class="acru-bar acru-bar--income" style="height:${incPct}%"></span>
          <span class="acru-bar acru-bar--expenses" style="height:${expPct}%"></span>
        </div>
        <span class="acru-day-col__label">${d.dayLabel}</span>
      `;

      const activate = () => {
        stage.querySelectorAll('.acru-day-col').forEach((el) => el.classList.remove('is-highlighted'));
        col.classList.add('is-highlighted');
        updateTooltip(idx);
      };

      col.addEventListener('mouseenter', activate);
      col.addEventListener('focus', activate);
      col.addEventListener('click', activate);

      stage.appendChild(col);
    });

    updateTooltip(activeIdx);

    // Chart mode toggle buttons
    document.querySelectorAll('[data-chart-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-chart-view]').forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        stage.classList.toggle('is-all-lit', btn.dataset.chartView === 'compact');
      });
    });
  }

  function initCardModalAndCarousel() {
    const modal = document.getElementById('addCardModal');
    const openBtns = document.querySelectorAll('[data-open-card-modal]');
    const closeBtns = document.querySelectorAll('[data-close-card-modal]');

    if (modal) {
      openBtns.forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          modal.hidden = false;
          const firstInput = modal.querySelector('input:not([type="hidden"]), select');
          if (firstInput) firstInput.focus();
        });
        btn.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            modal.hidden = false;
          }
        });
      });

      closeBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          modal.hidden = true;
        });
      });

      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.hidden = true;
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.hidden) modal.hidden = true;
      });
    }

    const carousel = document.getElementById('acruCardCarousel');
    if (carousel) {
      const cards = carousel.querySelectorAll('.acru-visual-card');
      cards.forEach((card) => {
        card.addEventListener('click', () => {
          cards.forEach((c) => c.classList.remove('is-active'));
          card.classList.add('is-active');
        });
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      renderWeeklyChart();
      initCardModalAndCarousel();
    });
  } else {
    renderWeeklyChart();
    initCardModalAndCarousel();
  }
})();
