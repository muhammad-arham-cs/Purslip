const { pool } = require('../config/db');
const { convertAmount } = require('../lib/currency');

const preferenceCache = new Map();
const PREFERENCE_CACHE_TTL = 30000;

async function displayContext(userId) {
  const cached = preferenceCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const { rows } = await pool.query('SELECT display_currency, exchange_rates FROM users WHERE id = $1', [userId]);
  const preferences = rows[0] || { display_currency: 'PKR', exchange_rates: { PKR: 1, USD: 1 } };
  const value = { currency: preferences.display_currency, rates: preferences.exchange_rates };
  preferenceCache.set(userId, { value, expiresAt: Date.now() + PREFERENCE_CACHE_TTL });
  return value;
}

// ---------------------------------------------------------------------------
// Dashboard summary helpers
// ---------------------------------------------------------------------------

/**
 * Income/expense totals for a date range, excluding transfers.
 * Returns { income, expenses } as positive numbers.
 */
async function incomeExpenseForRange(userId, startDate, endDate) {
  const { rows } = await pool.query(
    `SELECT
       t.amount::float, a.currency
     FROM transactions t
     JOIN accounts a ON a.id = t.account_id
     WHERE t.user_id = $1 AND t.is_transfer = false AND t.debt_id IS NULL
       AND COALESCE(t.transaction_type, CASE WHEN t.amount >= 0 THEN 'income' ELSE 'expense' END) <> 'neither'
       AND t.date >= $2::date AND t.date <= $3::date`,
    [userId, startDate, endDate]
  );
  const context = await displayContext(userId);
  return rows.reduce((totals, row) => {
    const amount = convertAmount(row.amount, row.currency, context.currency, context.rates);
    if (amount > 0) totals.income += amount;
    else totals.expenses += Math.abs(amount);
    return totals;
  }, { income: 0, expenses: 0 });
}

/**
 * Spending by category for a date range (expense splits only, excluding transfers).
 * Returns an array of { category_id, category_name, parent_name, total } sorted by total desc.
 */
async function spendingByCategory(userId, startDate, endDate) {
  const { rows } = await pool.query(
    `SELECT
       s.category_id,
       c.name AS category_name,
       pc.name AS parent_name,
       ABS(SUM(s.amount))::float AS total, a.currency
     FROM transaction_splits s
     JOIN transactions t ON t.id = s.transaction_id
     JOIN accounts a ON a.id = t.account_id
     LEFT JOIN categories c ON c.id = s.category_id
     LEFT JOIN categories pc ON pc.id = c.parent_id
     WHERE t.user_id = $1 AND t.is_transfer = false AND t.debt_id IS NULL
       AND COALESCE(t.transaction_type, CASE WHEN t.amount >= 0 THEN 'income' ELSE 'expense' END) = 'expense'
       AND t.date >= $2::date AND t.date <= $3::date
       AND s.amount < 0
     GROUP BY s.category_id, c.name, pc.name, a.currency
     ORDER BY total DESC`,
    [userId, startDate, endDate]
  );
  const context = await displayContext(userId);
  return rows.map((row) => ({ ...row, total: convertAmount(row.total, row.currency, context.currency, context.rates) }));
}

/**
 * Income by category for a date range.
 * Returns array of { category_id, category_name, parent_name, total }.
 */
async function incomeByCategory(userId, startDate, endDate) {
  const { rows } = await pool.query(
    `SELECT
       s.category_id,
       c.name AS category_name,
       pc.name AS parent_name,
       SUM(s.amount)::float AS total, a.currency
     FROM transaction_splits s
     JOIN transactions t ON t.id = s.transaction_id
     JOIN accounts a ON a.id = t.account_id
     LEFT JOIN categories c ON c.id = s.category_id
     LEFT JOIN categories pc ON pc.id = c.parent_id
     WHERE t.user_id = $1 AND t.is_transfer = false AND t.debt_id IS NULL
       AND COALESCE(t.transaction_type, CASE WHEN t.amount >= 0 THEN 'income' ELSE 'expense' END) = 'income'
       AND t.date >= $2::date AND t.date <= $3::date
       AND s.amount > 0
     GROUP BY s.category_id, c.name, pc.name, a.currency
     ORDER BY total DESC`,
    [userId, startDate, endDate]
  );
  const context = await displayContext(userId);
  return rows.map((row) => ({ ...row, total: convertAmount(row.total, row.currency, context.currency, context.rates) }));
}

