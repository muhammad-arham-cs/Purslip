(function () {
  const script = document.currentScript;
  const language = script?.dataset.language || 'en';
  const savedTheme = window.localStorage.getItem('purslip-theme');
  const theme = savedTheme || script?.dataset.theme || 'dark';
  document.documentElement.dataset.theme = theme;
  document.documentElement.lang = language;

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

  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'light' ? 'dark'
        : document.documentElement.dataset.theme === 'dark' ? 'night' : 'light';
      document.documentElement.dataset.theme = next;
      window.localStorage.setItem('purslip-theme', next);
    });
  }
})();
