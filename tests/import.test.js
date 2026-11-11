const request = require('supertest');
const app = require('../server');
const { pool } = require('../config/db');
const accountsModel = require('../models/accounts');
const transactionsModel = require('../models/transactions');
const usersModel = require('../models/users');

afterAll(async () => {
  await pool.end();
});

function uniqueEmail(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

async function signedInAgentWithAccount(prefix, openingBalance = '1000') {
  const agent = request.agent(app);
  const email = uniqueEmail(prefix);
  const password = 'correct-horse';
  await agent.post('/auth/signup').type('form').send({ email, password, passwordConfirm: password });
  await agent
    .post('/accounts')
    .type('form')
    .send({ name: 'Checking', type: 'checking', currency: 'USD', openingBalance });
  const listRes = await agent.get('/accounts');
  const accountId = listRes.text.match(/accounts\/([0-9a-f-]{36})\/edit/)[1];
  return { agent, accountId };
}

describe('CSV import wizard — Format A (Date,Description,Amount / MM-DD-YYYY-style)', () => {
  it('walks upload -> mapping -> review -> confirm and creates real transactions', async () => {
    const { agent, accountId } = await signedInAgentWithAccount('import-a');
    const csv = 'Date,Description,Amount\n03/15/2026,Coffee Shop,-4.50\n03/16/2026,Paycheck,1500.00\n';

    const uploadRes = await agent
      .post('/import/upload')
      .field('accountId', accountId)
      .field('sourceName', 'Test Bank A')
      .attach('file', Buffer.from(csv), 'format-a.csv');
    expect(uploadRes.status).toBe(302);
    expect(uploadRes.headers.location).toBe('/import/mapping');

    const mappingPage = await agent.get('/import/mapping');
    expect(mappingPage.status).toBe(200);
    expect(mappingPage.text).toContain('Date');
    expect(mappingPage.text).toContain('Description');

    const mapRes = await agent.post('/import/mapping').type('form').send({
      dateColumn: 'Date',
      descriptionColumn: 'Description',
      dateFormat: 'MM/DD/YYYY',
      amountMode: 'single',
      amountColumn: 'Amount',
    });
    expect(mapRes.status).toBe(302);
    expect(mapRes.headers.location).toBe('/import/review');

    const reviewPage = await agent.get('/import/review');
    expect(reviewPage.status).toBe(200);
    expect(reviewPage.text).toContain('Coffee Shop');
    expect(reviewPage.text).toContain('Paycheck');
    expect(reviewPage.text).toContain('2 row(s) found');

    const confirmRes = await agent
      .post('/import/confirm')
      .type('form')
      .send({ selectedRows: ['0', '1'] });
    expect(confirmRes.status).toBe(302);
    expect(confirmRes.headers.location).toBe('/transactions');

    const txnList = await agent.get('/transactions');
    expect(txnList.text).toContain('Coffee Shop');
    expect(txnList.text).toContain('Paycheck');

    const { rows } = await pool.query('SELECT current_balance FROM accounts WHERE id = $1', [accountId]);
    expect(Number(rows[0].current_balance)).toBeCloseTo(1000 - 4.5 + 1500);
  });
});

describe('CSV import wizard — Format B (different column order, DD/MM/YYYY, debit/credit split)', () => {
  it('parses a differently-shaped export just as correctly', async () => {
    const { agent, accountId } = await signedInAgentWithAccount('import-b', '0');
    const csv =
      'Transaction Date,Payee,Debit,Credit\n15/03/2026,Coffee Shop,4.50,\n16/03/2026,Paycheck,,1500.00\n';

    await agent
      .post('/import/upload')
      .field('accountId', accountId)
      .field('sourceName', 'Test Bank B')
      .attach('file', Buffer.from(csv), 'format-b.csv');

    await agent.post('/import/mapping').type('form').send({
      dateColumn: 'Transaction Date',
      descriptionColumn: 'Payee',
      dateFormat: 'DD/MM/YYYY',
      amountMode: 'debit_credit',
      debitColumn: 'Debit',
      creditColumn: 'Credit',
    });

    const reviewPage = await agent.get('/import/review');
    expect(reviewPage.text).toContain('Coffee Shop');
    expect(reviewPage.text).toContain('-4.50');
    expect(reviewPage.text).toContain('1500.00');

    await agent.post('/import/confirm').type('form').send({ selectedRows: ['0', '1'] });

    const { rows } = await pool.query('SELECT current_balance FROM accounts WHERE id = $1', [accountId]);
    expect(Number(rows[0].current_balance)).toBeCloseTo(0 - 4.5 + 1500);
  });
});

describe('duplicate detection', () => {
  it('flags rows as duplicates on a second import of the same file, and skips them if selected anyway', async () => {
    const { agent, accountId } = await signedInAgentWithAccount('import-dup', '0');
    const csv = 'Date,Description,Amount\n03/15/2026,Coffee Shop,-4.50\n';
    const mapping = {
      dateColumn: 'Date',
      descriptionColumn: 'Description',
      dateFormat: 'MM/DD/YYYY',
      amountMode: 'single',
      amountColumn: 'Amount',
    };

    // First import: goes through cleanly.
    await agent.post('/import/upload').field('accountId', accountId).field('sourceName', 'Dup Bank').attach('file', Buffer.from(csv), 'dup.csv');
    await agent.post('/import/mapping').type('form').send(mapping);
    await agent.post('/import/confirm').type('form').send({ selectedRows: ['0'] });

    const { rows: afterFirst } = await pool.query(
      'SELECT count(*)::int AS count FROM transactions WHERE account_id = $1',
      [accountId]
    );
    expect(afterFirst[0].count).toBe(1);

    // Second import of the identical file: review page should flag it as a duplicate.
    await agent.post('/import/upload').field('accountId', accountId).field('sourceName', 'Dup Bank').attach('file', Buffer.from(csv), 'dup.csv');
    await agent.post('/import/mapping').type('form').send(mapping);
    const reviewPage = await agent.get('/import/review');
    expect(reviewPage.text).toContain('Possible duplicate');
    expect(reviewPage.text).toContain('1 look like duplicates');

    // Force-select it anyway (the checkbox is unchecked by default, but the
    // DB's unique (account_id, import_hash) index must still prevent a
    // second real row from being created).
    await agent.post('/import/confirm').type('form').send({ selectedRows: ['0'] });

    const { rows: afterSecond } = await pool.query(
      'SELECT count(*)::int AS count FROM transactions WHERE account_id = $1',
      [accountId]
    );
    expect(afterSecond[0].count).toBe(1); // still just one — no duplicate row created
  });

  it('bulkImport() is idempotent at the model layer even when called twice with identical rows', async () => {
    const user = await usersModel.createUser(uniqueEmail('import-bulk-idempotent'), 'correct-horse');
    const account = await accountsModel.create(user.id, {
      name: 'Checking',
      type: 'checking',
      currency: 'USD',
      openingBalance: 0,
    });
    const row = { date: '2026-01-01', amount: -10, payee: 'Test', importHash: 'fixed-hash-for-test' };

    const first = await transactionsModel.bulkImport(user.id, account.id, [row]);
    expect(first.insertedCount).toBe(1);

    const second = await transactionsModel.bulkImport(user.id, account.id, [row]);
    expect(second.insertedCount).toBe(0);
    expect(second.skippedCount).toBe(1);

    const refreshed = await accountsModel.getById(user.id, account.id);
    expect(Number(refreshed.current_balance)).toBe(-10); // only applied once
  });
});

describe('upload validation', () => {
  it('rejects a non-CSV file', async () => {
    const { agent, accountId } = await signedInAgentWithAccount('import-badfile');
    const res = await agent
      .post('/import/upload')
      .field('accountId', accountId)
      .attach('file', Buffer.from('not a csv'), 'notes.txt');
    expect(res.status).toBe(400);
    expect(res.text).toContain('.csv file');
  });

  it('requires an account to be selected', async () => {
    const { agent } = await signedInAgentWithAccount('import-noaccount');
    const res = await agent.post('/import/upload').attach('file', Buffer.from('Date,Description,Amount\n'), 'x.csv');
    expect(res.status).toBe(400);
    expect(res.text).toContain('Choose an account');
  });
});
