const debts = require('../models/debts');
const accounts = require('../models/accounts');
const users = require('../models/users');
const { pool } = require('../config/db');

afterAll(async () => {
  await pool.end();
});

function uniqueEmail(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

describe('debts', () => {
  it('records a debt without changing an account when movement is disabled', async () => {
    const user = await users.createUser(uniqueEmail('debt-only'), 'correct-horse');
    const account = await accounts.create(user.id, {
      accountTitle: 'Cash',
      bankName: 'Wallet',
      type: 'cash',
      currency: 'PKR',
      openingBalance: 1000,
    });

    const debt = await debts.create(user.id, {
      personName: 'Bisma',
      direction: 'borrowed',
      amount: 50000,
      currency: 'PKR',
      recordMovement: false,
      date: '2026-11-05',
    });
    expect(debt.currency).toBe('PKR');
    expect(Number((await accounts.getById(user.id, account.id)).current_balance)).toBe(1000);

    await debts.addRepayment(user.id, debt.id, {
      amount: 17000,
      recordMovement: false,
      date: '2026-11-06',
    });
    expect(Number((await debts.getById(user.id, debt.id)).remaining)).toBe(33000);
    expect(Number((await accounts.getById(user.id, account.id)).current_balance)).toBe(1000);
  });

  it('records a lent debt and a linked repayment while updating the account balance', async () => {
    const user = await users.createUser(uniqueEmail('debt'), 'correct-horse');
    const account = await accounts.create(user.id, {
      accountTitle: 'Cash',
      bankName: 'Wallet',
      type: 'cash',
      currency: 'PKR',
      openingBalance: 1000,
    });

    const debt = await debts.create(user.id, {
      personName: 'Alex',
      direction: 'lent',
      amount: 300,
      accountId: account.id,
      recordMovement: true,
      date: '2026-11-05',
    });
    expect(Number((await accounts.getById(user.id, account.id)).current_balance)).toBe(700);

    await debts.addRepayment(user.id, debt.id, {
      amount: 125,
      accountId: account.id,
      recordMovement: true,
      date: '2026-11-06',
    });
    const updated = await debts.getById(user.id, debt.id);
    expect(Number(updated.remaining)).toBe(175);
    expect(Number((await accounts.getById(user.id, account.id)).current_balance)).toBe(825);
  });

  it('rejects repayment above the remaining debt', async () => {
    const user = await users.createUser(uniqueEmail('debt-overpay'), 'correct-horse');
    const account = await accounts.create(user.id, {
      accountTitle: 'Cash',
      bankName: 'Wallet',
      type: 'cash',
      currency: 'PKR',
      openingBalance: 1000,
    });
    const debt = await debts.create(user.id, {
      personName: 'Sam',
      direction: 'borrowed',
      amount: 100,
      accountId: account.id,
      recordMovement: true,
      date: '2026-11-05',
    });
    await expect(debts.addRepayment(user.id, debt.id, {
      amount: 101,
      accountId: account.id,
      recordMovement: true,
      date: '2026-11-06',
    })).rejects.toThrow('cannot exceed');
  });
});
