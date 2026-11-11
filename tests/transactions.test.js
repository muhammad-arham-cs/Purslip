const request = require('supertest');
const app = require('../server');
const { pool } = require('../config/db');
const accountsModel = require('../models/accounts');
const categoriesModel = require('../models/categories');
const transactionsModel = require('../models/transactions');
const usersModel = require('../models/users');
const reportsModel = require('../models/reports');

afterAll(async () => {
  await pool.end();
});

function uniqueEmail(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

async function makeUserWithAccount(prefix, openingBalance = 1000) {
  const user = await usersModel.createUser(uniqueEmail(prefix), 'correct-horse');
  const account = await accountsModel.create(user.id, {
    name: `${prefix} account`,
    type: 'checking',
    currency: 'USD',
    openingBalance,
  });
  return { user, account };
}

describe('transaction creation (model)', () => {
  it('records a neither transaction as an account movement excluded from totals', async () => {
    const { user, account } = await makeUserWithAccount('txn-neither');

    await transactionsModel.create(user.id, {
      accountId: account.id,
      date: '2026-11-05',
      amount: -200,
      transactionType: 'neither',
      splits: [{ categoryId: null, amount: -200 }],
      payee: 'Aunt bill',
    });

    expect(Number((await accountsModel.getById(user.id, account.id)).current_balance)).toBe(800);
    await expect(reportsModel.incomeExpenseForRange(user.id, '2026-11-01', '2026-11-30'))
      .resolves.toEqual({ income: 0, expenses: 0 });
  });

  it('rejects splits that do not sum to the transaction amount', async () => {
    const { user, account } = await makeUserWithAccount('txn-badsplit');
    const category = await categoriesModel.create(user.id, { name: 'Groceries', kind: 'expense' });

    await expect(
      transactionsModel.create(user.id, {
        accountId: account.id,
        date: '2026-02-01',
        amount: -50,
        payee: 'Store',
        splits: [{ categoryId: category.id, amount: -30 }], // should be -50
      })
    ).rejects.toThrow(transactionsModel.ValidationError);
  });

  it('accepts splits across multiple categories that sum exactly to the total', async () => {
    const { user, account } = await makeUserWithAccount('txn-split');
    const groceries = await categoriesModel.create(user.id, { name: 'Groceries', kind: 'expense' });
    const household = await categoriesModel.create(user.id, { name: 'Household', kind: 'expense' });

    const txn = await transactionsModel.create(user.id, {
      accountId: account.id,
      date: '2026-02-01',
      amount: -75,
      payee: 'Superstore',
      splits: [
        { categoryId: groceries.id, amount: -50 },
        { categoryId: household.id, amount: -25 },
      ],
    });

    const loaded = await transactionsModel.getById(user.id, txn.id);
    expect(loaded.splits).toHaveLength(2);

    const refreshedAccount = await accountsModel.getById(user.id, account.id);
    expect(Number(refreshedAccount.current_balance)).toBe(1000 - 75);
  });

  it('rejects rounding-mismatched splits (fractions of a cent do not sneak through)', async () => {
    const { user, account } = await makeUserWithAccount('txn-rounding');
    const category = await categoriesModel.create(user.id, { name: 'Misc', kind: 'expense' });

    await expect(
      transactionsModel.create(user.id, {
        accountId: account.id,
        date: '2026-02-01',
        amount: -10,
        splits: [
          { categoryId: category.id, amount: -3.33 },
          { categoryId: category.id, amount: -3.33 },
          { categoryId: category.id, amount: -3.33 },
        ], // sums to -9.99, not -10
      })
    ).rejects.toThrow(transactionsModel.ValidationError);
  });
});

describe('balance accuracy across create/edit/delete', () => {
  it('applies, then correctly reverses and reapplies balance on edit', async () => {
    const { user, account } = await makeUserWithAccount('txn-balance', 500);
    const category = await categoriesModel.create(user.id, { name: 'Fun', kind: 'expense' });

    const txn = await transactionsModel.create(user.id, {
      accountId: account.id,
      date: '2026-03-01',
      amount: -100,
      splits: [{ categoryId: category.id, amount: -100 }],
    });
    expect(Number((await accountsModel.getById(user.id, account.id)).current_balance)).toBe(400);

    await transactionsModel.update(user.id, txn.id, {
      accountId: account.id,
      date: '2026-03-01',
      amount: -40,
      splits: [{ categoryId: category.id, amount: -40 }],
    });
    expect(Number((await accountsModel.getById(user.id, account.id)).current_balance)).toBe(460);

    await transactionsModel.remove(user.id, txn.id);
    expect(Number((await accountsModel.getById(user.id, account.id)).current_balance)).toBe(500);
  });

  it('moves balance impact between accounts when the account is changed on edit', async () => {
    const { user, account: accountA } = await makeUserWithAccount('txn-move-a', 200);
    const accountB = await accountsModel.create(user.id, {
      name: 'txn-move-b account',
      type: 'savings',
      currency: 'USD',
      openingBalance: 200,
    });
    const category = await categoriesModel.create(user.id, { name: 'Transfer-ish', kind: 'expense' });

    const txn = await transactionsModel.create(user.id, {
      accountId: accountA.id,
      date: '2026-03-01',
      amount: -50,
      splits: [{ categoryId: category.id, amount: -50 }],
    });
    expect(Number((await accountsModel.getById(user.id, accountA.id)).current_balance)).toBe(150);

    await transactionsModel.update(user.id, txn.id, {
      accountId: accountB.id,
      date: '2026-03-01',
      amount: -50,
      splits: [{ categoryId: category.id, amount: -50 }],
    });

    expect(Number((await accountsModel.getById(user.id, accountA.id)).current_balance)).toBe(200); // reversed
    expect(Number((await accountsModel.getById(user.id, accountB.id)).current_balance)).toBe(150); // applied
  });
});

describe('transfers', () => {
  it('creates two linked transactions and moves balance between accounts without affecting either as income/expense', async () => {
    const { user, account: checking } = await makeUserWithAccount('xfer-checking', 1000);
    const savings = await accountsModel.create(user.id, {
      name: 'xfer savings',
      type: 'savings',
      currency: 'USD',
      openingBalance: 0,
    });

    const { transferGroupId } = await transactionsModel.createTransfer(user.id, {
      fromAccountId: checking.id,
      toAccountId: savings.id,
      date: '2026-04-01',
      amount: 200,
      note: 'Move to savings',
    });

    expect(Number((await accountsModel.getById(user.id, checking.id)).current_balance)).toBe(800);
    expect(Number((await accountsModel.getById(user.id, savings.id)).current_balance)).toBe(200);

    const { rows } = await pool.query(
      'SELECT * FROM transactions WHERE transfer_group_id = $1 ORDER BY amount',
      [transferGroupId]
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.is_transfer)).toBe(true);
    expect(Number(rows[0].amount)).toBe(-200);
    expect(Number(rows[1].amount)).toBe(200);
  });

  it('excludes transfers from a naive income/expense sum (the invariant reports will rely on)', async () => {
    const { user, account: checking } = await makeUserWithAccount('xfer-report', 1000);
    const savings = await accountsModel.create(user.id, {
      name: 'xfer-report savings',
      type: 'savings',
      currency: 'USD',
      openingBalance: 0,
    });
    const category = await categoriesModel.create(user.id, { name: 'Salary', kind: 'income' });

    await transactionsModel.create(user.id, {
      accountId: checking.id,
      date: '2026-04-01',
      amount: 2000,
      splits: [{ categoryId: category.id, amount: 2000 }],
    });
    await transactionsModel.createTransfer(user.id, {
      fromAccountId: checking.id,
      toAccountId: savings.id,
      date: '2026-04-02',
      amount: 500,
    });

    const { rows } = await pool.query(
      'SELECT COALESCE(sum(amount), 0)::float AS total FROM transactions WHERE user_id = $1 AND is_transfer = false',
      [user.id]
    );
    expect(Number(rows[0].total)).toBe(2000); // the $500 transfer must not appear here
  });

  it('updating a transfer reverses the old legs and applies the new amount/accounts', async () => {
    const { user, account: checking } = await makeUserWithAccount('xfer-update', 1000);
    const savings = await accountsModel.create(user.id, {
      name: 'xfer-update savings',
      type: 'savings',
      currency: 'USD',
      openingBalance: 0,
    });

    const { transferGroupId } = await transactionsModel.createTransfer(user.id, {
      fromAccountId: checking.id,
      toAccountId: savings.id,
      date: '2026-04-01',
      amount: 100,
    });

    await transactionsModel.updateTransfer(user.id, transferGroupId, {
      fromAccountId: checking.id,
      toAccountId: savings.id,
      date: '2026-04-01',
      amount: 300,
    });

    expect(Number((await accountsModel.getById(user.id, checking.id)).current_balance)).toBe(700);
    expect(Number((await accountsModel.getById(user.id, savings.id)).current_balance)).toBe(300);
  });

  it('deleting a transfer reverses both legs', async () => {
    const { user, account: checking } = await makeUserWithAccount('xfer-delete', 1000);
    const savings = await accountsModel.create(user.id, {
      name: 'xfer-delete savings',
      type: 'savings',
      currency: 'USD',
      openingBalance: 0,
    });

    const { transferGroupId } = await transactionsModel.createTransfer(user.id, {
      fromAccountId: checking.id,
      toAccountId: savings.id,
      date: '2026-04-01',
      amount: 150,
    });

    const legId = await transactionsModel.findLegIdByTransferGroup(user.id, transferGroupId);
    await transactionsModel.remove(user.id, legId);

    expect(Number((await accountsModel.getById(user.id, checking.id)).current_balance)).toBe(1000);
    expect(Number((await accountsModel.getById(user.id, savings.id)).current_balance)).toBe(0);

    const { rows } = await pool.query('SELECT * FROM transactions WHERE transfer_group_id = $1', [
      transferGroupId,
    ]);
    expect(rows).toHaveLength(0);
  });
});

