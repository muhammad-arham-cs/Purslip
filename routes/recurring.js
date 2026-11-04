const express = require('express');
const { body, validationResult } = require('express-validator');

const recurringModel = require('../models/recurring');
const accountsModel = require('../models/accounts');
const categoriesModel = require('../models/categories');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

async function loadFormData(userId) {
  const [accounts, categories] = await Promise.all([
    accountsModel.list(userId),
    categoriesModel.list(userId),
  ]);
  return { accounts, categories };
}

router.get('/', async (req, res, next) => {
  try {
    // Catch up this user's due templates right away rather than waiting for
    // the nightly cron — safe to call anytime since generation is
    // idempotent per occurrence date.
    await recurringModel.generateDue({ userId: req.session.user.id });

    const templates = await recurringModel.list(req.session.user.id, { includeInactive: true });
    const upcoming = await recurringModel.upcomingBills(req.session.user.id, 14);
    const subscriptions = await recurringModel.subscriptionSummary(req.session.user.id);

    res.render('recurring/index', { title: 'Recurring', templates, upcoming, subscriptions });
  } catch (err) {
    next(err);
  }
});

router.get('/new', async (req, res, next) => {
  try {
    const { accounts, categories } = await loadFormData(req.session.user.id);
    if (!accounts.length) {
      req.flash('error', 'Add an account before creating a recurring transaction.');
      return res.redirect('/accounts/new');
    }
    res.render('recurring/new', {
      title: 'Add recurring transaction',
      errors: [],
      accounts,
      categories,
      frequencies: recurringModel.FREQUENCIES,
      values: { type: 'expense', startDate: new Date().toISOString().slice(0, 10), frequency: 'monthly' },
    });
  } catch (err) {
    next(err);
  }
});

const validateRecurring = [
  body('accountId').isUUID().withMessage('Choose an account.'),
  body('amount').isFloat({ gt: 0 }).withMessage('Amount must be a positive number.'),
  body('type').isIn(['expense', 'income']).withMessage('Choose expense or income.'),
  body('frequency').isIn(recurringModel.FREQUENCIES).withMessage('Choose a valid frequency.'),
  body('startDate').isISO8601().withMessage('Enter a valid start date.'),
  body('endDate').optional({ checkFalsy: true }).isISO8601().withMessage('End date must be a valid date.'),
  body('customIntervalDays')
    .if(body('frequency').equals('custom_days'))
    .isInt({ min: 1 })
    .withMessage('Custom interval must be at least 1 day.'),
];

router.post('/', validateRecurring, async (req, res, next) => {
  const result = validationResult(req);
  const rerender = async (errors) => {
    const { accounts, categories } = await loadFormData(req.session.user.id);
    res.status(400).render('recurring/new', {
      title: 'Add recurring transaction',
      errors,
      accounts,
      categories,
      frequencies: recurringModel.FREQUENCIES,
      values: req.body,
    });
  };

  if (!result.isEmpty()) {
    return rerender(result.array());
  }

  try {
    const signedAmount =
      req.body.type === 'expense' ? -Math.abs(Number(req.body.amount)) : Math.abs(Number(req.body.amount));

    await recurringModel.create(req.session.user.id, {
      accountId: req.body.accountId,
      categoryId: req.body.categoryId || null,
      payee: req.body.payee,
      note: req.body.note,
      amount: signedAmount,
      frequency: req.body.frequency,
      customIntervalDays: req.body.customIntervalDays ? Number(req.body.customIntervalDays) : null,
      startDate: req.body.startDate,
      endDate: req.body.endDate || null,
    });
    req.flash('success', 'Recurring transaction created.');
    res.redirect('/recurring');
  } catch (err) {
    next(err);
  }
});

router.get('/:id/edit', async (req, res, next) => {
  try {
    const template = await recurringModel.getById(req.session.user.id, req.params.id);
    if (!template) {
      req.flash('error', 'Recurring transaction not found.');
      return res.redirect('/recurring');
    }
    const { accounts, categories } = await loadFormData(req.session.user.id);
    res.render('recurring/edit', {
      title: 'Edit recurring transaction',
      errors: [],
      accounts,
      categories,
      frequencies: recurringModel.FREQUENCIES,
      template,
      values: {
        accountId: template.account_id,
        categoryId: template.category_id,
        payee: template.payee,
        note: template.note,
        amount: Math.abs(Number(template.amount)),
        type: Number(template.amount) < 0 ? 'expense' : 'income',
        frequency: template.frequency,
        customIntervalDays: template.custom_interval_days,
        endDate: template.end_date,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', validateRecurring, async (req, res, next) => {
  const result = validationResult(req);
  const rerender = async (errors) => {
    const template = await recurringModel.getById(req.session.user.id, req.params.id);
    const { accounts, categories } = await loadFormData(req.session.user.id);
    res.status(400).render('recurring/edit', {
      title: 'Edit recurring transaction',
      errors,
      accounts,
      categories,
      frequencies: recurringModel.FREQUENCIES,
      template,
      values: req.body,
    });
  };

  if (!result.isEmpty()) {
    return rerender(result.array());
  }

  try {
    const signedAmount =
      req.body.type === 'expense' ? -Math.abs(Number(req.body.amount)) : Math.abs(Number(req.body.amount));

    const updated = await recurringModel.update(req.session.user.id, req.params.id, {
      accountId: req.body.accountId,
      categoryId: req.body.categoryId || null,
      payee: req.body.payee,
      note: req.body.note,
      amount: signedAmount,
      frequency: req.body.frequency,
      customIntervalDays: req.body.customIntervalDays ? Number(req.body.customIntervalDays) : null,
      endDate: req.body.endDate || null,
    });
    if (!updated) {
      req.flash('error', 'Recurring transaction not found.');
      return res.redirect('/recurring');
    }
    req.flash('success', 'Recurring transaction updated.');
    res.redirect('/recurring');
  } catch (err) {
    next(err);
  }
});

router.post('/:id/pause', async (req, res, next) => {
  try {
    await recurringModel.setActive(req.session.user.id, req.params.id, false);
    req.flash('success', 'Paused.');
    res.redirect('/recurring');
  } catch (err) {
    next(err);
  }
});

router.post('/:id/resume', async (req, res, next) => {
  try {
    await recurringModel.setActive(req.session.user.id, req.params.id, true);
    req.flash('success', 'Resumed.');
    res.redirect('/recurring');
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const deleted = await recurringModel.remove(req.session.user.id, req.params.id);
    req.flash('success', deleted ? 'Recurring transaction deleted.' : 'Not found.');
    res.redirect('/recurring');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
