const request = require('supertest');
const app = require('../server');
const { pool } = require('../config/db');
const reportsModel = require('../models/reports');
const accountsModel = require('../models/accounts');
const categoriesModel = require('../models/categories');
const transactionsModel = require('../models/transactions');
const usersModel = require('../models/users');

afterAll(async () => {
  await pool.end();
});

function uniqueEmail(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

// ------------------------------------------------------------------
// Model-level tests — verify data accuracy of report queries
// ------------------------------------------------------------------

describe('incomeExpenseForRange', () => {
  it('counts income and expense correctly, excluding transfers', async () => {
    const user = await usersModel.createUser(uniqueEmail('rpt-ie'), 'correct-horse');
    const checking = await accountsModel.create(user.id, { name: 'Checking', type: 'checking', currency: 'USD', openingBalance: 5000 });
    const savings = await accountsModel.create(user.id, { name: 'Savings', type: 'savings', currency: 'USD', openingBalance: 0 });
    const cat = await categoriesModel.create(user.id, { name: 'Food', kind: 'expense' });
    const incCat = await categoriesModel.create(user.id, { name: 'Salary', kind: 'income' });

    // An expense
    await transactionsModel.create(user.id, {
      accountId: checking.id, date: '2026-03-10', amount: -100,
      splits: [{ categoryId: cat.id, amount: -100 }],
    });
    // Income
    await transactionsModel.create(user.id, {
      accountId: checking.id, date: '2026-03-15', amount: 3000,
      splits: [{ categoryId: incCat.id, amount: 3000 }],
    });
    // Transfer — must NOT appear in income or expense
    await transactionsModel.createTransfer(user.id, {
      fromAccountId: checking.id, toAccountId: savings.id, date: '2026-03-20', amount: 500,
    });

    const result = await reportsModel.incomeExpenseForRange(user.id, '2026-03-01', '2026-03-31');
    expect(result.income).toBeCloseTo(3000);
    expect(result.expenses).toBeCloseTo(100);
  });

  it('scopes to the given date range', async () => {
    const user = await usersModel.createUser(uniqueEmail('rpt-ie-scope'), 'correct-horse');
    const account = await accountsModel.create(user.id, { name: 'Checking', type: 'checking', currency: 'USD', openingBalance: 5000 });
    const cat = await categoriesModel.create(user.id, { name: 'Rent', kind: 'expense' });

    await transactionsModel.create(user.id, {
      accountId: account.id, date: '2026-01-15', amount: -1200,
      splits: [{ categoryId: cat.id, amount: -1200 }],
    });
    await transactionsModel.create(user.id, {
      accountId: account.id, date: '2026-02-15', amount: -1200,
      splits: [{ categoryId: cat.id, amount: -1200 }],
    });

    const janResult = await reportsModel.incomeExpenseForRange(user.id, '2026-01-01', '2026-01-31');
    expect(janResult.expenses).toBeCloseTo(1200);

    const fullResult = await reportsModel.incomeExpenseForRange(user.id, '2026-01-01', '2026-02-28');
    expect(fullResult.expenses).toBeCloseTo(2400);
  });
});

describe('spendingByCategory', () => {
  it('groups spending correctly', async () => {
    const user = await usersModel.createUser(uniqueEmail('rpt-cat'), 'correct-horse');
    const account = await accountsModel.create(user.id, { name: 'Checking', type: 'checking', currency: 'USD', openingBalance: 5000 });
    const food = await categoriesModel.create(user.id, { name: 'Food', kind: 'expense' });
    const rent = await categoriesModel.create(user.id, { name: 'Rent', kind: 'expense' });

    await transactionsModel.create(user.id, {
      accountId: account.id, date: '2026-03-10', amount: -50,
      splits: [{ categoryId: food.id, amount: -50 }],
    });
    await transactionsModel.create(user.id, {
      accountId: account.id, date: '2026-03-11', amount: -30,
      splits: [{ categoryId: food.id, amount: -30 }],
    });
    await transactionsModel.create(user.id, {
      accountId: account.id, date: '2026-03-01', amount: -1200,
      splits: [{ categoryId: rent.id, amount: -1200 }],
    });

    const result = await reportsModel.spendingByCategory(user.id, '2026-03-01', '2026-03-31');
    expect(result.length).toBe(2);

    // Sorted by total desc — rent ($1200) first, then food ($80)
    expect(result[0].category_name).toBe('Rent');
    expect(result[0].total).toBeCloseTo(1200);
    expect(result[1].category_name).toBe('Food');
    expect(result[1].total).toBeCloseTo(80);
  });
});

describe('monthlyTrends', () => {
  it('returns per-month income and expense sums', async () => {
    const user = await usersModel.createUser(uniqueEmail('rpt-trend'), 'correct-horse');
    const account = await accountsModel.create(user.id, { name: 'Checking', type: 'checking', currency: 'USD', openingBalance: 10000 });
    const cat = await categoriesModel.create(user.id, { name: 'Utils', kind: 'expense' });
    const incCat = await categoriesModel.create(user.id, { name: 'Freelance', kind: 'income' });

    await transactionsModel.create(user.id, {
      accountId: account.id, date: '2026-01-10', amount: -200,
      splits: [{ categoryId: cat.id, amount: -200 }],
    });
    await transactionsModel.create(user.id, {
      accountId: account.id, date: '2026-01-15', amount: 1000,
      splits: [{ categoryId: incCat.id, amount: 1000 }],
    });
    await transactionsModel.create(user.id, {
      accountId: account.id, date: '2026-02-10', amount: -300,
      splits: [{ categoryId: cat.id, amount: -300 }],
    });

    const trends = await reportsModel.monthlyTrends(user.id, '2026-01-01', '2026-02-28');
    expect(trends.length).toBe(2);
    expect(trends[0].month).toBe('2026-01');
    expect(trends[0].income).toBeCloseTo(1000);
    expect(trends[0].expenses).toBeCloseTo(200);
    expect(trends[1].month).toBe('2026-02');
    expect(trends[1].expenses).toBeCloseTo(300);
  });
});

describe('netWorthHistory', () => {
  it('reconstructs running net worth by month from opening balances + transactions', async () => {
    const user = await usersModel.createUser(uniqueEmail('rpt-nw'), 'correct-horse');
    const account = await accountsModel.create(user.id, { name: 'Checking', type: 'checking', currency: 'USD', openingBalance: 1000 });
    const cat = await categoriesModel.create(user.id, { name: 'Bills', kind: 'expense' });

    await transactionsModel.create(user.id, {
      accountId: account.id, date: '2026-01-15', amount: -200,
      splits: [{ categoryId: cat.id, amount: -200 }],
    });
    await transactionsModel.create(user.id, {
      accountId: account.id, date: '2026-02-15', amount: -300,
      splits: [{ categoryId: cat.id, amount: -300 }],
    });

    const history = await reportsModel.netWorthHistory(user.id);
    expect(history.length).toBe(2);
    // After Jan: 1000 - 200 = 800
    expect(history[0].month).toBe('2026-01');
    expect(history[0].net_worth).toBeCloseTo(800);
    // After Feb: 800 - 300 = 500
    expect(history[1].month).toBe('2026-02');
    expect(history[1].net_worth).toBeCloseTo(500);
  });
});

describe('currentNetWorth', () => {
  it('sums active account balances', async () => {
    const user = await usersModel.createUser(uniqueEmail('rpt-cnw'), 'correct-horse');
    await accountsModel.create(user.id, { name: 'Checking', type: 'checking', currency: 'USD', openingBalance: 5000 });
    await accountsModel.create(user.id, { name: 'Savings', type: 'savings', currency: 'USD', openingBalance: 10000 });

    const nw = await reportsModel.currentNetWorth(user.id);
    expect(nw).toBeCloseTo(15000);
  });
});

describe('transactionsForExport', () => {
  it('returns all transactions in the date range with categories', async () => {
    const user = await usersModel.createUser(uniqueEmail('rpt-export'), 'correct-horse');
    const account = await accountsModel.create(user.id, { name: 'Checking', type: 'checking', currency: 'USD', openingBalance: 5000 });
    const cat = await categoriesModel.create(user.id, { name: 'Food', kind: 'expense' });

    await transactionsModel.create(user.id, {
      accountId: account.id, date: '2026-03-10', amount: -50, payee: 'Grocery Store',
      splits: [{ categoryId: cat.id, amount: -50 }],
    });

    const rows = await reportsModel.transactionsForExport(user.id, {
      startDate: '2026-03-01', endDate: '2026-03-31',
    });
    expect(rows.length).toBe(1);
    expect(rows[0].payee).toBe('Grocery Store');
    expect(rows[0].categories).toContain('Food');
  });
});

// ------------------------------------------------------------------
// HTTP-level route tests
// ------------------------------------------------------------------

describe('reports routes', () => {
  it('GET /dashboard returns 200 with account balances for an authenticated user', async () => {
    const agent = request.agent(app);
    const email = uniqueEmail('rpt-dash');
    await agent.post('/auth/signup').type('form').send({ email, password: 'correct-horse', passwordConfirm: 'correct-horse' });

    // Create an account so the dashboard has data to render
    await agent.post('/accounts').type('form').send({ name: 'Test Checking', type: 'checking', currency: 'USD', openingBalance: '1234.56' });

    const res = await agent.get('/dashboard');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Dashboard');
    expect(res.text).toContain('Test Checking');
    expect(res.text).toContain('1,234.56');
    expect(res.text).toContain('Net Worth');
  });

  it('GET /reports returns 200 and shows income/expense data', async () => {
    const agent = request.agent(app);
    const email = uniqueEmail('rpt-reports');
    await agent.post('/auth/signup').type('form').send({ email, password: 'correct-horse', passwordConfirm: 'correct-horse' });

    const res = await agent.get('/reports');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Reports');
    expect(res.text).toContain('Income');
    expect(res.text).toContain('Expenses');
  });

  it('GET /reports with custom date range filters correctly', async () => {
    const agent = request.agent(app);
    const email = uniqueEmail('rpt-range');
    await agent.post('/auth/signup').type('form').send({ email, password: 'correct-horse', passwordConfirm: 'correct-horse' });

    const res = await agent.get('/reports?startDate=2026-01-01&endDate=2026-01-31');
    expect(res.status).toBe(200);
    expect(res.text).toContain('2026-01-01');
    expect(res.text).toContain('2026-01-31');
  });

  it('GET /reports/export returns a CSV file', async () => {
    const agent = request.agent(app);
    const email = uniqueEmail('rpt-csv');
    await agent.post('/auth/signup').type('form').send({ email, password: 'correct-horse', passwordConfirm: 'correct-horse' });

    // Create a transaction to export
    await agent.post('/accounts').type('form').send({ name: 'Export Acc', type: 'checking', currency: 'USD', openingBalance: '1000' });
    const categoriesRes = await agent.post('/categories').type('form').send({ name: 'ExportCat', kind: 'expense', redirectTo: '/categories' });

    const res = await agent.get('/reports/export?startDate=2025-01-01&endDate=2027-12-31');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.text).toContain('Date,Amount,Payee,Note,Account,Categories,Is Transfer');
  });

  it('anonymous users are redirected from dashboard and reports', async () => {
    const dashRes = await request(app).get('/dashboard');
    expect(dashRes.status).toBe(302);
    expect(dashRes.headers.location).toContain('/auth/login');

    const reportsRes = await request(app).get('/reports');
    expect(reportsRes.status).toBe(302);
    expect(reportsRes.headers.location).toContain('/auth/login');
  });
});
