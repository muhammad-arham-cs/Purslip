const { pool } = require('../config/db');

async function list(userId) {
  const { rows } = await pool.query(
    `SELECT g.*, a.account_title AS account_name, a.bank_name, a.currency AS account_currency, a.current_balance::float AS account_balance
     FROM goals g
     JOIN accounts a ON a.id = g.account_id
     WHERE g.user_id = $1
     ORDER BY g.is_achieved, g.target_date NULLS LAST, g.created_at`,
    [userId]
  );
  return rows.map(enrichGoal);
}

async function getById(userId, goalId) {
  const { rows } = await pool.query(
    `SELECT g.*, a.account_title AS account_name, a.bank_name, a.currency AS account_currency, a.current_balance::float AS account_balance
     FROM goals g
     JOIN accounts a ON a.id = g.account_id
     WHERE g.id = $1 AND g.user_id = $2`,
    [goalId, userId]
  );
  if (!rows.length) return null;
  return enrichGoal(rows[0]);
}

async function create(userId, { accountId, name, targetAmount, startingBalance, targetDate }) {
  const { rows } = await pool.query(
    `INSERT INTO goals (user_id, account_id, name, target_amount, starting_balance, target_date)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [userId, accountId, name, targetAmount, startingBalance || 0, targetDate || null]
  );
  return rows[0];
}

async function update(userId, goalId, { accountId, name, targetAmount, startingBalance, targetDate }) {
  const { rows } = await pool.query(
    `UPDATE goals
     SET account_id = $1, name = $2, target_amount = $3, starting_balance = $4, target_date = $5
     WHERE id = $6 AND user_id = $7
     RETURNING *`,
    [accountId, name, targetAmount, startingBalance || 0, targetDate || null, goalId, userId]
  );
  return rows[0] || null;
}

async function setAchieved(userId, goalId, isAchieved) {
  const { rows } = await pool.query(
    'UPDATE goals SET is_achieved = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
    [isAchieved, goalId, userId]
  );
  return rows[0] || null;
}

async function remove(userId, goalId) {
  const { rowCount } = await pool.query(
    'DELETE FROM goals WHERE id = $1 AND user_id = $2',
    [goalId, userId]
  );
  return rowCount > 0;
}

// Enriches a goal row with progress calculations.
// Progress = (account_balance - starting_balance) / (target_amount - starting_balance)
// This tells us how far the account has grown from the goal's starting point
// toward the target. If the account was already at $500 and the goal is $1000,
// progress starts at 0% (not 50%) — it's measuring how much NEW saving
// has been done, not the absolute balance.
function enrichGoal(goal) {
  const target = Number(goal.target_amount);
  const starting = Number(goal.starting_balance);
  const balance = Number(goal.account_balance);
  const delta = target - starting;
  const saved = balance - starting;
  const percentComplete = delta > 0 ? Math.min(100, Math.max(0, (saved / delta) * 100)) : 100;

  let daysRemaining = null;
  if (goal.target_date) {
    const now = new Date();
    const target = new Date(goal.target_date + 'T00:00:00');
    daysRemaining = Math.max(0, Math.ceil((target - now) / (1000 * 60 * 60 * 24)));
  }

  return {
    ...goal,
    saved: Math.max(0, saved),
    remaining: Math.max(0, delta - saved),
    percentComplete,
    daysRemaining,
  };
}

module.exports = {
  list,
  getById,
  create,
  update,
  setAchieved,
  remove,
};
