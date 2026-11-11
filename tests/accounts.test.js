const request = require('supertest');
const app = require('../server');
const { pool } = require('../config/db');
const accountsModel = require('../models/accounts');

afterAll(async () => {
  await pool.end();
});

function uniqueEmail(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

async function signedInAgent(prefix) {
  const agent = request.agent(app);
  const email = uniqueEmail(prefix);
  const password = 'correct-horse';
  await agent.post('/auth/signup').type('form').send({ email, password, passwordConfirm: password });
  return agent;
}

describe('accounts access control', () => {
  it('redirects anonymous visitors to login', async () => {
    const res = await request(app).get('/accounts');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/auth/login');
  });
});

describe('account creation', () => {
  it('creates an account with current_balance equal to the opening balance', async () => {
    const agent = await signedInAgent('acct-create');

    const res = await agent
      .post('/accounts')
      .type('form')
      .send({ name: 'Main Checking', type: 'checking', currency: 'USD', openingBalance: '250.50' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/accounts');

    const listRes = await agent.get('/accounts');
    expect(listRes.text).toContain('Main Checking');
    expect(listRes.text).toContain('250.5');
  });

  it('rejects an invalid account type', async () => {
    const agent = await signedInAgent('acct-invalid');
    const res = await agent
      .post('/accounts')
      .type('form')
      .send({ name: 'Weird', type: 'bitcoin_wallet', currency: 'USD', openingBalance: '0' });

    expect(res.status).toBe(400);
    expect(res.text).toContain('valid account type');
  });

  it('rejects a missing name', async () => {
    const agent = await signedInAgent('acct-noname');
    const res = await agent
      .post('/accounts')
      .type('form')
      .send({ name: '', type: 'checking', currency: 'USD', openingBalance: '0' });

    expect(res.status).toBe(400);
    expect(res.text).toContain('Name is required');
  });
});

describe('account editing shifts current_balance by the opening-balance delta', () => {
  it('preserves balance movement already recorded via adjustBalance when opening balance changes', async () => {
    // Use the model directly so we have an id and can simulate a
    // transaction-driven balance adjustment before editing.
    const usersModel = require('../models/users');
    const user = await usersModel.createUser(uniqueEmail('acct-edit-model'), 'correct-horse');

    const account = await accountsModel.create(user.id, {
      name: 'Savings',
      type: 'savings',
      currency: 'USD',
      openingBalance: 100,
    });
    expect(Number(account.current_balance)).toBe(100);

    // Simulate a $30 deposit recorded against this account (this is exactly
    // what Phase 3's transaction creation will call).
    await accountsModel.adjustBalance(account.id, 30);
    let refreshed = await accountsModel.getById(user.id, account.id);
    expect(Number(refreshed.current_balance)).toBe(130);

    // Now raise the opening balance by 50 via an edit — current_balance
    // should move by the same +50 delta, not be overwritten to 150.
    await accountsModel.update(user.id, account.id, {
      name: 'Savings',
      type: 'savings',
      currency: 'USD',
      openingBalance: 150,
    });
    refreshed = await accountsModel.getById(user.id, account.id);
    expect(Number(refreshed.opening_balance)).toBe(150);
    expect(Number(refreshed.current_balance)).toBe(180); // 130 + 50 delta
  });

  it('recalculate() re-derives current_balance from opening_balance + transaction sum', async () => {
    const usersModel = require('../models/users');
    const user = await usersModel.createUser(uniqueEmail('acct-recalc'), 'correct-horse');
    const account = await accountsModel.create(user.id, {
      name: 'Checking',
      type: 'checking',
      currency: 'USD',
      openingBalance: 100,
    });

    await pool.query(
      'INSERT INTO transactions (user_id, account_id, date, amount, payee) VALUES ($1, $2, $3, $4, $5)',
      [user.id, account.id, '2026-01-01', -20, 'Coffee']
    );
    await pool.query(
      'INSERT INTO transactions (user_id, account_id, date, amount, payee) VALUES ($1, $2, $3, $4, $5)',
      [user.id, account.id, '2026-01-02', 500, 'Paycheck']
    );

    // Deliberately corrupt current_balance to prove recalculate() fixes it.
    await pool.query('UPDATE accounts SET current_balance = -9999 WHERE id = $1', [account.id]);

    const recalculated = await accountsModel.recalculate(account.id);
    expect(Number(recalculated.current_balance)).toBe(580); // 100 - 20 + 500
  });
});

describe('account deletion', () => {
  it('hard-deletes an account with no transaction history', async () => {
    const agent = await signedInAgent('acct-delete-clean');
    await agent
      .post('/accounts')
      .type('form')
      .send({ name: 'To Delete', type: 'cash', currency: 'USD', openingBalance: '0' });

    const listBefore = await agent.get('/accounts');
    const idMatch = listBefore.text.match(/accounts\/([0-9a-f-]{36})\/edit/);
    expect(idMatch).toBeTruthy();
    const accountId = idMatch[1];

    const deleteRes = await agent.delete(`/accounts/${accountId}`);
    expect(deleteRes.status).toBe(302);

    const { rows } = await pool.query('SELECT * FROM accounts WHERE id = $1', [accountId]);
    expect(rows).toHaveLength(0);
  });

  it('archives instead of deleting an account that has transaction history', async () => {
    const usersModel = require('../models/users');
    const user = await usersModel.createUser(uniqueEmail('acct-delete-history'), 'correct-horse');
    const account = await accountsModel.create(user.id, {
      name: 'Has History',
      type: 'checking',
      currency: 'USD',
      openingBalance: 0,
    });
    await pool.query(
      'INSERT INTO transactions (user_id, account_id, date, amount, payee) VALUES ($1, $2, $3, $4, $5)',
      [user.id, account.id, '2026-01-01', -10, 'Snack']
    );

    const outcome = await accountsModel.remove(user.id, account.id);
    expect(outcome.archived).toBe(true);

    const { rows } = await pool.query('SELECT * FROM accounts WHERE id = $1', [account.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].is_active).toBe(false);
  });
});

describe('account ownership isolation', () => {
  it('does not let one user edit or delete another user\'s account', async () => {
    const usersModel = require('../models/users');
    const owner = await usersModel.createUser(uniqueEmail('acct-owner'), 'correct-horse');
    const account = await accountsModel.create(owner.id, {
      name: 'Owner Account',
      type: 'checking',
      currency: 'USD',
      openingBalance: 42,
    });

    const intruder = await signedInAgent('acct-intruder');

    const editPageRes = await intruder.get(`/accounts/${account.id}/edit`);
    expect(editPageRes.status).toBe(302);
    expect(editPageRes.headers.location).toBe('/accounts');

    const putRes = await intruder
      .put(`/accounts/${account.id}`)
      .type('form')
      .send({ name: 'Hijacked', type: 'checking', currency: 'USD', openingBalance: '0' });
    expect(putRes.status).toBe(302);

    const stillOwned = await accountsModel.getById(owner.id, account.id);
    expect(stillOwned.name).toBe('Owner Account');
    expect(Number(stillOwned.opening_balance)).toBe(42);

    const deleteRes = await intruder.delete(`/accounts/${account.id}`);
    expect(deleteRes.status).toBe(302);
    const stillThere = await accountsModel.getById(owner.id, account.id);
    expect(stillThere).not.toBeNull();
  });
});
