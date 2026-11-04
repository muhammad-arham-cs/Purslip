const { pool } = require('../config/db');

async function list(userId) {
  const { rows } = await pool.query(
    'SELECT * FROM import_mappings WHERE user_id = $1 ORDER BY source_name',
    [userId]
  );
  return rows;
}

async function getById(userId, id) {
  const { rows } = await pool.query(
    'SELECT * FROM import_mappings WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  return rows[0] || null;
}

async function upsert(userId, { sourceName, columnMapping, dateFormat, amountMode, defaultAccountId }) {
  const { rows } = await pool.query(
    `INSERT INTO import_mappings (user_id, source_name, column_mapping, date_format, amount_mode, default_account_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, source_name)
     DO UPDATE SET column_mapping = $3, date_format = $4, amount_mode = $5, default_account_id = $6, updated_at = now()
     RETURNING *`,
    [userId, sourceName, JSON.stringify(columnMapping), dateFormat, amountMode, defaultAccountId || null]
  );
  return rows[0];
}

module.exports = { list, getById, upsert };
