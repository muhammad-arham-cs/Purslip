// Site-wide presentation config: contact details, meta descriptions, year.
// Contact values can be overridden via environment variables.

const SUPPORT_PHONE = (process.env.SUPPORT_PHONE || '+923130479527').trim();
const SUPPORT_EMAIL = (process.env.SUPPORT_EMAIL || 'muhammadarham979@gmail.com').trim();

function telHref(phone) {
  const digits = String(phone || '').replace(/[^\d+]/g, '');
  return digits ? `tel:${digits}` : '';
}

const DEFAULT_DESCRIPTION =
  'Purslip is a private personal finance manager: accounts, transactions, budgets, recurring bills, goals, debts and reports in one clear daily view.';

// Longest matching prefix wins.
const DESCRIPTIONS = [
  ['/auth/login', 'Log in to your private Purslip account to see your balances, spending and budgets.'],
  ['/auth/signup', 'Create a private Purslip account to track accounts, spending, budgets, goals and debts.'],
  ['/auth/forgot-password', 'Reset your Purslip password by verifying your email and CNIC.'],
  ['/auth/reset-password', 'Choose a new password for your Purslip account.'],
  ['/dashboard', 'Your Purslip overview: net worth, account balances, this month\'s income and spending, and upcoming bills.'],
  ['/accounts', 'Manage your bank, cash, card and wallet accounts and their balances in Purslip.'],
  ['/transactions/transfer', 'Move money between your own accounts in Purslip.'],
  ['/transactions', 'Search, filter, add and export your transactions in Purslip.'],
  ['/categories', 'Organise spending and income into categories and sub-categories in Purslip.'],
  ['/import', 'Import transactions from a bank CSV file into Purslip.'],
  ['/budgets', 'Set monthly budgets per category and see how much is left in Purslip.'],
  ['/recurring', 'Schedule recurring bills, salaries and subscriptions in Purslip.'],
  ['/reports', 'Spending by category, income and expense trends, and net worth history in Purslip.'],
  ['/goals', 'Track progress toward your savings goals in Purslip.'],
  ['/debts', 'Keep track of money you have lent and borrowed in Purslip.'],
  ['/settings', 'Manage your Purslip profile, preferences, security and account.'],
];

function descriptionFor(pathname) {
  const clean = String(pathname || '/').split('?')[0];
  let best = null;
  for (const [prefix, text] of DESCRIPTIONS) {
    if (clean === prefix || clean.startsWith(`${prefix}/`) || clean.startsWith(prefix)) {
      if (!best || prefix.length > best[0].length) best = [prefix, text];
    }
  }
  return best ? best[1] : DEFAULT_DESCRIPTION;
}

function siteLocals(req, res, next) {
  const locals = res.locals;
  locals.site = {
    name: 'Purslip',
    year: new Date().getFullYear(),
    phone: SUPPORT_PHONE,
    phoneHref: SUPPORT_PHONE ? telHref(SUPPORT_PHONE) : '',
    email: SUPPORT_EMAIL,
    emailHref: SUPPORT_EMAIL ? `mailto:${SUPPORT_EMAIL}` : '',
  };
  if (!locals.metaDescription) locals.metaDescription = descriptionFor(req.originalUrl);
  next();
}

module.exports = { siteLocals, descriptionFor, telHref, DEFAULT_DESCRIPTION };
