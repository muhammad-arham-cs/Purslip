const request = require('supertest');
const app = require('../server');
const { pool } = require('../config/db');
const goalsModel = require('../models/goals');
const accountsModel = require('../models/accounts');
const usersModel = require('../models/users');

afterAll(async () => {
  await pool.end();
});

function uniqueEmail(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

describe('goals model', () => {
  it('creates a goal and calculates progress correctly', async () => {
    const user = await usersModel.createUser(uniqueEmail('goal-create'), 'correct-horse');
    const account = await accountsModel.create(user.id, {
      name: 'Savings', type: 'savings', currency: 'USD', openingBalance: 1000,
    });

    const goal = await goalsModel.create(user.id, {
      accountId: account.id,
      name: 'Emergency Fund',
      targetAmount: 5000,
      startingBalance: 1000,
      targetDate: '2027-12-31',
    });

    expect(goal).toBeTruthy();

    const fetched = await goalsModel.getById(user.id, goal.id);
    // Account is at 1000, starting is 1000 → 0% progress (no NEW saving yet)
    expect(fetched.percentComplete).toBeCloseTo(0);
    expect(fetched.saved).toBeCloseTo(0);
    expect(fetched.remaining).toBeCloseTo(4000);
    expect(fetched.daysRemaining).toBeGreaterThan(0);
  });

  it('reflects account balance changes in goal progress', async () => {
    const user = await usersModel.createUser(uniqueEmail('goal-progress'), 'correct-horse');
    const account = await accountsModel.create(user.id, {
      name: 'Savings', type: 'savings', currency: 'USD', openingBalance: 500,
    });

    await goalsModel.create(user.id, {
      accountId: account.id,
      name: 'Vacation',
      targetAmount: 2500,
      startingBalance: 500,
    });

    // Simulate saving $1000 by adjusting the account balance
    await accountsModel.adjustBalance(account.id, 1000);

    const goals = await goalsModel.list(user.id);
    const goal = goals.find((g) => g.name === 'Vacation');
    // 1000 saved out of 2000 needed (2500 - 500) = 50%
    expect(goal.percentComplete).toBeCloseTo(50);
    expect(goal.saved).toBeCloseTo(1000);
    expect(goal.remaining).toBeCloseTo(1000);
  });

  it('updates a goal', async () => {
    const user = await usersModel.createUser(uniqueEmail('goal-update'), 'correct-horse');
    const account = await accountsModel.create(user.id, {
      name: 'Savings', type: 'savings', currency: 'USD', openingBalance: 0,
    });

    const goal = await goalsModel.create(user.id, {
      accountId: account.id,
      name: 'Original',
      targetAmount: 1000,
    });

    const updated = await goalsModel.update(user.id, goal.id, {
      accountId: account.id,
      name: 'Renamed',
      targetAmount: 2000,
      startingBalance: 0,
    });

    expect(updated.name).toBe('Renamed');
    expect(Number(updated.target_amount)).toBe(2000);
  });

  it('marks a goal as achieved and reopens it', async () => {
    const user = await usersModel.createUser(uniqueEmail('goal-achieve'), 'correct-horse');
    const account = await accountsModel.create(user.id, {
      name: 'Savings', type: 'savings', currency: 'USD', openingBalance: 0,
    });

    const goal = await goalsModel.create(user.id, {
      accountId: account.id,
      name: 'Test Achieve',
      targetAmount: 1000,
    });

    const achieved = await goalsModel.setAchieved(user.id, goal.id, true);
    expect(achieved.is_achieved).toBe(true);

    const reopened = await goalsModel.setAchieved(user.id, goal.id, false);
    expect(reopened.is_achieved).toBe(false);
  });

  it('deletes a goal', async () => {
    const user = await usersModel.createUser(uniqueEmail('goal-delete'), 'correct-horse');
    const account = await accountsModel.create(user.id, {
      name: 'Savings', type: 'savings', currency: 'USD', openingBalance: 0,
    });

    const goal = await goalsModel.create(user.id, {
      accountId: account.id,
      name: 'To Delete',
      targetAmount: 1000,
    });

    const result = await goalsModel.remove(user.id, goal.id);
    expect(result).toBe(true);

    const fetched = await goalsModel.getById(user.id, goal.id);
    expect(fetched).toBeNull();
  });

  it('does not allow cross-user access', async () => {
    const user1 = await usersModel.createUser(uniqueEmail('goal-iso1'), 'correct-horse');
    const user2 = await usersModel.createUser(uniqueEmail('goal-iso2'), 'correct-horse');
    const account = await accountsModel.create(user1.id, {
      name: 'Savings', type: 'savings', currency: 'USD', openingBalance: 0,
    });

    const goal = await goalsModel.create(user1.id, {
      accountId: account.id,
      name: 'Private Goal',
      targetAmount: 1000,
    });

    // User 2 shouldn't see user 1's goal
    const fetched = await goalsModel.getById(user2.id, goal.id);
    expect(fetched).toBeNull();

    const deleted = await goalsModel.remove(user2.id, goal.id);
    expect(deleted).toBe(false);
  });
});

describe('goals routes', () => {
  it('creates a goal via HTTP and shows it on the index', async () => {
    const agent = request.agent(app);
    const email = uniqueEmail('goal-route');
    await agent.post('/auth/signup').type('form').send({ email, password: 'correct-horse', passwordConfirm: 'correct-horse' });

    // Need an account first
    await agent.post('/accounts').type('form').send({ name: 'My Savings', type: 'savings', currency: 'USD', openingBalance: '1000' });

    // Get account ID from accounts list
    const accountsRes = await agent.get('/accounts');
    const accountId = accountsRes.text.match(/accounts\/([0-9a-f-]{36})\/edit/)[1];

    const createRes = await agent.post('/goals').type('form').send({
      name: 'Car Fund',
      accountId,
      targetAmount: '15000',
      startingBalance: '1000',
      targetDate: '2027-06-01',
    });
    expect(createRes.status).toBe(302);

    const indexRes = await agent.get('/goals');
    expect(indexRes.status).toBe(200);
    expect(indexRes.text).toContain('Car Fund');
    expect(indexRes.text).toContain('15,000');
    expect(indexRes.text).toContain('My Savings');
  });

  it('anonymous users are redirected from goals', async () => {
    const res = await request(app).get('/goals');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/auth/login');
  });
});
