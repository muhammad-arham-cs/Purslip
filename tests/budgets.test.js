const request = require('supertest');
const app = require('../server');
const { pool } = require('../config/db');
const budgetsModel = require('../models/budgets');
const categoriesModel = require('../models/categories');
const accountsModel = require('../models/accounts');
const transactionsModel = require('../models/transactions');
const usersModel = require('../models/users');

afterAll(async () => {
  await pool.end();
});

function uniqueEmail(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

async function spend(userId, accountId, categoryId, date, amount) {
  return transactionsModel.create(userId, {
    accountId,
    date,
    amount,
    splits: [{ categoryId, amount }],
  });
}

describe('spentForCategoryMonth', () => {
  it('only counts transactions within the given month', async () => {
    const user = await usersModel.createUser(uniqueEmail('budget-scope'), 'correct-horse');
    const account = await accountsModel.create(user.id, { name: 'Checking', type: 'checking', currency: 'USD', openingBalance: 1000 });
    const category = await categoriesModel.create(user.id, { name: 'Groceries', kind: 'expense' });

    await spend(user.id, account.id, category.id, '2026-01-15', -50);
    await spend(user.id, account.id, category.id, '2026-01-31', -25);
    await spend(user.id, account.id, category.id, '2026-02-01', -999); // must not count toward January

    const spentJan = await budgetsModel.spentForCategoryMonth(user.id, category.id, '2026-01-01');
    expect(spentJan).toBeCloseTo(75);
  });

  it('excludes transfers from spend totals', async () => {
    const user = await usersModel.createUser(uniqueEmail('budget-xfer'), 'correct-horse');
    const checking = await accountsModel.create(user.id, { name: 'Checking', type: 'checking', currency: 'USD', openingBalance: 1000 });
    const savings = await accountsModel.create(user.id, { name: 'Savings', type: 'savings', currency: 'USD', openingBalance: 0 });
    const category = await categoriesModel.create(user.id, { name: 'Misc', kind: 'expense' });

    await spend(user.id, checking.id, category.id, '2026-01-10', -40);
    await transactionsModel.createTransfer(user.id, {
      fromAccountId: checking.id,
      toAccountId: savings.id,
      date: '2026-01-11',
      amount: 300,
    });

    const spentJan = await budgetsModel.spentForCategoryMonth(user.id, category.id, '2026-01-01');
    expect(spentJan).toBeCloseTo(40); // the $300 transfer must not appear here
  });
});

describe('rollover off — each month stands alone', () => {
  it('ignores unused budget from the previous month', async () => {
    const user = await usersModel.createUser(uniqueEmail('budget-noroll'), 'correct-horse');
    const account = await accountsModel.create(user.id, { name: 'Checking', type: 'checking', currency: 'USD', openingBalance: 1000 });
    const category = await categoriesModel.create(user.id, { name: 'Dining', kind: 'expense', rollover: false });

    await budgetsModel.upsertBudget(user.id, category.id, '2026-01', 500);
    await spend(user.id, account.id, category.id, '2026-01-15', -300); // $200 unused in Jan

    await budgetsModel.upsertBudget(user.id, category.id, '2026-02', 400);

    const febAvailable = await budgetsModel.availableForMonth(user.id, category.id, '2026-02-01', false);
    expect(febAvailable).toBe(400); // just Feb's own budget, no carry from Jan's unused $200
  });

  it('a month with no budget set has zero available, regardless of prior months', async () => {
    const user = await usersModel.createUser(uniqueEmail('budget-nobudget'), 'correct-horse');
    const category = await categoriesModel.create(user.id, { name: 'Travel', kind: 'expense', rollover: false });
    await budgetsModel.upsertBudget(user.id, category.id, '2026-01', 500);

    const febAvailable = await budgetsModel.availableForMonth(user.id, category.id, '2026-02-01', false);
    expect(febAvailable).toBe(0);
  });
});

describe('rollover on — unused budget carries forward, overspend carries as a deficit', () => {
  it('carries a single month of underspending forward across the month boundary', async () => {
    const user = await usersModel.createUser(uniqueEmail('budget-roll1'), 'correct-horse');
    const account = await accountsModel.create(user.id, { name: 'Checking', type: 'checking', currency: 'USD', openingBalance: 1000 });
    const category = await categoriesModel.create(user.id, { name: 'Entertainment', kind: 'expense', rollover: true });

    await budgetsModel.upsertBudget(user.id, category.id, '2026-01', 500);
    await spend(user.id, account.id, category.id, '2026-01-15', -300); // $200 left over

    await budgetsModel.upsertBudget(user.id, category.id, '2026-02', 400);

    const febAvailable = await budgetsModel.availableForMonth(user.id, category.id, '2026-02-01', true);
    expect(febAvailable).toBe(600); // 400 budget + 200 carried from January
  });

  it('compounds across multiple consecutive months of underspending', async () => {
    const user = await usersModel.createUser(uniqueEmail('budget-roll-multi'), 'correct-horse');
    const account = await accountsModel.create(user.id, { name: 'Checking', type: 'checking', currency: 'USD', openingBalance: 5000 });
    const category = await categoriesModel.create(user.id, { name: 'Hobbies', kind: 'expense', rollover: true });

    await budgetsModel.upsertBudget(user.id, category.id, '2026-01', 100);
    await spend(user.id, account.id, category.id, '2026-01-05', -20); // +80 carry

    await budgetsModel.upsertBudget(user.id, category.id, '2026-02', 100);
    await spend(user.id, account.id, category.id, '2026-02-05', -30); // available 100+80=180, spend 30 -> +150 carry

    await budgetsModel.upsertBudget(user.id, category.id, '2026-03', 100);

    const marchAvailable = await budgetsModel.availableForMonth(user.id, category.id, '2026-03-01', true);
    expect(marchAvailable).toBe(250); // 100 + 150 carried
  });

  it('carries a deficit forward when a month is overspent', async () => {
    const user = await usersModel.createUser(uniqueEmail('budget-roll-deficit'), 'correct-horse');
    const account = await accountsModel.create(user.id, { name: 'Checking', type: 'checking', currency: 'USD', openingBalance: 5000 });
    const category = await categoriesModel.create(user.id, { name: 'Shopping', kind: 'expense', rollover: true });

    await budgetsModel.upsertBudget(user.id, category.id, '2026-01', 200);
    await spend(user.id, account.id, category.id, '2026-01-10', -350); // overspent by 150

    await budgetsModel.upsertBudget(user.id, category.id, '2026-02', 200);

    const febAvailable = await budgetsModel.availableForMonth(user.id, category.id, '2026-02-01', true);
    expect(febAvailable).toBe(50); // 200 - 150 deficit carried in
  });
});

describe('listForMonth', () => {
  it('flags over-budget categories and computes remaining correctly', async () => {
    const user = await usersModel.createUser(uniqueEmail('budget-list'), 'correct-horse');
    const account = await accountsModel.create(user.id, { name: 'Checking', type: 'checking', currency: 'USD', openingBalance: 1000 });
    const overCategory = await categoriesModel.create(user.id, { name: 'Coffee', kind: 'expense' });
    const okCategory = await categoriesModel.create(user.id, { name: 'Books', kind: 'expense' });

    await budgetsModel.upsertBudget(user.id, overCategory.id, '2026-04', 50);
    await spend(user.id, account.id, overCategory.id, '2026-04-05', -75);

    await budgetsModel.upsertBudget(user.id, okCategory.id, '2026-04', 100);
    await spend(user.id, account.id, okCategory.id, '2026-04-05', -40);

    const rows = await budgetsModel.listForMonth(user.id, '2026-04');
    const over = rows.find((r) => r.category.id === overCategory.id);
    const ok = rows.find((r) => r.category.id === okCategory.id);

    expect(over.isOverBudget).toBe(true);
    expect(over.remaining).toBeCloseTo(-25);
    expect(ok.isOverBudget).toBe(false);
    expect(ok.remaining).toBeCloseTo(60);
  });
});

describe('budget routes', () => {
  it('sets a budget via HTTP and reflects it back on the budgets page', async () => {
    const agent = request.agent(app);
    const email = uniqueEmail('budget-route');
    await agent.post('/auth/signup').type('form').send({ email, password: 'correct-horse', passwordConfirm: 'correct-horse' });
    await agent.post('/categories').type('form').send({ name: 'Utilities', kind: 'expense', redirectTo: '/categories' });

    const categoriesRes = await agent.get('/categories');
    const categoryId = categoriesRes.text.match(/categories\/([0-9a-f-]{36})\/edit/)[1];

    const month = '2026-05';
    const putRes = await agent
      .put(`/budgets/${categoryId}?month=${month}`)
      .type('form')
      .send({ amount: '250' });
    expect(putRes.status).toBe(302);

    const budgetsPage = await agent.get(`/budgets?month=${month}`);
    expect(budgetsPage.status).toBe(200);
    expect(budgetsPage.text).toContain('Utilities');
    expect(budgetsPage.text).toContain('250');
  });
});
