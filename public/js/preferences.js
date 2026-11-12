(function () {
  const script = document.currentScript;
  const language = script?.dataset.language || 'en';
  let savedTheme = null;
  try {
    savedTheme = window.localStorage.getItem('purslip-theme');
  } catch (e) { /* storage blocked */ }
  const theme = savedTheme || script?.dataset.theme || 'dark';
  document.documentElement.dataset.theme = theme;
  document.documentElement.lang = language;

  const THEME_LABELS = {
    light: 'Light',
    dark: 'Dark',
    night: 'Night',
  };

  function syncThemeLabels(activeTheme) {
    document.querySelectorAll('[data-theme-label]').forEach((el) => {
      el.textContent = THEME_LABELS[activeTheme] || 'Theme';
    });
  }

  const urdu = {
    'Purslip — your data, your control.': 'Purslip — آپ کا ڈیٹا، آپ کا اختیار۔',
    'Dashboard': 'ڈیش بورڈ',
    'Accounts': 'اکاؤنٹس',
    'Transactions': 'ٹرانزیکشنز',
    'Categories': 'کیٹیگریز',
    'Import': 'امپورٹ',
    'Budgets': 'بجٹ',
    'Recurring': 'بار بار آنے والے',
    'Reports': 'رپورٹس',
    'Goals': 'اہداف',
    'Debts': 'قرضے',
    'Settings': 'ترتیبات',
    'Log out': 'لاگ آؤٹ',
    'Account title': 'اکاؤنٹ کا عنوان',
    'Bank / provider name': 'بینک / فراہم کنندہ کا نام',
    'Currency code': 'کرنسی کوڈ',
    'Opening balance': 'ابتدائی بیلنس',
    'Current balance': 'موجودہ بیلنس',
    'Type': 'قسم',
    'Account': 'اکاؤنٹ',
    'Date': 'تاریخ',
    'Amount': 'رقم',
    'Payee': 'وصول کنندہ',
    'Note': 'نوٹ',
    'Expense': 'خرچ',
    'Income': 'آمدنی',
    'Save': 'محفوظ کریں',
    'Save changes': 'تبدیلیاں محفوظ کریں',
    'Add account': 'اکاؤنٹ شامل کریں',
    'Add transaction': 'ٹرانزیکشن شامل کریں',
    'Edit account': 'اکاؤنٹ میں ترمیم',
    'Something went wrong': 'کچھ غلط ہو گیا',
    'Back home': 'واپس ہوم',
    'Save settings': 'ترتیبات محفوظ کریں',
    'Search & Filter': 'تلاش اور فلٹر',
    'Show archived accounts': 'محفوظ شدہ اکاؤنٹس دکھائیں',
    'Add category': 'کیٹیگری شامل کریں',
    'New goal': 'نیا ہدف',
    'Export CSV': 'CSV برآمد کریں',
  };

  function initPreferences() {
    syncThemeLabels(document.documentElement.dataset.theme || 'dark');

    if (language === 'ur') {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach((node) => {
        const value = node.nodeValue.trim();
        if (urdu[value]) node.nodeValue = node.nodeValue.replace(value, urdu[value]);
      });
      document.querySelectorAll('input[placeholder], textarea[placeholder]').forEach((input) => {
        if (urdu[input.placeholder]) input.placeholder = urdu[input.placeholder];
      });
    }

    const toggles = document.querySelectorAll('#themeToggle, [data-theme-toggle]');
    toggles.forEach((btn) => {
      btn.addEventListener('click', () => {
        const current = document.documentElement.dataset.theme;
        const next = current === 'light' ? 'dark' : current === 'dark' ? 'night' : 'light';
        document.documentElement.dataset.theme = next;
        try {
          window.localStorage.setItem('purslip-theme', next);
        } catch (e) { /* storage blocked */ }
        syncThemeLabels(next);
        window.dispatchEvent(new CustomEvent('purslip:themechange', { detail: { theme: next } }));
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPreferences);
  } else {
    initPreferences();
  }
})();
