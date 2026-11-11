const request = require('supertest');
const app = require('../server');
const { pool } = require('../config/db');
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

describe('subcategory rules', () => {
  it('creates a subcategory that inherits its parent\'s kind', async () => {
    const user = await usersModel.createUser(uniqueEmail('cat-sub'), 'correct-horse');
    const parent = await categoriesModel.create(user.id, { name: 'Food', kind: 'expense' });

    const child = await categoriesModel.create(user.id, {
      name: 'Restaurants',
      kind: 'income', // deliberately wrong, should be overridden
      parentId: parent.id,
    });

    expect(child.parent_id).toBe(parent.id);
    expect(child.kind).toBe('expense');
  });

  it('rejects nesting a subcategory two levels deep', async () => {
    const user = await usersModel.createUser(uniqueEmail('cat-nest'), 'correct-horse');
    const parent = await categoriesModel.create(user.id, { name: 'Food', kind: 'expense' });
    const child = await categoriesModel.create(user.id, {
      name: 'Restaurants',
      kind: 'expense',
      parentId: parent.id,
    });

    await expect(
      categoriesModel.create(user.id, { name: 'Fast food', kind: 'expense', parentId: child.id })
    ).rejects.toThrow('one level deep');
  });

  it('rejects a category becoming its own parent', async () => {
    const user = await usersModel.createUser(uniqueEmail('cat-self'), 'correct-horse');
    const cat = await categoriesModel.create(user.id, { name: 'Misc', kind: 'expense' });

    await expect(
      categoriesModel.update(user.id, cat.id, { name: 'Misc', kind: 'expense', parentId: cat.id })
    ).rejects.toThrow('cannot be its own parent');
  });

  it('rejects a category with children becoming a subcategory itself', async () => {
    const user = await usersModel.createUser(uniqueEmail('cat-promote'), 'correct-horse');
    const parent = await categoriesModel.create(user.id, { name: 'Food', kind: 'expense' });
    await categoriesModel.create(user.id, { name: 'Restaurants', kind: 'expense', parentId: parent.id });

    const otherTop = await categoriesModel.create(user.id, { name: 'Other', kind: 'expense' });

    await expect(
      categoriesModel.update(user.id, parent.id, { name: 'Food', kind: 'expense', parentId: otherTop.id })
    ).rejects.toThrow('subcategories');
  });
});

describe('deletion policy', () => {
  it('deletes an unused category outright', async () => {
    const user = await usersModel.createUser(uniqueEmail('cat-clean'), 'correct-horse');
    const cat = await categoriesModel.create(user.id, { name: 'Unused', kind: 'expense' });

    const outcome = await categoriesModel.remove(user.id, cat.id);
    expect(outcome.deleted).toBe(true);
    expect(await categoriesModel.getById(user.id, cat.id)).toBeNull();
  });

  it('blocks deletion of a category that still has subcategories', async () => {
    const user = await usersModel.createUser(uniqueEmail('cat-block-child'), 'correct-horse');
    const parent = await categoriesModel.create(user.id, { name: 'Food', kind: 'expense' });
    await categoriesModel.create(user.id, { name: 'Restaurants', kind: 'expense', parentId: parent.id });

    const outcome = await categoriesModel.remove(user.id, parent.id);
    expect(outcome.blocked).toBe(true);
    expect(outcome.usage.children).toBe(1);
    // nothing was deleted
    expect(await categoriesModel.getById(user.id, parent.id)).not.toBeNull();
  });

  it('blocks deletion of a category referenced by a budget', async () => {
    const user = await usersModel.createUser(uniqueEmail('cat-block-budget'), 'correct-horse');
    const cat = await categoriesModel.create(user.id, { name: 'Rent', kind: 'expense' });
    await pool.query(
      'INSERT INTO budgets (user_id, category_id, month, amount) VALUES ($1, $2, $3, $4)',
      [user.id, cat.id, '2026-01-01', 1000]
    );

    const outcome = await categoriesModel.remove(user.id, cat.id);
    expect(outcome.blocked).toBe(true);
    expect(outcome.usage.budgets).toBe(1);
  });

  it('requires a reassignment choice when transactions use the category, then reassigns and deletes', async () => {
    const user = await usersModel.createUser(uniqueEmail('cat-reassign'), 'correct-horse');
    const account = await accountsModel.create(user.id, {
      name: 'Checking',
      type: 'checking',
      currency: 'USD',
      openingBalance: 100,
    });
    const oldCat = await categoriesModel.create(user.id, { name: 'Dining Out', kind: 'expense' });
    const newCat = await categoriesModel.create(user.id, { name: 'Restaurants', kind: 'expense' });

    const txn = await transactionsModel.create(user.id, {
      accountId: account.id,
      date: '2026-01-05',
      amount: -20,
      splits: [{ categoryId: oldCat.id, amount: -20 }],
    });

    // First call with no reassignment info: should ask for a choice, not delete.
    const needsChoice = await categoriesModel.remove(user.id, oldCat.id);
    expect(needsChoice.needsReassignment).toBe(true);
    expect(await categoriesModel.getById(user.id, oldCat.id)).not.toBeNull();

    // Now reassign to newCat and delete.
    const outcome = await categoriesModel.remove(user.id, oldCat.id, { reassignToCategoryId: newCat.id });
    expect(outcome.deleted).toBe(true);

    const loaded = await transactionsModel.getById(user.id, txn.id);
    expect(loaded.splits[0].category_id).toBe(newCat.id);
  });

  it('reassigns to Uncategorized (null) when the caller passes an empty choice', async () => {
    const user = await usersModel.createUser(uniqueEmail('cat-uncategorize'), 'correct-horse');
    const account = await accountsModel.create(user.id, {
      name: 'Checking',
      type: 'checking',
      currency: 'USD',
      openingBalance: 100,
    });
    const cat = await categoriesModel.create(user.id, { name: 'Temp', kind: 'expense' });
    const txn = await transactionsModel.create(user.id, {
      accountId: account.id,
      date: '2026-01-05',
      amount: -10,
      splits: [{ categoryId: cat.id, amount: -10 }],
    });

    const outcome = await categoriesModel.remove(user.id, cat.id, { reassignToCategoryId: null });
    expect(outcome.deleted).toBe(true);

    const loaded = await transactionsModel.getById(user.id, txn.id);
    expect(loaded.splits[0].category_id).toBeNull();
  });
});

