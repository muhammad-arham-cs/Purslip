const { pool } = require('../config/db');

function firstOfMonth(monthStr) {
  // Accepts either 'YYYY-MM' or an already-full 'YYYY-MM-DD' and always
  // returns 'YYYY-MM-01' — idempotent so callers passing either shape
  // (some pass a raw month string, some pass an already-normalized date
  // from earlier in the same call chain) can't accidentally double-suffix.
  return `${String(monthStr).slice(0, 7)}-01`;
}

function addMonths(monthDateStr, delta) {
  const [y, m] = monthDateStr.split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  const newY = Math.floor(total / 12);
  const newM = (total % 12) + 1;
  return `${newY}-${String(newM).padStart(2, '0')}-01`;
}

async function getBudgetAmount(categoryId, month) {
  const { rows } = await pool.query(
    'SELECT amount FROM budgets WHERE category_id = $1 AND month = $2',
    [categoryId, firstOfMonth(month)]
  );
  return rows.length ? Number(rows[0].amount) : null;
}

async function upsertBudget(userId, categoryId, month, amount) {
  const { rows } = await pool.query(
    `INSERT INTO budgets (user_id, category_id, month, amount)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (category_id, month) DO UPDATE SET amount = $4, updated_at = now()
     RETURNING *`,
    [userId, categoryId, firstOfMonth(month), amount]
  );
  return rows[0];
}

// Positive = net spending (typical for an expense category, whose splits are
// negative amounts); negative means net inflow (e.g. refunds exceeded
// purchases that month).
async function spentForCategoryMonth(userId, categoryId, monthDateStr) {
  const { rows } = await pool.query(
    `SELECT COALESCE(sum(s.amount), 0)::float AS total
     FROM transaction_splits s
     JOIN transactions t ON t.id = s.transaction_id
     WHERE t.user_id = $1 AND s.category_id = $2 AND t.is_transfer = false
       AND COALESCE(t.transaction_type, CASE WHEN t.amount >= 0 THEN 'income' ELSE 'expense' END) = 'expense'
       AND t.date >= $3::date AND t.date < ($3::date + interval '1 month')`,
    [userId, categoryId, monthDateStr]
  );
  return -Number(rows[0].total);
}

// Walks forward from the earliest month this category has ever had a budget
// (bounded by real budgeting history, not unbounded recursion) accumulating
// carry = available - spent each month, so N consecutive months of
// underspending compound correctly rather than only looking one month back.
// Carry can go negative too (overspending reduces next month's available),
// matching standard envelope-budgeting rollover behavior.
async function availableForMonth(userId, categoryId, monthDateStr, rollover) {
  const budgetThisMonth = await getBudgetAmount(categoryId, monthDateStr);

  if (!rollover) {
    return budgetThisMonth || 0;
  }

  const { rows } = await pool.query(
    'SELECT MIN(month) AS earliest FROM budgets WHERE category_id = $1 AND month <= $2::date',
    [categoryId, monthDateStr]
  );
  const earliest = rows[0].earliest;
  if (!earliest) return 0;

  let cursor = earliest; // already 'YYYY-MM-DD' thanks to the DATE type parser override
  let carry = 0;
  // Safety bound: even at one iteration per month, 1200 months is 100 years
  // of budgeting history — far beyond any real use of this app.
  for (let i = 0; i < 1200 && cursor <= monthDateStr; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const budget = (await getBudgetAmount(categoryId, cursor)) || 0;
    const available = budget + carry;
    if (cursor === monthDateStr) {
      return available;
    }
    // eslint-disable-next-line no-await-in-loop
    const spent = await spentForCategoryMonth(userId, categoryId, cursor);
    carry = available - spent;
    cursor = addMonths(cursor, 1).slice(0, 7) + '-01';
  }
  return carry;
}

async function listForMonth(userId, monthStr) {
  const month = firstOfMonth(monthStr);
  const { rows: categories } = await pool.query(
    `SELECT * FROM categories
     WHERE user_id = $1 AND is_archived = false AND kind = 'expense'
     ORDER BY parent_id NULLS FIRST, display_order, name`,
    [userId]
  );

  const results = [];
  for (const category of categories) {
    // eslint-disable-next-line no-await-in-loop
    const budgetAmount = await getBudgetAmount(category.id, month);
    // eslint-disable-next-line no-await-in-loop
    const spent = await spentForCategoryMonth(userId, category.id, month);
    // eslint-disable-next-line no-await-in-loop
    const available = await availableForMonth(userId, category.id, month, category.rollover);

    results.push({
      category,
      budgetAmount,
      spent,
      available,
      remaining: available - spent,
      percentUsed: available > 0 ? Math.min(999, (spent / available) * 100) : spent > 0 ? 100 : 0,
      isOverBudget: available > 0 ? spent > available : spent > 0,
    });
  }
  return results;
}

module.exports = {
  firstOfMonth,
  addMonths,
  getBudgetAmount,
  upsertBudget,
  spentForCategoryMonth,
  availableForMonth,
  listForMonth,
};
