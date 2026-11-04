const { pool } = require('../config/db');

class ValidationError extends Error {}

async function list(userId, { includeArchived = false } = {}) {
  const { rows } = await pool.query(
    `SELECT * FROM categories
     WHERE user_id = $1 ${includeArchived ? '' : 'AND is_archived = false'}
     ORDER BY parent_id NULLS FIRST, display_order, name`,
    [userId]
  );
  return rows;
}

// Groups flat rows into { ...category, children: [...] } for list views.
async function listGrouped(userId, opts) {
  const rows = await list(userId, opts);
  const byId = new Map(rows.map((c) => [c.id, { ...c, children: [] }]));
  const roots = [];
  for (const c of byId.values()) {
    if (c.parent_id && byId.has(c.parent_id)) {
      byId.get(c.parent_id).children.push(c);
    } else {
      roots.push(c);
    }
  }
  return roots;
}

async function getById(userId, categoryId) {
  const { rows } = await pool.query(
    'SELECT * FROM categories WHERE id = $1 AND user_id = $2',
    [categoryId, userId]
  );
  return rows[0] || null;
}

// Subcategories are exactly one level deep: a category may only be nested
// under a top-level (parent-less) category, and it inherits that parent's
// kind (a subcategory of an expense category can't be income) rather than
// letting the two disagree.
async function resolveParent(userId, parentId) {
  if (!parentId) return null;
  const parent = await getById(userId, parentId);
  if (!parent) {
    throw new ValidationError('Parent category not found.');
  }
  if (parent.parent_id) {
    throw new ValidationError('Subcategories can only be one level deep.');
  }
  return parent;
}

async function create(userId, { name, kind, parentId, rollover }) {
  const parent = await resolveParent(userId, parentId);
  const effectiveKind = parent ? parent.kind : kind;

  const { rows } = await pool.query(
    `INSERT INTO categories (user_id, parent_id, name, kind, rollover)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [userId, parent ? parent.id : null, name, effectiveKind, Boolean(rollover)]
  );
  return rows[0];
}

async function update(userId, categoryId, { name, kind, parentId, rollover }) {
  const existing = await getById(userId, categoryId);
  if (!existing) return null;

  if (parentId && parentId === categoryId) {
    throw new ValidationError('A category cannot be its own parent.');
  }

  const parent = await resolveParent(userId, parentId);

  // A category that already has subcategories of its own can't become a
  // subcategory itself — that would make the hierarchy more than one level
  // deep.
  if (parent) {
    const { rows: childRows } = await pool.query(
      'SELECT count(*)::int AS count FROM categories WHERE parent_id = $1',
      [categoryId]
    );
    if (childRows[0].count > 0) {
      throw new ValidationError('This category has subcategories, so it cannot become a subcategory itself.');
    }
  }

  const effectiveKind = parent ? parent.kind : kind;

  const { rows } = await pool.query(
    `UPDATE categories
     SET name = $1, kind = $2, parent_id = $3, rollover = $4
     WHERE id = $5 AND user_id = $6
     RETURNING *`,
    [name, effectiveKind, parent ? parent.id : null, Boolean(rollover), categoryId, userId]
  );
  return rows[0] || null;
}

async function setArchived(userId, categoryId, isArchived) {
  const { rows } = await pool.query(
    'UPDATE categories SET is_archived = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
    [isArchived, categoryId, userId]
  );
  return rows[0] || null;
}

async function usage(userId, categoryId) {
  const [splitRows, budgetRows, recurringRows, childRows] = await Promise.all([
    pool.query('SELECT count(*)::int AS count FROM transaction_splits WHERE category_id = $1', [categoryId]),
    pool.query('SELECT count(*)::int AS count FROM budgets WHERE category_id = $1 AND user_id = $2', [
      categoryId,
      userId,
    ]),
    pool.query(
      'SELECT count(*)::int AS count FROM recurring_transactions WHERE category_id = $1 AND user_id = $2',
      [categoryId, userId]
    ),
    pool.query('SELECT count(*)::int AS count FROM categories WHERE parent_id = $1 AND user_id = $2', [
      categoryId,
      userId,
    ]),
  ]);
  return {
    splits: splitRows.rows[0].count,
    budgets: budgetRows.rows[0].count,
    recurring: recurringRows.rows[0].count,
    children: childRows.rows[0].count,
  };
}

// Deletion policy (see CLAUDE.md for the full rationale):
//  - Blocked outright if the category has subcategories, budgets, or
//    recurring templates pointing at it — those need to be resolved through
//    their own management screens first, since merging budget amounts or
//    recurring schedules isn't something we can safely automate.
//  - If only transaction_splits reference it, the caller can supply
//    reassignToCategoryId (a real category, or null for "Uncategorized") and
//    every split gets moved there before the category is deleted.
//  - If it isn't referenced anywhere, it's just deleted.
async function remove(userId, categoryId, { reassignToCategoryId } = {}) {
  const existing = await getById(userId, categoryId);
  if (!existing) return null;

  const usageCounts = await usage(userId, categoryId);

  if (usageCounts.children > 0 || usageCounts.budgets > 0 || usageCounts.recurring > 0) {
    return { blocked: true, usage: usageCounts };
  }

  if (usageCounts.splits > 0) {
    if (reassignToCategoryId === undefined) {
      return { needsReassignment: true, usage: usageCounts };
    }
    if (reassignToCategoryId) {
      const target = await getById(userId, reassignToCategoryId);
      if (!target) {
        throw new ValidationError('Replacement category not found.');
      }
    }
    await pool.query('UPDATE transaction_splits SET category_id = $1 WHERE category_id = $2', [
      reassignToCategoryId || null,
      categoryId,
    ]);
  }

  await pool.query('DELETE FROM categories WHERE id = $1 AND user_id = $2', [categoryId, userId]);
  return { deleted: true };
}

module.exports = {
  ValidationError,
  list,
  listGrouped,
  getById,
  create,
  update,
  setArchived,
  usage,
  remove,
};
