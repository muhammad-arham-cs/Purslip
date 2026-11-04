const { Pool, types } = require('pg');

// Postgres DATE columns (transactions.date, budgets.month, etc.) would
// otherwise come back as JS Date objects parsed at local midnight — calling
// .toISOString() on those shifts the date across the UTC boundary depending
// on the server's timezone (e.g. "2026-01-01" becomes "2025-12-31" west of
// UTC+0). Returning the raw 'YYYY-MM-DD' string sidesteps that whole class
// of off-by-one-day bugs.
types.setTypeParser(types.builtins.DATE, (value) => value);

const connectionString = process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env and configure it.');
}

const useSsl = process.env.PGSSL === 'true' || process.env.NODE_ENV === 'production';

const pool = new Pool({
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
  max: Number(process.env.PG_POOL_MAX || 20),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle Postgres client', err);
});

async function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, query };
