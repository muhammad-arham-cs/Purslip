const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');

const BCRYPT_ROUNDS = 12;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

async function createUser(email, password) {
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash) VALUES ($1, $2)
     RETURNING id, email, created_at`,
    [email, passwordHash]
  );
  return rows[0];
}

async function findByEmail(email) {
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  return rows[0] || null;
}

async function findById(id) {
  const { rows } = await pool.query(
    'SELECT id, email, created_at FROM users WHERE id = $1',
    [id]
  );
  return rows[0] || null;
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
  MAX_FAILED_ATTEMPTS,
  LOCKOUT_MINUTES,
};