// ---------------------------------------------------------------------------
// Monthly trends — income/expense per month over a range
// ---------------------------------------------------------------------------

/**
 * Monthly income and expenses over a date range (for line/bar charts).
 * Returns array of { month, income, expenses } sorted chronologically.
 */
async function monthlyTrends(userId, startDate, endDate) {
  const { rows } = await pool.query(
    `SELECT
       to_char(t.date, 'YYYY-MM') AS month,
       t.amount::float, a.currency
     FROM transactions t
     JOIN accounts a ON a.id = t.account_id
     WHERE t.user_id = $1 AND t.is_transfer = false AND t.debt_id IS NULL
       AND COALESCE(t.transaction_type, CASE WHEN t.amount >= 0 THEN 'income' ELSE 'expense' END) <> 'neither'
       AND t.date >= $2::date AND t.date <= $3::date
     ORDER BY month`,
    [userId, startDate, endDate]
  );
  const context = await displayContext(userId);
  const grouped = new Map();
  for (const row of rows) {
    const month = row.month;
    const entry = grouped.get(month) || { month, income: 0, expenses: 0 };
    const amount = convertAmount(row.amount, row.currency, context.currency, context.rates);
    if (amount > 0) entry.income += amount;
    else entry.expenses += Math.abs(amount);
    grouped.set(month, entry);
  }
  return [...grouped.values()];
}

/**
 * Monthly spending per category over a date range (for stacked/grouped charts).
 * Returns array of { month, category_name, total }.
 */
async function monthlyCategoryTrends(userId, startDate, endDate, { limit = 10 } = {}) {
  // First find the top N categories by total spend, then get their monthly breakdown.
  const { rows } = await pool.query(
    `WITH top_cats AS (
       SELECT s.category_id, c.name AS category_name,
              ABS(SUM(s.amount))::float AS grand_total
       FROM transaction_splits s
       JOIN transactions t ON t.id = s.transaction_id
       LEFT JOIN categories c ON c.id = s.category_id
       WHERE t.user_id = $1 AND t.is_transfer = false AND t.debt_id IS NULL
         AND COALESCE(t.transaction_type, CASE WHEN t.amount >= 0 THEN 'income' ELSE 'expense' END) = 'expense'
         AND t.date >= $2::date AND t.date <= $3::date
         AND s.amount < 0
       GROUP BY s.category_id, c.name
       ORDER BY grand_total DESC
       LIMIT $4
     )
     SELECT to_char(t.date, 'YYYY-MM') AS month,
            COALESCE(c.name, 'Uncategorized') AS category_name,
            ABS(SUM(s.amount))::float AS total, a.currency
     FROM transaction_splits s
     JOIN transactions t ON t.id = s.transaction_id
     JOIN accounts a ON a.id = t.account_id
     LEFT JOIN categories c ON c.id = s.category_id
     WHERE t.user_id = $1 AND t.is_transfer = false AND t.debt_id IS NULL
       AND COALESCE(t.transaction_type, CASE WHEN t.amount >= 0 THEN 'income' ELSE 'expense' END) = 'expense'
       AND t.date >= $2::date AND t.date <= $3::date
       AND s.amount < 0
       AND (s.category_id IN (SELECT category_id FROM top_cats) OR s.category_id IS NULL)
     GROUP BY to_char(t.date, 'YYYY-MM'), c.name, a.currency
     ORDER BY month, total DESC`,
    [userId, startDate, endDate, limit]
  );
  const context = await displayContext(userId);
  return rows.map((row) => ({ ...row, total: convertAmount(row.total, row.currency, context.currency, context.rates) }));
}

// ---------------------------------------------------------------------------
// Net worth over time
// ---------------------------------------------------------------------------

