(function () {
  'use strict';

  function initShell() {
    const toggle = document.getElementById('navToggle');
    const nav = document.getElementById('appNav');
    const backdrop = document.getElementById('navBackdrop');

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

    // Staggered reveal on scroll
    const animatedItems = document.querySelectorAll(
      '.card, .slip-card, .kpi-tile, .dashboard-section, .table-wrap, .filter-panel, .landing-stage__step'
    );
    animatedItems.forEach((item, index) => {
      item.style.setProperty('--motion-delay', `${Math.min(index * 40, 280)}ms`);
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
        { threshold: 0.06 }
      );
      document.querySelectorAll('.motion-ready').forEach((item) => observer.observe(item));
    } else {
      document.querySelectorAll('.motion-ready').forEach((item) => item.classList.add('motion-visible'));
    }

    // Interactive 3D tilt on cards marked [data-tilt]
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.querySelectorAll('[data-tilt]').forEach((card) => {
        card.addEventListener('pointermove', (e) => {
          const rect = card.getBoundingClientRect();
          const x = (e.clientX - rect.left) / rect.width - 0.5;
          const y = (e.clientY - rect.top) / rect.height - 0.5;
          card.style.setProperty('--tilt-x', `${(-y * 5).toFixed(2)}deg`);
          card.style.setProperty('--tilt-y', `${(x * 6).toFixed(2)}deg`);
        });
        card.addEventListener('pointerleave', () => {
          card.style.setProperty('--tilt-x', '0deg');
          card.style.setProperty('--tilt-y', '0deg');
        });
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initShell);
  } else {
    initShell();
  }
})();
