const request = require('supertest');
const app = require('../server');
const { pool } = require('../config/db');
const recurringModel = require('../models/recurring');
const accountsModel = require('../models/accounts');
const categoriesModel = require('../models/categories');
const usersModel = require('../models/users');

afterAll(async () => {
  await pool.end();
});

function uniqueEmail(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

async function makeUserAccountCategory(prefix, openingBalance = 10000) {
  const user = await usersModel.createUser(uniqueEmail(prefix), 'correct-horse');
  const account = await accountsModel.create(user.id, {
    name: `${prefix} account`,
    type: 'checking',
    currency: 'USD',
    openingBalance,
  });
  const category = await categoriesModel.create(user.id, { name: 'Rent', kind: 'expense' });
  return { user, account, category };
}

describe('generateDue — catch-up generation', () => {
  it('generates every missed monthly occurrence up to "today", not just one', async () => {
    const { user, account, category } = await makeUserAccountCategory('rec-catchup');

    const template = await recurringModel.create(user.id, {
      accountId: account.id,
      categoryId: category.id,
      payee: 'Landlord',
      amount: -1000,
      frequency: 'monthly',
      startDate: '2026-01-01',
    });

    const result = await recurringModel.generateDue({ userId: user.id, asOfDate: '2026-04-01' });
    expect(result.templatesProcessed).toBe(4); // Jan, Feb, Mar, Apr 1sts are all <= asOfDate

    const { rows: occurrences } = await pool.query(
      'SELECT occurrence_date FROM recurring_transaction_occurrences WHERE recurring_transaction_id = $1 ORDER BY occurrence_date',
      [template.id]
    );
    expect(occurrences.map((o) => o.occurrence_date)).toEqual([
      '2026-01-01',
      '2026-02-01',
      '2026-03-01',
      '2026-04-01',
    ]);

    const refreshedAccount = await accountsModel.getById(user.id, account.id);
    expect(Number(refreshedAccount.current_balance)).toBe(10000 - 4000);

    const refreshedTemplate = await recurringModel.getById(user.id, template.id);
    expect(refreshedTemplate.next_run_date).toBe('2026-05-01');
  });

  it('does not double-generate when called again for the same "today"', async () => {
    const { user, account, category } = await makeUserAccountCategory('rec-idempotent');

    await recurringModel.create(user.id, {
      accountId: account.id,
      categoryId: category.id,
      payee: 'Subscription',
      amount: -15,
      frequency: 'monthly',
      startDate: '2026-01-01',
    });

    const first = await recurringModel.generateDue({ userId: user.id, asOfDate: '2026-01-01' });
    expect(first.templatesProcessed).toBe(1);

    const second = await recurringModel.generateDue({ userId: user.id, asOfDate: '2026-01-01' });
    expect(second.templatesProcessed).toBe(0);

    const { rows } = await pool.query('SELECT count(*)::int AS count FROM transactions WHERE account_id = $1', [
      account.id,
    ]);
    expect(rows[0].count).toBe(1); // still just one transaction, not two
  });

  it('does not generate anything before the start date or after "today"', async () => {
    const { user, account, category } = await makeUserAccountCategory('rec-future');

    await recurringModel.create(user.id, {
      accountId: account.id,
      categoryId: category.id,
      payee: 'Future bill',
      amount: -50,
      frequency: 'monthly',
      startDate: '2026-06-01',
    });

    const result = await recurringModel.generateDue({ userId: user.id, asOfDate: '2026-03-01' });
    expect(result.templatesProcessed).toBe(0);

    const { rows } = await pool.query('SELECT count(*)::int AS count FROM transactions WHERE account_id = $1', [
      account.id,
    ]);
    expect(rows[0].count).toBe(0);
  });

  it('deactivates the template once its schedule passes end_date', async () => {
    const { user, account, category } = await makeUserAccountCategory('rec-enddate');

    const template = await recurringModel.create(user.id, {
      accountId: account.id,
      categoryId: category.id,
      payee: 'Short-term plan',
      amount: -20,
      frequency: 'monthly',
      startDate: '2026-01-01',
      endDate: '2026-02-15',
    });

    await recurringModel.generateDue({ userId: user.id, asOfDate: '2026-06-01' });

    const refreshed = await recurringModel.getById(user.id, template.id);
    expect(refreshed.is_active).toBe(false);

    const { rows } = await pool.query(
      'SELECT occurrence_date FROM recurring_transaction_occurrences WHERE recurring_transaction_id = $1 ORDER BY occurrence_date',
      [template.id]
    );
    // Jan 1 and Feb 1 are <= end_date (Feb 15); Mar 1 would be past it.
    expect(rows.map((r) => r.occurrence_date)).toEqual(['2026-01-01', '2026-02-01']);
  });

  it('handles custom_days frequency correctly', async () => {
    const { user, account, category } = await makeUserAccountCategory('rec-custom');

    await recurringModel.create(user.id, {
      accountId: account.id,
      categoryId: category.id,
      payee: 'Every 10 days',
      amount: -5,
      frequency: 'custom_days',
      customIntervalDays: 10,
      startDate: '2026-01-01',
    });

    const result = await recurringModel.generateDue({ userId: user.id, asOfDate: '2026-01-25' });
    // Due dates: Jan 1, Jan 11, Jan 21 (Jan 31 is after asOfDate)
    expect(result.templatesProcessed).toBe(3);
  });
});

describe('upcomingBills and subscriptionSummary', () => {
  it('lists only active expense templates due within the window', async () => {
    const { user, account, category } = await makeUserAccountCategory('rec-upcoming');
    const incomeCategory = await categoriesModel.create(user.id, { name: 'Salary', kind: 'income' });

    await recurringModel.create(user.id, {
      accountId: account.id,
      categoryId: category.id,
      payee: 'Due soon',
      amount: -100,
      frequency: 'monthly',
      startDate: '2026-01-05',
    });
    await recurringModel.create(user.id, {
      accountId: account.id,
      categoryId: incomeCategory.id,
      payee: 'Paycheck',
      amount: 3000,
      frequency: 'monthly',
      startDate: '2026-01-05',
    });

    const upcoming = await recurringModel.upcomingBills(user.id, 365);
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0].payee).toBe('Due soon');
  });

  it('computes a sensible total monthly recurring spend across mixed frequencies', async () => {
    const { user, account, category } = await makeUserAccountCategory('rec-subs');

    await recurringModel.create(user.id, {
      accountId: account.id,
      categoryId: category.id,
      payee: 'Streaming',
      amount: -15,
      frequency: 'monthly',
      startDate: '2026-01-01',
    });
    await recurringModel.create(user.id, {
      accountId: account.id,
      categoryId: category.id,
      payee: 'Annual domain',
      amount: -120,
      frequency: 'yearly',
      startDate: '2026-01-01',
    });

    const summary = await recurringModel.subscriptionSummary(user.id);
    expect(summary.templates).toHaveLength(2);
    expect(summary.totalMonthly).toBeCloseTo(15 + 120 / 12, 1);
  });
});

