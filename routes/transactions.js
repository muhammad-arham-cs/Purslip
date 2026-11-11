const express = require('express');
const { body, validationResult } = require('express-validator');

const transactionsModel = require('../models/transactions');
const accountsModel = require('../models/accounts');
const categoriesModel = require('../models/categories');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

function parseSplits(body, type) {
  const raw = Array.isArray(body.splits) ? body.splits : body.splits ? [body.splits] : [];
  return raw
    .filter((s) => s && s.amount !== undefined && s.amount !== '')
    .map((s) => ({
      categoryId: s.categoryId || null,
      amount: type === 'income' ? Math.abs(Number(s.amount)) : -Math.abs(Number(s.amount)),
      note: s.note || undefined,
    }));
}

async function loadFormData(userId) {
  const [accounts, categories] = await Promise.all([
    accountsModel.list(userId),
    categoriesModel.list(userId),
  ]);
  return { accounts, categories };
}

router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const filters = {
      page,
      accountId: req.query.account || undefined,
      categoryId: req.query.category || undefined,
      startDate: req.query.startDate || undefined,
      endDate: req.query.endDate || undefined,
      minAmount: req.query.minAmount || undefined,
      maxAmount: req.query.maxAmount || undefined,
      search: req.query.search || undefined,
    };
    const result = await transactionsModel.list(req.session.user.id, filters);
    const [accounts, categories] = await Promise.all([
      accountsModel.list(req.session.user.id, { includeArchived: true }),
      categoriesModel.list(req.session.user.id, { includeArchived: true }),
    ]);
    res.render('transactions/index', {
      title: 'Transactions',
      ...result,
      accounts,
      categories,
      selectedAccountId: filters.accountId,
      filters,
    });
  } catch (err) {
    next(err);
  }
});

