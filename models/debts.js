const { pool } = require('../config/db');

class ValidationError extends Error {}

async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function getOwnedDebt(client, userId, debtId, lock = false) {
  if (lock) {
    const locked = await client.query('SELECT id FROM debts WHERE id = $1 AND user_id = $2 FOR UPDATE', [
      debtId,
      userId,
    ]);
    if (!locked.rows.length) return null;
  }
  const { rows } = await client.query(
    `SELECT d.*, COALESCE(SUM(r.amount), 0)::float AS repaid,
       (d.principal - COALESCE(SUM(r.amount), 0))::float AS remaining
     FROM debts d
     LEFT JOIN debt_repayments r ON r.debt_id = d.id
     WHERE d.id = $1 AND d.user_id = $2
     GROUP BY d.id`,
    [debtId, userId]
  );
  return rows[0] || null;
}

async function list(userId) {
  const { rows } = await pool.query(
    `SELECT d.*, COALESCE(SUM(r.amount), 0)::float AS repaid,
       (d.principal - COALESCE(SUM(r.amount), 0))::float AS remaining
     FROM debts d
     LEFT JOIN debt_repayments r ON r.debt_id = d.id
     WHERE d.user_id = $1
     GROUP BY d.id
     ORDER BY d.is_settled, d.created_at DESC`,
    [userId]
  );
  return rows;
}

async function getById(userId, debtId) {
  return getOwnedDebt(pool, userId, debtId);
}

async function create(userId, { personName, direction, amount, accountId, currency = 'PKR', recordMovement, note, date }) {
  if (!['lent', 'borrowed'].includes(direction)) throw new ValidationError('Choose a valid debt direction.');
  if (Number(amount) <= 0) throw new ValidationError('Debt amount must be positive.');
  return withTransaction(async (client) => {
    let accountCurrency = String(currency).toUpperCase();
    if (recordMovement) {
      const account = await client.query(
        'SELECT id, currency FROM accounts WHERE id = $1 AND user_id = $2 AND is_active = true',
        [accountId, userId]
      );
      if (!account.rows.length) throw new ValidationError('Choose an account when recording an account movement.');
      accountCurrency = account.rows[0].currency;
    }
    const debtResult = await client.query(
      `INSERT INTO debts (user_id, person_name, direction, principal, currency, note)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [userId, personName.trim(), direction, amount, accountCurrency, note || null]
    );
    const debt = debtResult.rows[0];
    if (!recordMovement) return debt;
    const signedAmount = direction === 'lent' ? -Math.abs(amount) : Math.abs(amount);
    const transaction = await client.query(
      `INSERT INTO transactions
       (user_id, account_id, date, amount, payee, note, debt_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [userId, accountId, date, signedAmount, `Debt: ${personName}`, note || `Debt with ${personName}`, debt.id]
    );
    await client.query(
      'INSERT INTO transaction_splits (transaction_id, amount) VALUES ($1, $2)',
      [transaction.rows[0].id, signedAmount]
    );
    await client.query('UPDATE accounts SET current_balance = current_balance + $1 WHERE id = $2', [
      signedAmount,
      accountId,
    ]);
    return debt;
  });
}

async function addRepayment(userId, debtId, { amount, accountId, recordMovement, note, date }) {
  if (Number(amount) <= 0) throw new ValidationError('Repayment amount must be positive.');
  return withTransaction(async (client) => {
    const debt = await getOwnedDebt(client, userId, debtId, true);
    if (!debt) throw new ValidationError('Debt not found.');
    if (Number(amount) > Number(debt.remaining)) throw new ValidationError('Repayment cannot exceed the remaining debt.');
    if (recordMovement) {
      const account = await client.query(
        'SELECT id FROM accounts WHERE id = $1 AND user_id = $2 AND is_active = true',
        [accountId, userId]
      );
      if (!account.rows.length) throw new ValidationError('Choose an account when recording an account movement.');
    }
    if (!recordMovement) {
      await client.query(
        'INSERT INTO debt_repayments (debt_id, transaction_id, amount) VALUES ($1, NULL, $2)',
        [debt.id, amount]
      );
      if (Number(amount) === Number(debt.remaining)) {
        await client.query('UPDATE debts SET is_settled = true WHERE id = $1', [debt.id]);
      }
      return null;
    }
    const signedAmount = debt.direction === 'lent' ? Math.abs(amount) : -Math.abs(amount);
    const transaction = await client.query(
      `INSERT INTO transactions
       (user_id, account_id, date, amount, payee, note, debt_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [userId, accountId, date, signedAmount, `Debt: ${debt.person_name}`, note || `Repayment from ${debt.person_name}`, debt.id]
    );
    await client.query(
      'INSERT INTO transaction_splits (transaction_id, amount) VALUES ($1, $2)',
      [transaction.rows[0].id, signedAmount]
    );
    await client.query(
      'INSERT INTO debt_repayments (debt_id, transaction_id, amount) VALUES ($1, $2, $3)',
      [debt.id, transaction.rows[0].id, amount]
    );
    await client.query('UPDATE accounts SET current_balance = current_balance + $1 WHERE id = $2', [
      signedAmount,
      accountId,
    ]);
    if (Number(amount) === Number(debt.remaining)) {
      await client.query('UPDATE debts SET is_settled = true WHERE id = $1', [debt.id]);
    }
    return transaction.rows[0];
  });
}

async function update(userId, debtId, { personName, note }) {
  const { rows } = await pool.query(
    `UPDATE debts SET person_name = $1, note = $2
     WHERE id = $3 AND user_id = $4 RETURNING *`,
    [personName.trim(), note || null, debtId, userId]
  );
  return rows[0] || null;
}

async function summary(userId) {
  const { rows } = await pool.query(
    `SELECT direction, currency, SUM(remaining)::float AS remaining
     FROM (
       SELECT d.direction, d.currency,
         d.principal - COALESCE((SELECT SUM(r.amount) FROM debt_repayments r WHERE r.debt_id = d.id), 0) AS remaining
       FROM debts d WHERE d.user_id = $1 AND d.is_settled = false
     ) open_debts
     GROUP BY direction, currency`,
    [userId]
  );
  return rows;
}

module.exports = { ValidationError, list, getById, create, addRepayment, update, summary };