describe('recurring routes', () => {
  it('creates a recurring transaction via HTTP and it appears on the page', async () => {
    const agent = request.agent(app);
    const email = uniqueEmail('rec-route');
    await agent.post('/auth/signup').type('form').send({ email, password: 'correct-horse', passwordConfirm: 'correct-horse' });
    await agent.post('/accounts').type('form').send({ name: 'Checking', type: 'checking', currency: 'USD', openingBalance: '1000' });
    const accountsRes = await agent.get('/accounts');
    const accountId = accountsRes.text.match(/accounts\/([0-9a-f-]{36})\/edit/)[1];

    const createRes = await agent.post('/recurring').type('form').send({
      accountId,
      payee: 'Gym',
      amount: '40',
      type: 'expense',
      frequency: 'monthly',
      startDate: '2025-01-01', // in the past, to trigger catch-up generation on page load
    });
    expect(createRes.status).toBe(302);

    const indexRes = await agent.get('/recurring');
    expect(indexRes.status).toBe(200);
    expect(indexRes.text).toContain('Gym');

    // The GET /recurring handler calls generateDue for this user, so a
    // template starting in 2020 should have generated real transactions by now.
    const txnRes = await agent.get('/transactions');
    expect(txnRes.text).toContain('Gym');
  });

  it('pauses and resumes a recurring transaction', async () => {
    const agent = request.agent(app);
    const email = uniqueEmail('rec-pause');
    await agent.post('/auth/signup').type('form').send({ email, password: 'correct-horse', passwordConfirm: 'correct-horse' });
    await agent.post('/accounts').type('form').send({ name: 'Checking', type: 'checking', currency: 'USD', openingBalance: '1000' });
    const accountsRes = await agent.get('/accounts');
    const accountId = accountsRes.text.match(/accounts\/([0-9a-f-]{36})\/edit/)[1];

    await agent.post('/recurring').type('form').send({
      accountId,
      payee: 'Pausable',
      amount: '10',
      type: 'expense',
      frequency: 'monthly',
      startDate: '2026-01-01',
    });

    const indexRes = await agent.get('/recurring');
    const templateId = indexRes.text.match(/recurring\/([0-9a-f-]{36})\/edit/)[1];

    const pauseRes = await agent.post(`/recurring/${templateId}/pause`);
    expect(pauseRes.status).toBe(302);
    let page = await agent.get('/recurring');
    expect(page.text).toContain('Paused');

    const resumeRes = await agent.post(`/recurring/${templateId}/resume`);
    expect(resumeRes.status).toBe(302);
    page = await agent.get('/recurring');
    expect(page.text).toContain('Active');
  });
});
