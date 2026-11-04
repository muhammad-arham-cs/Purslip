const { pool } = require('../config/db');
const { computeNextDate, monthlyEquivalent } = require('../lib/recurringSchedule');

const FREQUENCIES = ['daily', 'weekly', 'biweekly', 'monthly', 'yearly', 'custom_days'];

async function list(userId, { includeInactive = false } = {}) {
  const { rows } = await pool.query(
    `SELECT r.*, a.account_title AS account_name, a.bank_name, a.currency AS account_currency, c.name AS category_name
     FROM recurring_transactions r
     JOIN accounts a ON a.id = r.account_id
     LEFT JOIN categories c ON c.id = r.category_id
     WHERE r.user_id = $1 ${includeInactive ? '' : 'AND r.is_active = true'}
     ORDER BY r.next_run_date`,
    [userId]
  );
  return rows;
}

async function getById(userId, id) {
  const { rows } = await pool.query(
    'SELECT * FROM recurring_transactions WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  return rows[0] || null;
}

async function create(userId, { accountId, categoryId, payee, note, amount, frequency, customIntervalDays, startDate, endDate }) {
  const { rows } = await pool.query(
    `INSERT INTO recurring_transactions
       (user_id, account_id, category_id, payee, note, amount, frequency, custom_interval_days, start_date, end_date, next_run_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $9)
     RETURNING *`,
    [
      userId,
      accountId,
      categoryId || null,
      payee || null,
      note || null,
      amount,
      frequency,
      frequency === 'custom_days' ? customIntervalDays : null,
      startDate,
      endDate || null,
    ]
  );
  return rows[0];
}

async function update(userId, id, { accountId, categoryId, payee, note, amount, frequency, customIntervalDays, endDate }) {
  const { rows } = await pool.query(
    `UPDATE recurring_transactions
     SET account_id = $1, category_id = $2, payee = $3, note = $4, amount = $5,
         frequency = $6, custom_interval_days = $7, end_date = $8
     WHERE id = $9 AND user_id = $10
     RETURNING *`,
    [
      accountId,
      categoryId || null,
      payee || null,
      note || null,
      amount,
      frequency,
      frequency === 'custom_days' ? customIntervalDays : null,
      endDate || null,
      id,
      userId,
    ]
  );
  return rows[0] || null;
}

async function setActive(userId, id, isActive) {
  const { rows } = await pool.query(
    'UPDATE recurring_transactions SET is_active = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
    [isActive, id, userId]
  );
  return rows[0] || null;
}

async function remove(userId, id) {
  const { rowCount } = await pool.query(
    'DELETE FROM recurring_transactions WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  return rowCount > 0;
}

async function upcomingBills(userId, withinDays = 14) {
  const { rows } = await pool.query(
    `SELECT r.*, a.account_title AS account_name, a.bank_name, a.currency AS account_currency, c.name AS category_name
     FROM recurring_transactions r
     JOIN accounts a ON a.id = r.account_id
     LEFT JOIN categories c ON c.id = r.category_id
     WHERE r.user_id = $1 AND r.is_active = true AND r.amount < 0
       AND r.next_run_date <= (CURRENT_DATE + ($2 || ' days')::interval)
     ORDER BY r.next_run_date`,
    [userId, withinDays]
  );
  return rows;
}

async function subscriptionSummary(userId) {
  const templates = await list(userId, { includeInactive: false });
  const expenseTemplates = templates.filter((t) => Number(t.amount) < 0);
  const totalMonthly = expenseTemplates.reduce(
    (sum, t) => sum + Math.abs(monthlyEquivalent(Number(t.amount), t.frequency, t.custom_interval_days)),
    0
  );
  return { templates: expenseTemplates, totalMonthly };
}

// Generates every transaction a template is due for, one at a time, catching
// up on any missed dates (e.g. the app was down for a few days) rather than
// skipping straight to today. Each occurrence is recorded in
// recurring_transaction_occurrences under a UNIQUE(recurring_transaction_id,
// occurrence_date) constraint, so this is safe to call repeatedly or
// concurrently — a date that's already been generated is never generated
// again.
async function processTemplate(client, template) {
  let cursor = template.next_run_date;
  let generated = 0;
  let lastGeneratedDate = template.last_generated_date;

  while (cursor <= template.end_date_check_today && (!template.end_date || cursor <= template.end_date)) {
    // eslint-disable-next-line no-await-in-loop
    const txnRes = await client.query(
      `INSERT INTO transactions
       (user_id, account_id, date, amount, transaction_type, payee, note)
       VALUES ($1, $2, $3, $4, CASE WHEN $4 >= 0 THEN 'income' ELSE 'expense' END, $5, $6)
       RETURNING id`,
      [template.user_id, template.account_id, cursor, template.amount, template.payee, template.note]
    );
    const transactionId = txnRes.rows[0].id;

    // eslint-disable-next-line no-await-in-loop
    await client.query(
      'INSERT INTO transaction_splits (transaction_id, category_id, amount) VALUES ($1, $2, $3)',
      [transactionId, template.category_id, template.amount]
    );

    // eslint-disable-next-line no-await-in-loop
    const occRes = await client.query(
      `INSERT INTO recurring_transaction_occurrences (recurring_transaction_id, transaction_id, occurrence_date)
       VALUES ($1, $2, $3)
       ON CONFLICT (recurring_transaction_id, occurrence_date) DO NOTHING
       RETURNING id`,
      [template.id, transactionId, cursor]
    );
    if (!occRes.rows.length) {
      // Someone else already generated this exact date concurrently — undo
      // the transaction we just inserted rather than leaving a duplicate.
      // eslint-disable-next-line no-await-in-loop
      await client.query('DELETE FROM transactions WHERE id = $1', [transactionId]);
      break;
    }

    // eslint-disable-next-line no-await-in-loop
    await client.query('UPDATE accounts SET current_balance = current_balance + $1 WHERE id = $2', [
      template.amount,
      template.account_id,
    ]);

    generated += 1;
    lastGeneratedDate = cursor;
    cursor = computeNextDate(cursor, template.frequency, template.custom_interval_days);
  }

  const stillActive = !template.end_date || cursor <= template.end_date;
  await client.query(
    'UPDATE recurring_transactions SET next_run_date = $1, last_generated_date = $2, is_active = $3 WHERE id = $4',
    [cursor, lastGeneratedDate, stillActive, template.id]
  );

  return generated;
}

// asOfDate lets tests pin "today" deterministically instead of depending on
// the real clock; production calls (the cron job) omit it and get CURRENT_DATE.
async function generateDue({ userId, asOfDate } = {}) {
  const client = await pool.connect();
  let totalGenerated = 0;
  try {
    const { rows: dateRows } = await client.query(
      asOfDate ? 'SELECT $1::date AS today' : 'SELECT CURRENT_DATE AS today',
      asOfDate ? [asOfDate] : []
    );
    const today = dateRows[0].today;

    const params = [today];
    let userFilter = '';
    if (userId) {
      params.push(userId);
      userFilter = `AND user_id = $${params.length}`;
    }
    const { rows: templates } = await client.query(
      `SELECT * FROM recurring_transactions WHERE is_active = true AND next_run_date <= $1 ${userFilter}`,
      params
    );

    for (const template of templates) {
      // eslint-disable-next-line no-await-in-loop
      await client.query('BEGIN');
      try {
        // eslint-disable-next-line no-await-in-loop
        const generated = await processTemplate(client, { ...template, end_date_check_today: today });
        // eslint-disable-next-line no-await-in-loop
        await client.query('COMMIT');
        totalGenerated += generated;
      } catch (err) {
        // eslint-disable-next-line no-await-in-loop
        await client.query('ROLLBACK');
        throw err;
      }
    }
  } finally {
    client.release();
  }
  return { templatesProcessed: totalGenerated };
}

module.exports = {
  FREQUENCIES,
  list,
  getById,
  create,
  update,
  setActive,
  remove,
  upcomingBills,
  subscriptionSummary,
  generateDue,
};
