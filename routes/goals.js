const express = require('express');
const { body, validationResult } = require('express-validator');
const goalsModel = require('../models/goals');
const accountsModel = require('../models/accounts');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const goals = await goalsModel.list(req.session.user.id);
    res.render('goals/index', { title: 'Savings Goals', goals });
  } catch (err) {
    next(err);
  }
});

router.get('/new', async (req, res, next) => {
  try {
    const accounts = await accountsModel.list(req.session.user.id);
    if (!accounts.length) {
      req.flash('error', 'Add an account before creating a goal.');
      return res.redirect('/accounts/new');
    }
    res.render('goals/new', {
      title: 'New Goal',
      errors: [],
      accounts,
      values: {},
    });
  } catch (err) {
    next(err);
  }
});

const validateGoal = [
  body('name').trim().notEmpty().withMessage('Goal name is required.'),
  body('accountId').isUUID().withMessage('Choose an account.'),
  body('targetAmount').isFloat({ gt: 0 }).withMessage('Target amount must be a positive number.'),
  body('startingBalance').optional({ checkFalsy: true }).isFloat().withMessage('Starting balance must be a number.'),
  body('targetDate').optional({ checkFalsy: true }).isISO8601().withMessage('Enter a valid target date.'),
];

router.post('/', validateGoal, async (req, res, next) => {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    const accounts = await accountsModel.list(req.session.user.id);
    return res.status(400).render('goals/new', {
      title: 'New Goal',
      errors: result.array(),
      accounts,
      values: req.body,
    });
  }

  try {
    await goalsModel.create(req.session.user.id, {
      accountId: req.body.accountId,
      name: req.body.name,
      targetAmount: req.body.targetAmount,
      startingBalance: req.body.startingBalance || 0,
      targetDate: req.body.targetDate || null,
    });
    req.flash('success', 'Goal created.');
    res.redirect('/goals');
  } catch (err) {
    next(err);
  }
});

router.get('/:id/edit', async (req, res, next) => {
  try {
    const goal = await goalsModel.getById(req.session.user.id, req.params.id);
    if (!goal) {
      req.flash('error', 'Goal not found.');
      return res.redirect('/goals');
    }
    const accounts = await accountsModel.list(req.session.user.id);
    res.render('goals/edit', {
      title: 'Edit Goal',
      errors: [],
      accounts,
      goal,
      values: {
        name: goal.name,
        accountId: goal.account_id,
        targetAmount: Number(goal.target_amount),
        startingBalance: Number(goal.starting_balance),
        targetDate: goal.target_date,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', validateGoal, async (req, res, next) => {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    const goal = await goalsModel.getById(req.session.user.id, req.params.id);
    const accounts = await accountsModel.list(req.session.user.id);
    return res.status(400).render('goals/edit', {
      title: 'Edit Goal',
      errors: result.array(),
      accounts,
      goal,
      values: req.body,
    });
  }

  try {
    const updated = await goalsModel.update(req.session.user.id, req.params.id, {
      accountId: req.body.accountId,
      name: req.body.name,
      targetAmount: req.body.targetAmount,
      startingBalance: req.body.startingBalance || 0,
      targetDate: req.body.targetDate || null,
    });
    if (!updated) {
      req.flash('error', 'Goal not found.');
      return res.redirect('/goals');
    }
    req.flash('success', 'Goal updated.');
    res.redirect('/goals');
  } catch (err) {
    next(err);
  }
});

router.post('/:id/achieve', async (req, res, next) => {
  try {
    await goalsModel.setAchieved(req.session.user.id, req.params.id, true);
    req.flash('success', 'Goal marked as achieved! 🎉');
    res.redirect('/goals');
  } catch (err) {
    next(err);
  }
});

router.post('/:id/reopen', async (req, res, next) => {
  try {
    await goalsModel.setAchieved(req.session.user.id, req.params.id, false);
    req.flash('success', 'Goal reopened.');
    res.redirect('/goals');
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const deleted = await goalsModel.remove(req.session.user.id, req.params.id);
    req.flash('success', deleted ? 'Goal deleted.' : 'Goal not found.');
    res.redirect('/goals');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
