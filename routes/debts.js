const express = require('express');
const { body, validationResult } = require('express-validator');

const debts = require('../models/debts');
const accounts = require('../models/accounts');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

async function formData(userId) {
  return { accounts: await accounts.list(userId) };
}

router.get('/', async (req, res, next) => {
  try {
    res.render('debts/index', { title: 'Debts', debts: await debts.list(req.session.user.id) });
  } catch (err) {
    next(err);
  }
});

router.get('/new', async (req, res, next) => {
  try {
    res.render('debts/new', {
      title: 'Add debt',
      errors: [],
      values: { direction: 'lent', date: new Date().toISOString().slice(0, 10) },
      ...(await formData(req.session.user.id)),
    });
  } catch (err) {
    next(err);
  }
});

const validateDebt = [
  body('personName').trim().notEmpty().isLength({ max: 120 }).withMessage('Person name is required.'),
  body('direction').isIn(['lent', 'borrowed']).withMessage('Choose a debt direction.'),
  body('amount').isFloat({ gt: 0 }).withMessage('Amount must be positive.'),
  body('accountId').optional({ checkFalsy: true }).isUUID().withMessage('Choose a valid account.'),
  body('currency').isLength({ min: 3, max: 3 }).withMessage('Choose a currency.'),
  body('date').isISO8601().withMessage('Enter a valid date.'),
];

router.post('/', validateDebt, async (req, res, next) => {
  const result = validationResult(req);
  const data = await formData(req.session.user.id);
  if (!result.isEmpty()) {
    return res.status(400).render('debts/new', {
      title: 'Add debt',
      errors: result.array(),
      values: req.body,
      ...data,
    });
  }
  try {
    await debts.create(req.session.user.id, {
      personName: req.body.personName,
      direction: req.body.direction,
      amount: req.body.amount,
      accountId: req.body.accountId,
      currency: req.body.currency,
      recordMovement: req.body.recordMovement === 'on',
      note: req.body.note,
      date: req.body.date,
    });
    req.flash('success', req.body.recordMovement === 'on'
      ? 'Debt recorded and account balance updated.'
      : 'Debt recorded without changing an account balance.');
    res.redirect('/debts');
  } catch (err) {
    if (err instanceof debts.ValidationError) {
      return res.status(400).render('debts/new', { title: 'Add debt', errors: [{ msg: err.message }], values: req.body, ...data });
    }
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const debt = await debts.getById(req.session.user.id, req.params.id);
    if (!debt) {
      req.flash('error', 'Debt not found.');
      return res.redirect('/debts');
    }
    res.render('debts/detail', { title: 'Debt details', debt, ...(await formData(req.session.user.id)) });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/edit', async (req, res, next) => {
  try {
    const debt = await debts.getById(req.session.user.id, req.params.id);
    if (!debt) return res.redirect('/debts');
    res.render('debts/edit', { title: 'Edit debt', errors: [], debt, values: debt });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', body('personName').trim().notEmpty().withMessage('Person name is required.'), async (req, res, next) => {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    const debt = await debts.getById(req.session.user.id, req.params.id);
    return res.status(400).render('debts/edit', { title: 'Edit debt', errors: result.array(), debt, values: req.body });
  }
  try {
    await debts.update(req.session.user.id, req.params.id, { personName: req.body.personName, note: req.body.note });
    req.flash('success', 'Debt updated.');
    res.redirect(`/debts/${req.params.id}`);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/repay', [
  body('amount').isFloat({ gt: 0 }).withMessage('Repayment must be positive.'),
  body('accountId').optional({ checkFalsy: true }).isUUID().withMessage('Choose a valid account.'),
  body('date').isISO8601().withMessage('Enter a valid date.'),
], async (req, res, next) => {
  const result = validationResult(req);
  const debt = await debts.getById(req.session.user.id, req.params.id);
  const data = await formData(req.session.user.id);
  if (!debt) return res.redirect('/debts');
  if (!result.isEmpty()) {
    return res.status(400).render('debts/detail', { title: 'Debt details', debt, errors: result.array(), ...data });
  }
  try {
    await debts.addRepayment(req.session.user.id, req.params.id, {
      ...req.body,
      recordMovement: req.body.recordMovement === 'on',
    });
    req.flash('success', req.body.recordMovement === 'on'
      ? 'Repayment recorded and account balance updated.'
      : 'Repayment recorded without changing an account balance.');
    res.redirect(`/debts/${req.params.id}`);
  } catch (err) {
    if (err instanceof debts.ValidationError) {
      return res.status(400).render('debts/detail', { title: 'Debt details', debt, errors: [{ msg: err.message }], ...data });
    }
    next(err);
  }
});

module.exports = router;
