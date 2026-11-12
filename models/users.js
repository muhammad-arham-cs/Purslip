const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');

const BCRYPT_ROUNDS = 12;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 5;

async function createUser(email, password, {
  fullName = '',
  country = '',
  phoneNumber = '',
  displayCurrency = 'PKR',
  cnic = '',
} = {}) {
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const { rows } = await pool.query(
    `INSERT INTO users
      (email, password_hash, full_name, country, phone_number, display_currency, cnic)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, email, created_at`,
    [email, passwordHash, fullName, country, phoneNumber, displayCurrency, cnic]
  );
  return rows[0];
}

async function findByEmail(email) {
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  return rows[0] || null;
}

async function findById(id) {
  const { rows } = await pool.query(
    `SELECT id, email, full_name, country, phone_number, display_currency, cnic, created_at
     FROM users WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function getProfile(userId) {
  const { rows } = await pool.query(
    `SELECT id, email, full_name, country, phone_number, display_currency, cnic, created_at
     FROM users WHERE id = $1`,
    [userId]
  );
  return rows[0] || null;
}

async function updateProfile(userId, { fullName, country, phoneNumber }) {
  const { rows } = await pool.query(
    `UPDATE users
     SET full_name = $1, country = $2, phone_number = $3
     WHERE id = $4
     RETURNING id, email, full_name, country, phone_number, display_currency, cnic, created_at`,
    [fullName, country, phoneNumber, userId]
  );
  return rows[0] || null;
}

async function updateEmail(userId, email) {
  const { rows } = await pool.query(
    `UPDATE users SET email = $1
     WHERE id = $2
     RETURNING id, email, full_name, country, phone_number, display_currency, cnic, created_at`,
    [email, userId]
  );
  return rows[0] || null;
}

async function deleteUser(userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rowCount } = await client.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [userId]);
    if (rowCount !== 1) {
      await client.query('ROLLBACK');
      return false;
    }

    await client.query(
      `DELETE FROM debt_repayments
       WHERE debt_id IN (SELECT id FROM debts WHERE user_id = $1)`,
      [userId]
    );
    await client.query(
      `DELETE FROM recurring_transaction_occurrences
       WHERE recurring_transaction_id IN (
         SELECT id FROM recurring_transactions WHERE user_id = $1
       )`,
      [userId]
    );
    await client.query(
      `DELETE FROM transaction_splits
       WHERE transaction_id IN (SELECT id FROM transactions WHERE user_id = $1)`,
      [userId]
    );
    await client.query('DELETE FROM transactions WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM recurring_transactions WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM budgets WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM goals WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM import_mappings WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM debts WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM cards WHERE user_id = $1', [userId]).catch(() => {});
    await client.query('DELETE FROM accounts WHERE user_id = $1', [userId]);
    await client.query(
      'DELETE FROM categories WHERE user_id = $1 AND parent_id IS NOT NULL',
      [userId]
    );
    await client.query('DELETE FROM categories WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM users WHERE id = $1', [userId]);

    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

function maskCnic(cnic) {
  if (!cnic) return 'Not provided';
  return `${'*'.repeat(Math.max(0, cnic.length - 4))}${cnic.slice(-4)}`;
}

async function getPreferences(userId) {
  const { rows } = await pool.query(
    'SELECT display_currency, exchange_rates, language, theme FROM users WHERE id = $1',
    [userId]
  );
  return rows[0] || { display_currency: 'PKR', exchange_rates: { PKR: 1, USD: 1 }, language: 'en', theme: 'dark' };
}

async function updatePreferences(userId, { displayCurrency, exchangeRates, language, theme }) {
  const { rows } = await pool.query(
    `UPDATE users
     SET display_currency = $1, exchange_rates = $2::jsonb, language = $3, theme = $4
     WHERE id = $5
     RETURNING display_currency, exchange_rates, language, theme`,
    [displayCurrency, JSON.stringify(exchangeRates), language, theme, userId]
  );
  return rows[0] || null;
}

async function verifyPassword(user, password) {
  return bcrypt.compare(password, user.password_hash);
}

// Returns { locked: boolean, retryAfterMs } — call before attempting auth.
function lockStatus(user) {
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    return { locked: true, retryAfterMs: new Date(user.locked_until) - new Date() };
  }
  return { locked: false, retryAfterMs: 0 };
}

async function registerFailedLogin(user) {
  const attempts = user.failed_login_attempts + 1;
  if (attempts >= MAX_FAILED_ATTEMPTS) {
    const lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
    await pool.query(
      'UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3',
      [attempts, lockedUntil, user.id]
    );
    return { locked: true, lockedUntil };
  }
  await pool.query('UPDATE users SET failed_login_attempts = $1 WHERE id = $2', [
    attempts,
    user.id,
  ]);
  return { locked: false };
}

async function resetFailedLogins(userId) {
  await pool.query(
    'UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1',
    [userId]
  );
}

async function setResetToken(email, token, expires) {
  const { rows } = await pool.query(
    `UPDATE users SET reset_token = $1, reset_token_expires = $2
     WHERE email = $3
     RETURNING id, email`,
    [token, expires, email]
  );
  return rows[0] || null;
}

async function findByResetToken(token) {
  const { rows } = await pool.query(
    `SELECT * FROM users WHERE reset_token = $1 AND reset_token_expires > now()`,
    [token]
  );
  return rows[0] || null;
}

async function updatePassword(userId, newPassword) {
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await pool.query(
    `UPDATE users
     SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL,
         failed_login_attempts = 0, locked_until = NULL
     WHERE id = $2`,
    [passwordHash, userId]
  );
}

module.exports = {
  createUser,
  findByEmail,
  findById,
  getPreferences,
  updatePreferences,
  verifyPassword,
  lockStatus,
  registerFailedLogin,
  resetFailedLogins,
  setResetToken,
  findByResetToken,
  updatePassword,
  getProfile,
  updateProfile,
  updateEmail,
  deleteUser,
  maskCnic,
  MAX_FAILED_ATTEMPTS,
  LOCKOUT_MINUTES,
};
