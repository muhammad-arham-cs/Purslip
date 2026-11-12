const express = require('express');
const { body, validationResult } = require('express-validator');

const accounts = require('../models/accounts');
const cardsModel = require('../models/cards');
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
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
    const startDate = `${y}-${m}-01`;
    const endDate = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;

    const [list, cards] = await Promise.all([
      accounts.list(req.session.user.id, { includeArchived }),
      cardsModel.listWithStats(req.session.user.id, startDate, endDate),
    ]);
    res.render('accounts/index', { title: 'Accounts & Cards', accounts: list, cards, includeArchived });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/cards',
  [
    body('accountId').isUUID().withMessage('Choose an account to link the card to.'),
    body('cardName').trim().isLength({ min: 1, max: 80 }).withMessage('Enter a card label.'),
    body('cardholderName').optional({ checkFalsy: true }).trim().isLength({ max: 80 }),
    body('cardType').isIn(['debit', 'credit']).withMessage('Choose Debit or Credit card.'),
    body('network').optional({ checkFalsy: true }).isIn(['VISA', 'Mastercard', 'PayPak', 'UnionPay', 'Amex']),
    body('last4').trim().matches(/^\d{4}$/).withMessage('Enter the last 4 digits of the card.'),
    body('expiry').optional({ checkFalsy: true }).trim().isLength({ max: 7 }),
    body('themeColor').optional({ checkFalsy: true }).isIn(['lime', 'slate', 'obsidian', 'emerald', 'amber']),
    body('spendingLimit').optional({ checkFalsy: true }).isFloat({ gt: 0 }),
  ],
  async (req, res, next) => {
    const returnTo = req.body.returnTo === '/dashboard' ? '/dashboard' : '/accounts#cards';
    const result = validationResult(req);
    if (!result.isEmpty()) {
      req.flash('error', result.array().map((e) => e.msg).join(' '));
      return res.redirect(returnTo);
    }

    try {
      const account = await accounts.getById(req.session.user.id, req.body.accountId);
      if (!account) {
        req.flash('error', 'Linked account not found.');
        return res.redirect(returnTo);
      }

      await cardsModel.create(req.session.user.id, {
        accountId: account.id,
        cardName: req.body.cardName,
        cardholderName: req.body.cardholderName,
        cardType: req.body.cardType,
        network: req.body.network || 'VISA',
        last4: req.body.last4,
        expiry: req.body.expiry || '03/30',
        themeColor: req.body.themeColor || (req.body.cardType === 'credit' ? 'slate' : 'lime'),
        spendingLimit: req.body.spendingLimit || null,
      });
      req.flash('success', `${req.body.cardType === 'credit' ? 'Credit' : 'Debit'} card linked to ${account.account_title || account.name}.`);
      res.redirect(returnTo);
    } catch (err) {
      next(err);
    }
  }
);

router.delete('/cards/:cardId', async (req, res, next) => {
  const returnTo = req.body.returnTo === '/dashboard' ? '/dashboard' : '/accounts#cards';
  try {
    const removed = await cardsModel.remove(req.session.user.id, req.params.cardId);
    req.flash(removed ? 'success' : 'error', removed ? 'Card unlinked.' : 'Card not found.');
    res.redirect(returnTo);
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
