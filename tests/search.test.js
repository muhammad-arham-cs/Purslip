const request = require('supertest');
const app = require('../server');
const { pool } = require('../config/db');
const transactionsModel = require('../models/transactions');
const accountsModel = require('../models/accounts');
const categoriesModel = require('../models/categories');
const usersModel = require('../models/users');

afterAll(async () => {
  await pool.end();
});

function uniqueEmail(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

describe('search/filter', () => {
  let user, account, food, rent;

  beforeAll(async () => {
    user = await usersModel.createUser(uniqueEmail('search'), 'correct-horse');
    account = await accountsModel.create(user.id, {
      name: 'Checking', type: 'checking', currency: 'USD', openingBalance: 10000,
    });
    food = await categoriesModel.create(user.id, { name: 'Food', kind: 'expense' });
    rent = await categoriesModel.create(user.id, { name: 'Rent', kind: 'expense' });

    // Seed transactions for filtering
    await transactionsModel.create(user.id, {
      accountId: account.id, date: '2026-01-10', amount: -50, payee: 'Grocery Store',
      splits: [{ categoryId: food.id, amount: -50 }],
    });
    await transactionsModel.create(user.id, {
      accountId: account.id, date: '2026-01-20', amount: -30, payee: 'Restaurant',
      note: 'Dinner with friends',
      splits: [{ categoryId: food.id, amount: -30 }],
    });
    await transactionsModel.create(user.id, {
      accountId: account.id, date: '2026-02-01', amount: -1200, payee: 'Landlord',
      splits: [{ categoryId: rent.id, amount: -1200 }],
    });
    await transactionsModel.create(user.id, {
      accountId: account.id, date: '2026-02-15', amount: 5000, payee: 'Employer',
      note: 'Salary',
      splits: [{ categoryId: null, amount: 5000 }],
    });
  });

  it('filters by date range', async () => {
    const result = await transactionsModel.list(user.id, {
      startDate: '2026-01-01', endDate: '2026-01-31',
    });
    expect(result.total).toBe(2);
  });

  it('filters by category', async () => {
    const result = await transactionsModel.list(user.id, {
      categoryId: food.id,
    });
    expect(result.total).toBe(2); // Grocery Store + Restaurant
  });

  it('filters by amount range', async () => {
    const result = await transactionsModel.list(user.id, {
      minAmount: 100, maxAmount: 2000,
    });
    // Only the $1200 rent matches $100 <= abs(amount) <= $2000
    expect(result.total).toBe(1);
    expect(result.transactions[0].payee).toBe('Landlord');
  });

  it('searches free text across payee and note', async () => {
    const result = await transactionsModel.list(user.id, { search: 'friends' });
    expect(result.total).toBe(1);
    expect(result.transactions[0].payee).toBe('Restaurant');
  });

  it('searches by payee name', async () => {
    const result = await transactionsModel.list(user.id, { search: 'grocery' });
    expect(result.total).toBe(1);
    expect(result.transactions[0].payee).toBe('Grocery Store');
  });

  it('combines multiple filters', async () => {
    const result = await transactionsModel.list(user.id, {
      categoryId: food.id,
      startDate: '2026-01-15',
      endDate: '2026-01-31',
    });
    // Only Restaurant on Jan 20 matches food + date range
    expect(result.total).toBe(1);
    expect(result.transactions[0].payee).toBe('Restaurant');
  });

  it('returns empty when no matches', async () => {
    const result = await transactionsModel.list(user.id, { search: 'nonexistent' });
    expect(result.total).toBe(0);
    expect(result.transactions).toHaveLength(0);
  });
});

describe('search/filter routes', () => {
  it('GET /transactions with search returns filtered results', async () => {
    const agent = request.agent(app);
    const email = uniqueEmail('search-route');
    await agent.post('/auth/signup').type('form').send({ email, password: 'correct-horse', passwordConfirm: 'correct-horse' });

    // Create account and transaction
    await agent.post('/accounts').type('form').send({ name: 'Test Account', type: 'checking', currency: 'USD', openingBalance: '1000' });
    const accountsRes = await agent.get('/accounts');
    const accountId = accountsRes.text.match(/accounts\/([0-9a-f-]{36})\/edit/)[1];

    await agent.post('/categories').type('form').send({ name: 'TestCat', kind: 'expense', redirectTo: '/categories' });
    const categoriesRes = await agent.get('/categories');
    const categoryId = categoriesRes.text.match(/categories\/([0-9a-f-]{36})\/edit/)[1];

    // Create a transaction with a distinct payee
    await agent.post('/transactions').type('form').send({
      accountId,
      date: '2026-06-15',
      amount: '42.50',
      type: 'expense',
      payee: 'Unique Pizza Place',
      splits: [{ categoryId, amount: '42.50' }],
    });

    // Search should find it
    const searchRes = await agent.get('/transactions?search=pizza');
    expect(searchRes.status).toBe(200);
    expect(searchRes.text).toContain('Unique Pizza Place');
    expect(searchRes.text).toContain('1 transaction');

    // Filter by category should also find it
    const catRes = await agent.get(`/transactions?category=${categoryId}`);
    expect(catRes.status).toBe(200);
    expect(catRes.text).toContain('Unique Pizza Place');
  });

  it('GET /transactions/export returns CSV', async () => {
    const agent = request.agent(app);
    const email = uniqueEmail('export-route');
    await agent.post('/auth/signup').type('form').send({ email, password: 'correct-horse', passwordConfirm: 'correct-horse' });

    const res = await agent.get('/transactions/export');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('Date,Amount,Payee,Note,Account,Categories,Is Transfer');
  });
});
