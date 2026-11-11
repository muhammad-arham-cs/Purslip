const express = require('express');
const accountsModel = require('../models/accounts');
const categoriesModel = require('../models/categories');
const reportsModel = require('../models/reports');
const recurringModel = require('../models/recurring');
const debtsModel = require('../models/debts');
const { convertAmount } = require('../lib/currency');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// ---------------------------------------------------------------------------
// Helper — default date range is the current month
// ---------------------------------------------------------------------------
function defaultDateRange() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
  return {
    startDate: `${y}-${m}-01`,
    endDate: `${y}-${m}-${String(lastDay).padStart(2, '0')}`,
  };
}

function last12MonthsRange() {
  const now = new Date();
  const endY = now.getFullYear();
  const endM = now.getMonth() + 1;
  const lastDay = new Date(endY, endM, 0).getDate();
  const startDate = new Date(endY, endM - 13, 1); // 12 months back
  const sY = startDate.getFullYear();
  const sM = String(startDate.getMonth() + 1).padStart(2, '0');
  return {
    startDate: `${sY}-${sM}-01`,
    endDate: `${endY}-${String(endM).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  };
}

// ---------------------------------------------------------------------------
// Reports index — trends, category breakdown, custom date range
// ---------------------------------------------------------------------------
router.get('/', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const range = req.query.startDate && req.query.endDate
      ? { startDate: req.query.startDate, endDate: req.query.endDate }
      : defaultDateRange();

    const trendRange = last12MonthsRange();

    const [
      incomeExpense,
      spending,
      income,
      trends,
      categoryTrends,
      netWorth,
      currentNW,
      accounts,
      categories,
      debtRows,
    ] = await Promise.all([
      reportsModel.incomeExpenseForRange(userId, range.startDate, range.endDate),
      reportsModel.spendingByCategory(userId, range.startDate, range.endDate),
      reportsModel.incomeByCategory(userId, range.startDate, range.endDate),
      reportsModel.monthlyTrends(userId, trendRange.startDate, trendRange.endDate),
      reportsModel.monthlyCategoryTrends(userId, trendRange.startDate, trendRange.endDate),
      reportsModel.netWorthHistory(userId),
      reportsModel.currentNetWorth(userId),
      accountsModel.list(userId),
      categoriesModel.list(userId),
      debtsModel.summary(userId),
    ]);
    const debtSummary = debtRows.reduce((summary, row) => {
      summary[row.direction] += convertAmount(row.remaining, row.currency, res.locals.displayCurrency, res.locals.exchangeRates);
      return summary;
    }, { lent: 0, borrowed: 0 });

    res.render('reports/index', {
      title: 'Reports',
      range,
      incomeExpense,
      spending,
      income,
      trends: JSON.stringify(trends),
      categoryTrends: JSON.stringify(categoryTrends),
      netWorth: JSON.stringify(netWorth),
      currentNW,
      accounts,
      categories,
      debtSummary,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------
router.get('/export', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const rows = await reportsModel.transactionsForExport(userId, {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      accountId: req.query.accountId || null,
      categoryId: req.query.categoryId || null,
    });

    const header = 'Date,Amount,Payee,Note,Account,Categories,Debt,Is Transfer\n';
    const csvRows = rows.map((r) => {
      const fields = [
        r.date,
        r.amount,
        csvEscape(r.payee || ''),
        csvEscape(r.note || ''),
        csvEscape(r.account_name),
        csvEscape(r.categories || ''),
        csvEscape(r.debt_person || ''),
        r.is_transfer ? 'Yes' : 'No',
      ];
      return fields.join(',');
    });

    const filename = `purslip-export-${req.query.startDate || 'all'}-to-${req.query.endDate || 'all'}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(header + csvRows.join('\n'));
  } catch (err) {
    next(err);
  }
});

function csvEscape(value) {
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

module.exports = router;