/**
 * Reconstructs net worth (sum of all account balances) at the end of each month
 * by replaying transaction amounts from opening balances forward.
 * Returns array of { month, net_worth }.
 */
async function netWorthHistory(userId) {
  // Get all accounts with their opening balances
  const { rows: accounts } = await pool.query(
    'SELECT id, opening_balance::float, currency FROM accounts WHERE user_id = $1',
    [userId]
  );

  if (!accounts.length) return [];

  const context = await displayContext(userId);
  const totalOpening = accounts.reduce((s, a) => s + convertAmount(a.opening_balance, a.currency, context.currency, context.rates), 0);

  // Get cumulative transaction sums by month (excluding none — transfers
  // DO affect net worth since they move money between the user's own accounts
  // and net out to zero anyway, but including them is harmless and simpler
  // than filtering them; they cancel out in the sum).
  const { rows } = await pool.query(
    `SELECT to_char(t.date, 'YYYY-MM') AS month,
            SUM(t.amount)::float AS month_delta, a.currency
     FROM transactions t
     JOIN accounts a ON a.id = t.account_id
     WHERE t.user_id = $1
     GROUP BY to_char(t.date, 'YYYY-MM'), a.currency
     ORDER BY month`,
    [userId]
  );

  let running = totalOpening;
  const byMonth = new Map();
  for (const row of rows) {
    byMonth.set(row.month, (byMonth.get(row.month) || 0) +
      convertAmount(row.month_delta, row.currency, context.currency, context.rates));
  }
  return [...byMonth.entries()].map(([month, delta]) => {
    running += delta;
    return { month, net_worth: running };
  });
}

/**
 * Current net worth — sum of all active account balances.
 */
async function currentNetWorth(userId) {
  const { rows } = await pool.query(
    'SELECT current_balance::float, currency FROM accounts WHERE user_id = $1 AND is_active = true',
    [userId]
  );
  const context = await displayContext(userId);
  return rows.reduce((sum, row) => sum + convertAmount(row.current_balance, row.currency, context.currency, context.rates), 0);
}

// ---------------------------------------------------------------------------
// Custom date-range report with export-ready data
// ---------------------------------------------------------------------------

/**
 * Full report data for CSV export: all transactions in the date range,
 * joined with account name, category names from splits.
 */
async function transactionsForExport(userId, { startDate, endDate, accountId, categoryId } = {}) {
  const params = [userId];
  const conditions = ['t.user_id = $1'];

  if (startDate) {
    params.push(startDate);
    conditions.push(`t.date >= $${params.length}::date`);
  }
  if (endDate) {
    params.push(endDate);
    conditions.push(`t.date <= $${params.length}::date`);
  }
  if (accountId) {
    params.push(accountId);
    conditions.push(`t.account_id = $${params.length}`);
  }

  let categoryJoin = '';
  if (categoryId) {
    params.push(categoryId);
    categoryJoin = `JOIN transaction_splits sf ON sf.transaction_id = t.id AND sf.category_id = $${params.length}`;
  }

  const { rows } = await pool.query(
    `SELECT t.date, t.amount::float, t.payee, t.note, t.is_transfer,
            d.person_name AS debt_person,
            COALESCE(NULLIF(a.account_title, ''), a.name) AS account_name,
            a.bank_name,
            a.currency AS account_currency,
            (SELECT string_agg(COALESCE(c.name, 'Uncategorized') || ': ' || s.amount::text, '; ')
             FROM transaction_splits s
             LEFT JOIN categories c ON c.id = s.category_id
             WHERE s.transaction_id = t.id) AS categories
     FROM transactions t
     JOIN accounts a ON a.id = t.account_id
     LEFT JOIN debts d ON d.id = t.debt_id
     ${categoryJoin}
     WHERE ${conditions.join(' AND ')}
     ORDER BY t.date DESC, t.created_at DESC`,
    params
  );
  return rows;
}

module.exports = {
  incomeExpenseForRange,
  spendingByCategory,
  incomeByCategory,
  monthlyTrends,
  monthlyCategoryTrends,
  netWorthHistory,
  currentNetWorth,
  transactionsForExport,
};