// Full CSV export of transactions — user's data must never be locked in.
router.get('/export', async (req, res, next) => {
  try {
    const reportsModel = require('../models/reports');
    const rows = await reportsModel.transactionsForExport(req.session.user.id, {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      accountId: req.query.account || null,
      categoryId: req.query.category || null,
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

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="purslip-all-transactions.csv"');
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

router.get('/new', async (req, res, next) => {
  try {
    const { accounts, categories } = await loadFormData(req.session.user.id);
    if (!accounts.length) {
      req.flash('error', 'You need an account before you can record a transaction. Create one first.');
      return res.redirect('/accounts/new');
    }
    res.render('transactions/new', {
      title: 'Add transaction',
      errors: [],
      accounts,
      categories,
      values: { date: new Date().toISOString().slice(0, 10), type: 'expense' },
    });
  } catch (err) {
    next(err);
  }
});

const validateTransaction = [
  body('accountId').isUUID().withMessage('Choose an account.'),
  body('date').isISO8601().withMessage('Enter a valid date.'),
  body('amount').isFloat({ gt: 0 }).withMessage('Amount must be a positive number.'),
  body('type').isIn(['expense', 'income', 'neither']).withMessage('Choose a transaction type.'),
];

router.post('/', validateTransaction, async (req, res, next) => {
  const result = validationResult(req);
  const rerender = async (errors) => {
    const { accounts, categories } = await loadFormData(req.session.user.id);
    res.status(400).render('transactions/new', {
      title: 'Add transaction',
      errors,
      accounts,
      categories,
      values: req.body,
    });
  };

  if (!result.isEmpty()) {
    return rerender(result.array());
  }

  try {
    const signedAmount =
      req.body.type === 'income' ? Math.abs(Number(req.body.amount)) : -Math.abs(Number(req.body.amount));
    const splits = parseSplits(req.body, req.body.type);

    await transactionsModel.create(req.session.user.id, {
      accountId: req.body.accountId,
      date: req.body.date,
      amount: signedAmount,
      payee: req.body.payee,
      note: req.body.note,
      splits,
      transactionType: req.body.type,
    });
    req.flash('success', 'Transaction added.');
    res.redirect('/transactions');
  } catch (err) {
    if (err instanceof transactionsModel.ValidationError) {
      return rerender([{ msg: err.message }]);
    }
    next(err);
  }
});

router.get('/:id/edit', async (req, res, next) => {
  try {
    const transaction = await transactionsModel.getById(req.session.user.id, req.params.id);
    if (!transaction) {
      req.flash('error', 'Transaction not found.');
      return res.redirect('/transactions');
    }
    if (transaction.is_transfer) {
      return res.redirect(`/transactions/transfer/${transaction.transfer_group_id}/edit`);
    }

    const { accounts, categories } = await loadFormData(req.session.user.id);
    const type = transaction.transaction_type || (Number(transaction.amount) < 0 ? 'expense' : 'income');
    res.render('transactions/edit', {
      title: 'Edit transaction',
      errors: [],
      accounts,
      categories,
      transaction,
      values: {
        accountId: transaction.account_id,
        date: transaction.date,
        amount: Math.abs(Number(transaction.amount)),
        type,
        payee: transaction.payee,
        note: transaction.note,
        splits: transaction.splits.map((s) => ({
          categoryId: s.category_id,
          amount: Math.abs(Number(s.amount)),
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', validateTransaction, async (req, res, next) => {
  const result = validationResult(req);
  const rerender = async (errors) => {
    const transaction = await transactionsModel.getById(req.session.user.id, req.params.id);
    const { accounts, categories } = await loadFormData(req.session.user.id);
    res.status(400).render('transactions/edit', {
      title: 'Edit transaction',
      errors,
      accounts,
      categories,
      transaction,
      values: req.body,
    });
  };

  if (!result.isEmpty()) {
    return rerender(result.array());
  }

  try {
    const signedAmount =
      req.body.type === 'income' ? Math.abs(Number(req.body.amount)) : -Math.abs(Number(req.body.amount));
    const splits = parseSplits(req.body, req.body.type);

    await transactionsModel.update(req.session.user.id, req.params.id, {
      accountId: req.body.accountId,
      date: req.body.date,
      amount: signedAmount,
      payee: req.body.payee,
      note: req.body.note,
      splits,
      transactionType: req.body.type,
    });
    req.flash('success', 'Transaction updated.');
    res.redirect('/transactions');
  } catch (err) {
    if (err instanceof transactionsModel.ValidationError) {
      return rerender([{ msg: err.message }]);
    }
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const outcome = await transactionsModel.remove(req.session.user.id, req.params.id);
    req.flash('success', outcome ? 'Transaction deleted.' : 'Transaction not found.');
    res.redirect('/transactions');
  } catch (err) {
    if (err instanceof transactionsModel.ValidationError) {
      req.flash('error', err.message);
      return res.redirect('/transactions');
    }
    next(err);
  }
});

// --- Transfers ---

router.get('/transfer/new', async (req, res, next) => {
  try {
    const accounts = await accountsModel.list(req.session.user.id);
    if (accounts.length < 2) {
      req.flash('error', 'You need at least two accounts to record a transfer.');
      return res.redirect('/accounts');
    }
    res.render('transactions/transfer-form', {
      title: 'Add transfer',
      errors: [],
      accounts,
      values: { date: new Date().toISOString().slice(0, 10) },
      formAction: '/transactions/transfer',
    });
  } catch (err) {
    next(err);
  }
});

const validateTransfer = [
  body('fromAccountId').isUUID().withMessage('Choose a source account.'),
  body('toAccountId').isUUID().withMessage('Choose a destination account.'),
  body('date').isISO8601().withMessage('Enter a valid date.'),
  body('amount').isFloat({ gt: 0 }).withMessage('Amount must be a positive number.'),
];

router.post('/transfer', validateTransfer, async (req, res, next) => {
  const result = validationResult(req);
  const rerender = async (errors) => {
    const accounts = await accountsModel.list(req.session.user.id);
    res.status(400).render('transactions/transfer-form', {
      title: 'Add transfer',
      errors,
      accounts,
      values: req.body,
      formAction: '/transactions/transfer',
    });
  };

  if (!result.isEmpty()) {
    return rerender(result.array());
  }

  try {
    await transactionsModel.createTransfer(req.session.user.id, {
      fromAccountId: req.body.fromAccountId,
      toAccountId: req.body.toAccountId,
      date: req.body.date,
      amount: req.body.amount,
      note: req.body.note,
    });
    req.flash('success', 'Transfer recorded.');
    res.redirect('/transactions');
  } catch (err) {
    if (err instanceof transactionsModel.ValidationError) {
      return rerender([{ msg: err.message }]);
    }
    next(err);
  }
});

router.get('/transfer/:transferGroupId/edit', async (req, res, next) => {
  try {
    const transfer = await transactionsModel.getTransfer(req.session.user.id, req.params.transferGroupId);
    if (!transfer) {
      req.flash('error', 'Transfer not found.');
      return res.redirect('/transactions');
    }
    const accounts = await accountsModel.list(req.session.user.id);
    res.render('transactions/transfer-form', {
      title: 'Edit transfer',
      errors: [],
      accounts,
      values: {
        fromAccountId: transfer.fromAccountId,
        toAccountId: transfer.toAccountId,
        date: transfer.date,
        amount: transfer.amount,
        note: transfer.note,
      },
      formAction: `/transactions/transfer/${req.params.transferGroupId}?_method=PUT`,
    });
  } catch (err) {
    next(err);
  }
});

router.put('/transfer/:transferGroupId', validateTransfer, async (req, res, next) => {
  const result = validationResult(req);
  const rerender = async (errors) => {
    const accounts = await accountsModel.list(req.session.user.id);
    res.status(400).render('transactions/transfer-form', {
      title: 'Edit transfer',
      errors,
      accounts,
      values: req.body,
      formAction: `/transactions/transfer/${req.params.transferGroupId}?_method=PUT`,
    });
  };

  if (!result.isEmpty()) {
    return rerender(result.array());
  }

  try {
    await transactionsModel.updateTransfer(req.session.user.id, req.params.transferGroupId, {
      fromAccountId: req.body.fromAccountId,
      toAccountId: req.body.toAccountId,
      date: req.body.date,
      amount: req.body.amount,
      note: req.body.note,
    });
    req.flash('success', 'Transfer updated.');
    res.redirect('/transactions');
  } catch (err) {
    if (err instanceof transactionsModel.ValidationError) {
      return rerender([{ msg: err.message }]);
    }
    next(err);
  }
});

router.delete('/transfer/:transferGroupId', async (req, res, next) => {
  try {
    // remove() detects is_transfer and removes both legs by transfer_group_id
    // itself, but it takes a transaction id — so find one leg's id first.
    const legId = await transactionsModel.findLegIdByTransferGroup(
      req.session.user.id,
      req.params.transferGroupId
    );
    const outcome = legId ? await transactionsModel.remove(req.session.user.id, legId) : null;
    req.flash('success', outcome ? 'Transfer deleted.' : 'Transfer not found.');
    res.redirect('/transactions');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
