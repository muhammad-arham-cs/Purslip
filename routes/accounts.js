const express = require('express');
const { body, validationResult } = require('express-validator');

const accounts = require('../models/accounts');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

const validateAccount = [
  body('accountTitle').optional({ checkFalsy: true }).trim().isLength({ max: 100 }),
  body('name').optional({ checkFalsy: true }).trim().isLength({ max: 100 }),
  body().custom((value) => String(value.accountTitle || value.name || '').trim().length > 0)
    .withMessage('Account title is required.'),
  body('bankName').optional({ checkFalsy: true }).trim().isLength({ max: 100 }),
  body().custom((value) => value.name || String(value.bankName || '').trim().length > 0)
    .withMessage('Bank or provider name is required.'),
  body('type').isIn(accounts.ACCOUNT_TYPES).withMessage('Choose a valid account type.'),
  body('currency').trim().isLength({ min: 3, max: 3 }).withMessage('Currency must be a 3-letter code.'),
  body('openingBalance')
    .isFloat({ min: -1_000_000_000, max: 1_000_000_000 })
    .withMessage('Opening balance must be a number.'),
];

router.get('/', async (req, res, next) => {
  try {
    const includeArchived = req.query.archived === '1';
    const list = await accounts.list(req.session.user.id, { includeArchived });
    res.render('accounts/index', { title: 'Accounts', accounts: list, includeArchived });
  } catch (err) {
    next(err);
  }
});

router.get('/new', (req, res) => {
  res.render('accounts/new', {
    title: 'Add account',
    errors: [],
    values: { currency: 'PKR', type: 'checking' },
  });
});

router.post('/', validateAccount, async (req, res, next) => {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    return res.status(400).render('accounts/new', {
      title: 'Add account',
      errors: result.array(),
      values: req.body,
    });
  }

  try {
    await accounts.create(req.session.user.id, {
      accountTitle: req.body.accountTitle || req.body.name,
      bankName: req.body.bankName,
      type: req.body.type,
      currency: req.body.currency.toUpperCase(),
      openingBalance: req.body.openingBalance,
    });
    req.flash('success', 'Account created.');
    res.redirect('/accounts');
  } catch (err) {
    next(err);
  }
});

router.get('/:id/edit', async (req, res, next) => {
  try {
    const account = await accounts.getById(req.session.user.id, req.params.id);
    if (!account) {
      req.flash('error', 'Account not found.');
      return res.redirect('/accounts');
    }
    res.render('accounts/edit', { title: 'Edit account', errors: [], account, values: account });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', validateAccount, async (req, res, next) => {
  const result = validationResult(req);
  try {
    const account = await accounts.getById(req.session.user.id, req.params.id);
    if (!account) {
      req.flash('error', 'Account not found.');
      return res.redirect('/accounts');
    }

    if (!result.isEmpty()) {
      return res.status(400).render('accounts/edit', {
        title: 'Edit account',
        errors: result.array(),
        account,
        values: req.body,
      });
    }

    await accounts.update(req.session.user.id, req.params.id, {
      accountTitle: req.body.accountTitle || req.body.name,
      bankName: req.body.bankName,
      type: req.body.type,
      currency: req.body.currency.toUpperCase(),
      openingBalance: req.body.openingBalance,
    });
    req.flash('success', 'Account updated.');
    res.redirect('/accounts');
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const outcome = await accounts.remove(req.session.user.id, req.params.id);
    if (!outcome) {
      req.flash('error', 'Account not found.');
    } else if (outcome.archived) {
      req.flash('success', 'Account has transaction history, so it was archived instead of deleted.');
    } else {
      req.flash('success', 'Account deleted.');
    }
    res.redirect('/accounts');
  } catch (err) {
    next(err);
  }
});

router.post('/:id/reactivate', async (req, res, next) => {
  try {
    await accounts.setActive(req.session.user.id, req.params.id, true);
    req.flash('success', 'Account reactivated.');
    res.redirect('/accounts?archived=1');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
