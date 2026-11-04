document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('navToggle');
  const nav = document.getElementById('appNav');

  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const isOpen = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(isOpen));
    });
  }

  const animatedItems = document.querySelectorAll(
    '.card, .dashboard-section, .table-wrap, .filter-panel, .app-nav a'
  );
  animatedItems.forEach((item, index) => {
    item.style.setProperty('--motion-delay', `${Math.min(index * 35, 280)}ms`);
    item.classList.add('motion-ready');
  });

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries, instance) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('motion-visible');
          instance.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08 });
    document.querySelectorAll('.motion-ready').forEach((item) => observer.observe(item));
  } else {
    document.querySelectorAll('.motion-ready').forEach((item) => item.classList.add('motion-visible'));
  }
});
