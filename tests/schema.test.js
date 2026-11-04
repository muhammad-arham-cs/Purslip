const { pool } = require('../config/db');

afterAll(async () => {
  await pool.end();
});

const EXPECTED_TABLES = [
  'session',
  'users',
  'accounts',
  'categories',
  'transactions',
  'transaction_splits',
  'budgets',
  'recurring_transactions',
  'recurring_transaction_occurrences',
  'goals',
  'import_mappings',
];

describe('database schema', () => {
  it('creates every core table', async () => {
    const { rows } = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
    );
    const tableNames = rows.map((r) => r.table_name);
    for (const table of EXPECTED_TABLES) {
      expect(tableNames).toContain(table);
    }
  });

  it('enforces unique, case-insensitive user email', async () => {
    await pool.query('INSERT INTO users (email, password_hash) VALUES ($1, $2)', [
      'dupe@example.com',
      'hash',
    ]);
    await expect(
      pool.query('INSERT INTO users (email, password_hash) VALUES ($1, $2)', [
        'Dupe@Example.com',
        'hash2',
      ])
    ).rejects.toThrow();
  });

  it('cascades transaction deletion to its splits', async () => {
    const userRes = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
      ['cascade-test@example.com', 'hash']
    );
    const userId = userRes.rows[0].id;

    const accountRes = await pool.query(
      'INSERT INTO accounts (user_id, name, type) VALUES ($1, $2, $3) RETURNING id',
      [userId, 'Checking', 'checking']
    );
    const accountId = accountRes.rows[0].id;

    const categoryRes = await pool.query(
      'INSERT INTO categories (user_id, name, kind) VALUES ($1, $2, $3) RETURNING id',
      [userId, 'Groceries', 'expense']
    );
    const categoryId = categoryRes.rows[0].id;

    const txnRes = await pool.query(
      'INSERT INTO transactions (user_id, account_id, date, amount, payee) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [userId, accountId, '2026-01-15', -42.5, 'Test Store']
    );
    const txnId = txnRes.rows[0].id;

    await pool.query(
      'INSERT INTO transaction_splits (transaction_id, category_id, amount) VALUES ($1, $2, $3)',
      [txnId, categoryId, -42.5]
    );

    await pool.query('DELETE FROM transactions WHERE id = $1', [txnId]);

    const splitsRes = await pool.query(
      'SELECT * FROM transaction_splits WHERE transaction_id = $1',
      [txnId]
    );
    expect(splitsRes.rows).toHaveLength(0);
  });

  it('blocks deleting a category still referenced by a split', async () => {
    const userRes = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
      ['restrict-test@example.com', 'hash']
    );
    const userId = userRes.rows[0].id;

    const accountRes = await pool.query(
      'INSERT INTO accounts (user_id, name, type) VALUES ($1, $2, $3) RETURNING id',
      [userId, 'Checking', 'checking']
    );
    const accountId = accountRes.rows[0].id;

    const categoryRes = await pool.query(
      'INSERT INTO categories (user_id, name, kind) VALUES ($1, $2, $3) RETURNING id',
      [userId, 'Rent', 'expense']
    );
    const categoryId = categoryRes.rows[0].id;

    const txnRes = await pool.query(
      'INSERT INTO transactions (user_id, account_id, date, amount, payee) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [userId, accountId, '2026-01-01', -1000, 'Landlord']
    );
    const txnId = txnRes.rows[0].id;

    await pool.query(
      'INSERT INTO transaction_splits (transaction_id, category_id, amount) VALUES ($1, $2, $3)',
      [txnId, categoryId, -1000]
    );

    await expect(pool.query('DELETE FROM categories WHERE id = $1', [categoryId])).rejects.toThrow();
  });
});
