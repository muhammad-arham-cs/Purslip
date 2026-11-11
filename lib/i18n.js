const dictionaries = {
  ur: {
    Dashboard: 'ڈیش بورڈ',
    Accounts: 'اکاؤنٹس',
    Transactions: 'ٹرانزیکشنز',
    Categories: 'کیٹیگریز',
    Import: 'امپورٹ',
    Budgets: 'بجٹ',
    Recurring: 'بار بار آنے والے',
    Reports: 'رپورٹس',
    Goals: 'اہداف',
    Settings: 'ترتیبات',
    'Log out': 'لاگ آؤٹ',
    'Toggle navigation': 'نیویگیشن کھولیں',
    'Display currency': 'نمائش کی کرنسی',
    'Language': 'زبان',
    Theme: 'تھیم',
    'Light mode': 'لائٹ موڈ',
    'Dark mode': 'ڈارک موڈ',
    'Night mode': 'نائٹ موڈ',
    English: 'انگریزی',
    Urdu: 'اردو',
    'Save settings': 'ترتیبات محفوظ کریں',
    Settings: 'ترتیبات',
  },
};

function translate(key, language = 'en') {
  return dictionaries[language]?.[key] || key;
}

module.exports = { translate };
