const express = require('express');
const { body, validationResult } = require('express-validator');

const categories = require('../models/categories');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

async function topLevelCategories(userId, excludeId) {
  const all = await categories.list(userId, { includeArchived: true });
  return all.filter((c) => !c.parent_id && c.id !== excludeId);
}

router.get('/', async (req, res, next) => {
  try {
    const includeArchived = req.query.archived === '1';
    const grouped = await categories.listGrouped(req.session.user.id, { includeArchived });
    res.render('categories/index', { title: 'Categories', categories: grouped, includeArchived });
  } catch (err) {
    next(err);
  }
});

router.get('/new', async (req, res, next) => {
  const redirectTo = typeof req.query.redirectTo === 'string' && req.query.redirectTo.startsWith('/')
    ? req.query.redirectTo
    : '/categories';
  try {
    const parents = await topLevelCategories(req.session.user.id);
    res.render('categories/new', {
      title: 'Add category',
      errors: [],
      values: { kind: 'expense', parentId: req.query.parentId || '' },
      parents,
      redirectTo,
    });
  } catch (err) {
    next(err);
  }
});

const validateCategory = [
  body('name').trim().notEmpty().withMessage('Name is required.').isLength({ max: 100 }),
  body('kind').isIn(['income', 'expense']).withMessage('Choose income or expense.'),
];

router.post('/', validateCategory, async (req, res, next) => {
  const result = validationResult(req);
  const redirectTo = req.body.redirectTo && req.body.redirectTo.startsWith('/')
    ? req.body.redirectTo
    : '/categories';

  const rerender = async (errors) => {
    const parents = await topLevelCategories(req.session.user.id);
    res.status(400).render('categories/new', {
      title: 'Add category',
      errors,
      values: req.body,
      parents,
      redirectTo,
    });
  };

  if (!result.isEmpty()) {
    return rerender(result.array());
  }

  try {
    const created = await categories.create(req.session.user.id, {
      name: req.body.name,
      kind: req.body.kind,
      parentId: req.body.parentId || null,
      rollover: req.body.rollover === 'on',
    });
    req.flash('success', `Category "${created.name}" created.`);
    res.redirect(redirectTo);
  } catch (err) {
    if (err instanceof categories.ValidationError) {
      return rerender([{ msg: err.message }]);
    }
    next(err);
  }
});

router.get('/:id/edit', async (req, res, next) => {
  try {
    const category = await categories.getById(req.session.user.id, req.params.id);
    if (!category) {
      req.flash('error', 'Category not found.');
      return res.redirect('/categories');
    }
    const parents = await topLevelCategories(req.session.user.id, category.id);
    res.render('categories/edit', {
      title: 'Edit category',
      errors: [],
      category,
      values: { name: category.name, kind: category.kind, parentId: category.parent_id || '', rollover: category.rollover },
      parents,
    });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', validateCategory, async (req, res, next) => {
  const result = validationResult(req);
  const rerender = async (errors) => {
    const category = await categories.getById(req.session.user.id, req.params.id);
    const parents = await topLevelCategories(req.session.user.id, req.params.id);
    res.status(400).render('categories/edit', {
      title: 'Edit category',
      errors,
      category,
      values: req.body,
      parents,
    });
  };

  if (!result.isEmpty()) {
    return rerender(result.array());
  }

  try {
    const updated = await categories.update(req.session.user.id, req.params.id, {
      name: req.body.name,
      kind: req.body.kind,
      parentId: req.body.parentId || null,
      rollover: req.body.rollover === 'on',
    });
    if (!updated) {
      req.flash('error', 'Category not found.');
      return res.redirect('/categories');
    }
    req.flash('success', 'Category updated.');
    res.redirect('/categories');
  } catch (err) {
    if (err instanceof categories.ValidationError) {
      return rerender([{ msg: err.message }]);
    }
    next(err);
  }
});

router.post('/:id/archive', async (req, res, next) => {
  try {
    await categories.setArchived(req.session.user.id, req.params.id, true);
    req.flash('success', 'Category archived.');
    res.redirect('/categories');
  } catch (err) {
    next(err);
  }
});

router.post('/:id/unarchive', async (req, res, next) => {
  try {
    await categories.setArchived(req.session.user.id, req.params.id, false);
    req.flash('success', 'Category reactivated.');
    res.redirect('/categories?archived=1');
  } catch (err) {
    next(err);
  }
});

router.get('/:id/delete', async (req, res, next) => {
  try {
    const category = await categories.getById(req.session.user.id, req.params.id);
    if (!category) {
      req.flash('error', 'Category not found.');
      return res.redirect('/categories');
    }
    const usage = await categories.usage(req.session.user.id, req.params.id);
    const reassignTargets = (await categories.list(req.session.user.id)).filter(
      (c) => c.id !== category.id && c.kind === category.kind
    );
    res.render('categories/delete', { title: 'Delete category', category, usage, reassignTargets, errors: [] });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    // The delete confirmation form always submits this field (a real category
    // id, or empty string for "Uncategorized"), so a DELETE only ever arrives
    // after the user has made a choice.
    const outcome = await categories.remove(req.session.user.id, req.params.id, {
      reassignToCategoryId: req.body.reassignToCategoryId === '__uncategorized__'
        ? null
        : req.body.reassignToCategoryId || null,
    });

    if (!outcome) {
      req.flash('error', 'Category not found.');
      return res.redirect('/categories');
    }
    if (outcome.blocked) {
      req.flash(
        'error',
        'This category still has subcategories, budgets, or recurring templates using it. Resolve those first.'
      );
      return res.redirect(`/categories/${req.params.id}/delete`);
    }
    if (outcome.needsReassignment) {
      return res.redirect(`/categories/${req.params.id}/delete`);
    }
    req.flash('success', 'Category deleted.');
    res.redirect('/categories');
  } catch (err) {
    if (err instanceof categories.ValidationError) {
      req.flash('error', err.message);
      return res.redirect(`/categories/${req.params.id}/delete`);
    }
    next(err);
  }
});

module.exports = router;
