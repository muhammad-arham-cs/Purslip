const express = require('express');
const { body, validationResult } = require('express-validator');

const budgetsModel = require('../models/budgets');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function currentMonthStr() {
  return new Date().toISOString().slice(0, 7);
}

function normalizeMonth(raw) {
  return /^\d{4}-\d{2}$/.test(raw || '') ? raw : currentMonthStr();
}

router.get('/', async (req, res, next) => {
  try {
    const month = normalizeMonth(req.query.month);
    const rows = await budgetsModel.listForMonth(req.session.user.id, month);
    const prevMonth = budgetsModel.addMonths(`${month}-01`, -1).slice(0, 7);
    const nextMonth = budgetsModel.addMonths(`${month}-01`, 1).slice(0, 7);

    res.render('budgets/index', { title: 'Budgets', month, prevMonth, nextMonth, rows });
  } catch (err) {
    next(err);
  }
});

router.put(
  '/:categoryId',
  [body('amount').isFloat({ min: 0 }).withMessage('Budget amount must be zero or more.')],
  async (req, res, next) => {
    const result = validationResult(req);
    const month = normalizeMonth(req.query.month || req.body.month);

    if (!result.isEmpty()) {
      req.flash('error', result.array()[0].msg);
      return res.redirect(`/budgets?month=${month}`);
    }

    try {
      await budgetsModel.upsertBudget(req.session.user.id, req.params.categoryId, month, req.body.amount);
      req.flash('success', 'Budget updated.');
      res.redirect(`/budgets?month=${month}`);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