describe('archive vs delete', () => {
  it('archiving hides a category from the default list without touching data', async () => {
    const user = await usersModel.createUser(uniqueEmail('cat-archive'), 'correct-horse');
    const cat = await categoriesModel.create(user.id, { name: 'Old habit', kind: 'expense' });

    await categoriesModel.setArchived(user.id, cat.id, true);

    const active = await categoriesModel.list(user.id);
    expect(active.find((c) => c.id === cat.id)).toBeUndefined();

    const withArchived = await categoriesModel.list(user.id, { includeArchived: true });
    expect(withArchived.find((c) => c.id === cat.id)).toBeDefined();
  });
});

describe('category routes', () => {
  async function signedInAgent(prefix) {
    const agent = request.agent(app);
    const email = uniqueEmail(prefix);
    const password = 'correct-horse';
    await agent.post('/auth/signup').type('form').send({ email, password, passwordConfirm: password });
    return agent;
  }

  it('creates a category via HTTP and lists it grouped with its subcategory', async () => {
    const agent = await signedInAgent('cat-route');

    const parentRes = await agent
      .post('/categories')
      .type('form')
      .send({ name: 'Food', kind: 'expense', redirectTo: '/categories' });
    expect(parentRes.status).toBe(302);

    const listRes = await agent.get('/categories');
    const parentId = listRes.text.match(/categories\/([0-9a-f-]{36})\/edit/)[1];

    const childRes = await agent
      .post('/categories')
      .type('form')
      .send({ name: 'Groceries', kind: 'expense', parentId, redirectTo: '/categories' });
    expect(childRes.status).toBe(302);

    const finalList = await agent.get('/categories');
    expect(finalList.text).toContain('Food');
    expect(finalList.text).toContain('Groceries');
  });

  it('shows a confirmation page requiring reassignment before deleting a used category', async () => {
    const agent = await signedInAgent('cat-route-delete');
    await agent.post('/accounts').type('form').send({ name: 'Checking', type: 'checking', currency: 'USD', openingBalance: '100' });
    await agent.post('/categories').type('form').send({ name: 'Coffee', kind: 'expense', redirectTo: '/categories' });

    const accountsRes = await agent.get('/accounts');
    const accountId = accountsRes.text.match(/accounts\/([0-9a-f-]{36})\/edit/)[1];
    const categoriesRes = await agent.get('/categories');
    const categoryId = categoriesRes.text.match(/categories\/([0-9a-f-]{36})\/edit/)[1];

    await agent
      .post('/transactions')
      .type('form')
      .send({
        accountId,
        date: '2026-01-01',
        type: 'expense',
        amount: '5',
        'splits[0][categoryId]': categoryId,
        'splits[0][amount]': '5',
      });

    const deletePage = await agent.get(`/categories/${categoryId}/delete`);
    expect(deletePage.status).toBe(200);
    expect(deletePage.text).toContain('existing transaction');

    const deleteRes = await agent
      .delete(`/categories/${categoryId}`)
      .type('form')
      .send({ reassignToCategoryId: '' });
    expect(deleteRes.status).toBe(302);
    expect(deleteRes.headers.location).toBe('/categories');
  });
});
