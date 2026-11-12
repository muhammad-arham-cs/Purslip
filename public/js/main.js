(function () {
  'use strict';

  function initShell() {
    const toggle = document.getElementById('navToggle');
    const nav = document.getElementById('appNav');
    const backdrop = document.getElementById('navBackdrop');
    const header = document.querySelector('.app-header--authed');
    const collapseBtn = document.getElementById('sidebarCollapseBtn');

    // Mark body when authenticated sidebar is present
    if (header) {
      document.body.classList.add('has-sidebar');
      try {
        if (localStorage.getItem('purslip.sidebarCollapsed') === '1') {
          document.body.classList.add('is-sidebar-collapsed');
        }
      } catch {
        // Ignore storage restrictions
      }
    }

    if (collapseBtn) {
      collapseBtn.addEventListener('click', () => {
        const collapsed = document.body.classList.toggle('is-sidebar-collapsed');
        try {
          localStorage.setItem('purslip.sidebarCollapsed', collapsed ? '1' : '0');
        } catch {
          // Ignore storage restrictions
        }
      });
    }

    function setMenuOpen(open) {
      if (!toggle || !nav) return;
      nav.classList.toggle('is-open', open);
      toggle.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      document.body.classList.toggle('nav-open', open);
      if (backdrop) backdrop.hidden = !open;
    }

    if (toggle && nav) {
      toggle.addEventListener('click', () => {
        const isOpen = !nav.classList.contains('is-open');
        setMenuOpen(isOpen);
      });

      if (backdrop) {
        backdrop.addEventListener('click', () => setMenuOpen(false));
      }

      nav.querySelectorAll('a').forEach((link) => {
        link.addEventListener('click', () => setMenuOpen(false));
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && nav.classList.contains('is-open')) {
          setMenuOpen(false);
          toggle.focus();
        }
      });
    }

    // Dismissible flash banners
    document.querySelectorAll('[data-dismiss-flash]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const banner = btn.closest('.flash');
        if (banner) {
          banner.classList.add('is-dismissed');
          setTimeout(() => banner.remove(), 220);
        }
      });
    });

    // CSP-safe confirmation dialogs for destructive forms
    document.addEventListener('submit', (e) => {
      const form = e.target;
      if (form && form.matches && form.matches('form[data-confirm]')) {
        const msg = form.getAttribute('data-confirm') || 'Are you sure?';
        if (!window.confirm(msg)) {
          e.preventDefault();
        }
      }
    });

    // Set main content landmark id if missing so skip-link always has a target
    const main = document.querySelector('main');
    if (main && !main.id) {
      main.id = 'mainContent';
    }

    // Login cooldown live countdown timer (after 5 failed attempts)
    const cooldownBanner = document.querySelector('[data-cooldown-seconds]');
    if (cooldownBanner) {
      let remaining = parseInt(cooldownBanner.getAttribute('data-cooldown-seconds'), 10) || 0;
      const counterEl = cooldownBanner.querySelector('[data-cooldown-counter]');
      const submitBtn = document.getElementById('loginSubmitBtn');
      const timer = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          clearInterval(timer);
          if (counterEl) counterEl.textContent = '0s (Ready)';
          if (submitBtn) submitBtn.disabled = false;
          cooldownBanner.classList.add('is-ready');
        } else if (counterEl) {
          const mins = Math.floor(remaining / 60);
          const secs = remaining % 60;
          counterEl.textContent = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
        }
      }, 1000);
    }

    // 5-Minute Inactivity Auto-Logout Watcher on Authenticated Pages
    const timeoutHeader = document.querySelector('[data-session-timeout]');
    if (timeoutHeader) {
      const timeoutSec = parseInt(timeoutHeader.getAttribute('data-session-timeout'), 10) || 300;
      const timeoutMs = timeoutSec * 1000;
      const warningMs = Math.max(10000, timeoutMs - 45000); // Warn 45s before 5-min auto-logout
      let lastActive = Date.now();
      let warningToast = null;

      const resetIdle = () => {
        lastActive = Date.now();
        if (warningToast) {
          warningToast.hidden = true;
        }
      };

      ['pointerdown', 'mousemove', 'keydown', 'scroll', 'touchstart'].forEach((evt) => {
        window.addEventListener(evt, resetIdle, { passive: true });
      });

      setInterval(() => {
        const idleMs = Date.now() - lastActive;
        if (idleMs >= timeoutMs) {
          window.location.href = '/auth/login?expired=1';
          return;
        }
        if (idleMs >= warningMs) {
          const leftSec = Math.max(1, Math.ceil((timeoutMs - idleMs) / 1000));
          if (!warningToast) {
            warningToast = document.createElement('div');
            warningToast.className = 'idle-warning-toast glass-panel';
            warningToast.setAttribute('role', 'status');
            document.body.appendChild(warningToast);
          }
          warningToast.hidden = false;
          warningToast.innerHTML = `
            <span>Session locks in <strong class="num">${leftSec}s</strong> due to 5-min inactivity rule.</span>
            <button type="button" class="button button--primary button--sm" data-keep-alive>Stay signed in</button>
          `;
          const keepBtn = warningToast.querySelector('[data-keep-alive]');
          if (keepBtn) {
            keepBtn.onclick = () => {
              resetIdle();
              fetch('/healthz', { credentials: 'same-origin' }).catch(() => {});
            };
          }
        }
      }, 1000);
    }

    // Staggered reveal on scroll
    const animatedItems = document.querySelectorAll(
      '.card, .acru-card, .slip-card, .kpi-tile, .dashboard-section, .table-wrap, .filter-panel, .landing-specimen'
    );
    animatedItems.forEach((item, index) => {
      item.style.setProperty('--motion-delay', `${Math.min(index * 35, 260)}ms`);
      item.classList.add('motion-ready');
    });

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(
        (entries, instance) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add('motion-visible');
              instance.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.05 }
      );
      document.querySelectorAll('.motion-ready').forEach((item) => observer.observe(item));
    } else {
      document.querySelectorAll('.motion-ready').forEach((item) => item.classList.add('motion-visible'));
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initShell);
  } else {
    initShell();
  }
})();