describe('pagination', () => {
  it('paginates transaction lists', async () => {
    const { user, account } = await makeUserWithAccount('txn-page', 10000);
    const category = await categoriesModel.create(user.id, { name: 'Paged', kind: 'expense' });

    for (let i = 0; i < 30; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await transactionsModel.create(user.id, {
        accountId: account.id,
        date: '2026-05-01',
        amount: -1,
        splits: [{ categoryId: category.id, amount: -1 }],
      });
    }

    const page1 = await transactionsModel.list(user.id, { page: 1, pageSize: 25 });
    expect(page1.transactions).toHaveLength(25);
    expect(page1.total).toBe(30);
    expect(page1.totalPages).toBe(2);

    const page2 = await transactionsModel.list(user.id, { page: 2, pageSize: 25 });
    expect(page2.transactions).toHaveLength(5);
  });
});

describe('transaction routes end-to-end', () => {
  async function signedInAgentWithAccount(prefix) {
    const agent = request.agent(app);
    const email = uniqueEmail(prefix);
    const password = 'correct-horse';
    await agent.post('/auth/signup').type('form').send({ email, password, passwordConfirm: password });
    await agent
      .post('/accounts')
      .type('form')
      .send({ name: 'Checking', type: 'checking', currency: 'USD', openingBalance: '500' });
    const listRes = await agent.get('/accounts');
    const accountId = listRes.text.match(/accounts\/([0-9a-f-]{36})\/edit/)[1];
    return { agent, accountId };
  }

  it('creates a simple (non-split) transaction via the HTTP form', async () => {
    const { agent, accountId } = await signedInAgentWithAccount('txn-route');

    const res = await agent
      .post('/transactions')
      .type('form')
      .send({
        accountId,
        date: '2026-06-01',
        type: 'expense',
        amount: '25.00',
        payee: 'Cafe',
        'splits[0][categoryId]': '',
        'splits[0][amount]': '25.00',
      });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/transactions');

    const listRes = await agent.get('/transactions');
    expect(listRes.text).toContain('Cafe');
  });

  it('rejects a transaction whose splits do not sum to the total via HTTP', async () => {
    const { agent, accountId } = await signedInAgentWithAccount('txn-route-bad');

    const res = await agent
      .post('/transactions')
      .type('form')
      .send({
        accountId,
        date: '2026-06-01',
        type: 'expense',
        amount: '100.00',
        payee: 'Store',
        'splits[0][categoryId]': '',
        'splits[0][amount]': '40.00',
      });

    expect(res.status).toBe(400);
    expect(res.text).toContain('must sum to the transaction total');
  });

  it('records a transfer via HTTP and it does not show a payee/category like a normal expense', async () => {
    const agent = request.agent(app);
    const email = uniqueEmail('txn-route-xfer');
    await agent.post('/auth/signup').type('form').send({ email, password: 'correct-horse', passwordConfirm: 'correct-horse' });
    await agent.post('/accounts').type('form').send({ name: 'From', type: 'checking', currency: 'USD', openingBalance: '300' });
    await agent.post('/accounts').type('form').send({ name: 'To', type: 'savings', currency: 'USD', openingBalance: '0' });
    const listRes = await agent.get('/accounts');
    const ids = [...listRes.text.matchAll(/accounts\/([0-9a-f-]{36})\/edit/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThanOrEqual(2);

    const res = await agent
      .post('/transactions/transfer')
      .type('form')
      .send({ fromAccountId: ids[0], toAccountId: ids[1], date: '2026-06-05', amount: '75' });

    expect(res.status).toBe(302);

    const txnListRes = await agent.get('/transactions');
    expect(txnListRes.text).toContain('Transfer');
  });
});
