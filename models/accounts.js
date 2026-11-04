const { pool } = require('../config/db');

const ACCOUNT_TYPES = ['checking', 'savings', 'credit_card', 'cash', 'investment', 'other'];

async function list(userId, { includeArchived = false } = {}) {
  const { rows } = await pool.query(
    `SELECT id, user_id, COALESCE(NULLIF(account_title, ''), name) AS account_title,
       name, bank_name, type, currency, opening_balance, current_balance,
       is_active, display_order, created_at, updated_at
     FROM accounts
     WHERE user_id = $1 ${includeArchived ? '' : 'AND is_active = true'}
     ORDER BY display_order, created_at`,
    [userId]
  );
  return rows;
}

async function getById(userId, accountId) {
  const { rows } = await pool.query(
    `SELECT id, user_id, COALESCE(NULLIF(account_title, ''), name) AS account_title,
       name, bank_name, type, currency, opening_balance, current_balance,
       is_active, display_order, created_at, updated_at
     FROM accounts WHERE id = $1 AND user_id = $2`,
    [accountId, userId]
  );
  return rows[0] || null;
}

async function create(userId, { name, accountTitle, bankName, type, currency, openingBalance }) {
  const { rows } = await pool.query(
    `INSERT INTO accounts (user_id, name, account_title, bank_name, type, currency, opening_balance, current_balance)
     VALUES ($1, $2, $2, $3, $4, $5, $6, $6)
     RETURNING *`,
    [userId, accountTitle || name, bankName || '', type, currency || 'PKR', openingBalance]
  );
  return rows[0];
}

// Updating opening_balance shifts current_balance by the delta rather than
// overwriting it, so any balance movement already recorded via transactions
// (adjustBalance, added for Phase 3) is preserved rather than clobbered.
async function update(userId, accountId, { name, accountTitle, bankName, type, currency, openingBalance }) {
  const existing = await getById(userId, accountId);
  if (!existing) return null;

  const delta = Number(openingBalance) - Number(existing.opening_balance);

  const { rows } = await pool.query(
    `UPDATE accounts
     SET name = $1, account_title = $1, bank_name = $2, type = $3, currency = $4,
         opening_balance = $5, current_balance = current_balance + $6
     WHERE id = $7 AND user_id = $8
     RETURNING *`,
    [accountTitle || name, bankName || '', type, currency || 'PKR', openingBalance, delta, accountId, userId]
  );
  return rows[0] || null;
}

async function setActive(userId, accountId, isActive) {
  const { rows } = await pool.query(
    'UPDATE accounts SET is_active = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
    [isActive, accountId, userId]
  );
  return rows[0] || null;
}

async function transactionCount(userId, accountId) {
  const { rows } = await pool.query(
    'SELECT count(*)::int AS count FROM transactions WHERE account_id = $1 AND user_id = $2',
    [accountId, userId]
  );
  return rows[0].count;
}

// Hard-deletes only when the account has no transaction history (nothing to
// lose); otherwise archives it instead, since deleting would either cascade
// away real financial history or (if we changed the FK) orphan it.
async function remove(userId, accountId) {
  const existing = await getById(userId, accountId);
  if (!existing) return null;

  const count = await transactionCount(userId, accountId);
  if (count > 0) {
    await setActive(userId, accountId, false);
    return { archived: true };
  }

  await pool.query('DELETE FROM accounts WHERE id = $1 AND user_id = $2', [accountId, userId]);
  return { deleted: true };
}

// Applied by transaction create/edit/delete logic (Phase 3) to keep
// current_balance in sync without recomputing the full history on every
// write. Always re-derivable via recalculate() below if it ever drifts.
async function adjustBalance(accountId, delta) {
  await pool.query('UPDATE accounts SET current_balance = current_balance + $1 WHERE id = $2', [
    delta,
    accountId,
  ]);
}

async function recalculate(accountId) {
  const { rows } = await pool.query(
    `UPDATE accounts
     SET current_balance = opening_balance + COALESCE(
       (SELECT sum(amount) FROM transactions WHERE account_id = $1), 0
     )
     WHERE id = $1
     RETURNING *`,
    [accountId]
  );
  return rows[0] || null;
}

module.exports = {
  ACCOUNT_TYPES,
  list,
  getById,
  create,
  update,
  setActive,
  remove,
  adjustBalance,
  recalculate,
  transactionCount,
};
