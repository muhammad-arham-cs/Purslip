const crypto = require('crypto');
const { pool } = require('../config/db');
const cardsModel = require('./cards');

class ValidationError extends Error {}

function toCents(amount) {
  return Math.round(Number(amount) * 100);
}

// Splits are allowed to carry different signs in principle, but in every
// real use case they share the parent transaction's sign — the one thing
// that must always hold is that they sum exactly to it (to the cent, hence
// comparing integer cents rather than floats).
function assertSplitsSumToAmount(amount, splits) {
  if (!splits.length) {
    throw new ValidationError('A transaction needs at least one category split.');
  }
  const total = toCents(amount);
  const sum = splits.reduce((acc, split) => acc + toCents(split.amount), 0);
  if (sum !== total) {
    throw new ValidationError(
      `Splits must sum to the transaction total (${(total / 100).toFixed(2)}), got ${(sum / 100).toFixed(2)}.`
    );
  }
}

async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function assertAccountOwnership(client, userId, accountId) {
  const { rows } = await client.query('SELECT id FROM accounts WHERE id = $1 AND user_id = $2', [
    accountId,
    userId,
  ]);
  if (!rows.length) {
    throw new ValidationError('Account not found.');
  }
}

async function insertSplits(client, transactionId, splits) {
  for (const split of splits) {
    // eslint-disable-next-line no-await-in-loop
    await client.query(
      'INSERT INTO transaction_splits (transaction_id, category_id, amount, note) VALUES ($1, $2, $3, $4)',
      [transactionId, split.categoryId || null, split.amount, split.note || null]
    );
  }
}

async function create(userId, {
  accountId, date, amount, payee, note, splits, debtId = null, transactionType = null, cardId = null, paymentMethod = null,
}) {
  assertSplitsSumToAmount(amount, splits);

  return withTransaction(async (client) => {
    const resolved = await cardsModel.resolveCardAndPaymentMethod(client, userId, {
      accountId,
      cardId,
      paymentMethod,
      payee,
      note,
    });
    const finalAccountId = resolved.accountId || accountId;
    await assertAccountOwnership(client, userId, finalAccountId);

    const { rows } = await client.query(
      `INSERT INTO transactions
       (user_id, account_id, date, amount, transaction_type, payee, note, debt_id, card_id, payment_method)
       VALUES ($1, $2, $3, $4::numeric, COALESCE($5::text, CASE WHEN $4::numeric >= 0 THEN 'income' ELSE 'expense' END), $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        userId,
        finalAccountId,
        date,
        amount,
        transactionType,
        payee || null,
        note || null,
        debtId,
        resolved.cardId,
        resolved.paymentMethod,
      ]
    );
    const transaction = rows[0];

    await insertSplits(client, transaction.id, splits);
    await client.query('UPDATE accounts SET current_balance = current_balance + $1 WHERE id = $2', [
      amount,
      finalAccountId,
    ]);

    return transaction;
  });
}

async function getById(userId, transactionId) {
  const { rows } = await pool.query(
    'SELECT * FROM transactions WHERE id = $1 AND user_id = $2',
    [transactionId, userId]
  );
  if (!rows.length) return null;

  const { rows: splitRows } = await pool.query(
    `SELECT s.*, c.name AS category_name
     FROM transaction_splits s
     LEFT JOIN categories c ON c.id = s.category_id
     WHERE s.transaction_id = $1
     ORDER BY s.created_at`,
    [transactionId]
  );

  return { ...rows[0], splits: splitRows };
}

async function update(userId, transactionId, {
  accountId, date, amount, payee, note, splits, transactionType = null, cardId = null, paymentMethod = null,
}) {
  assertSplitsSumToAmount(amount, splits);

  return withTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT * FROM transactions WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [transactionId, userId]
    );
    if (!rows.length) {
      throw new ValidationError('Transaction not found.');
    }
    const existing = rows[0];
    if (existing.is_transfer) {
      throw new ValidationError('Edit transfers via the transfer form, not the transaction form.');
    }
    if (existing.debt_id) {
      throw new ValidationError('Debt transactions must be changed from the debt details page.');
    }

    const resolved = await cardsModel.resolveCardAndPaymentMethod(client, userId, {
      accountId,
      cardId,
      paymentMethod,
      payee,
      note,
    });
    const finalAccountId = resolved.accountId || accountId;
    await assertAccountOwnership(client, userId, finalAccountId);

    // Reverse the old balance effect, then apply the new one — handles the
    // account changing between edits as well as just the amount changing.
    await client.query('UPDATE accounts SET current_balance = current_balance - $1 WHERE id = $2', [
      existing.amount,
      existing.account_id,
    ]);
    await client.query('UPDATE accounts SET current_balance = current_balance + $1 WHERE id = $2', [
      amount,
      finalAccountId,
    ]);

    const { rows: updatedRows } = await client.query(
      `UPDATE transactions
       SET account_id = $1, date = $2, amount = $3,
           transaction_type = COALESCE($4::text, CASE WHEN $3::numeric >= 0 THEN 'income' ELSE 'expense' END),
           payee = $5, note = $6, card_id = $7, payment_method = $8
       WHERE id = $9
       RETURNING *`,
      [finalAccountId, date, amount, transactionType, payee || null, note || null, resolved.cardId, resolved.paymentMethod, transactionId]
    );

    await client.query('DELETE FROM transaction_splits WHERE transaction_id = $1', [transactionId]);
    await insertSplits(client, transactionId, splits);

    return updatedRows[0];
  });
}

async function remove(userId, transactionId) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT * FROM transactions WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [transactionId, userId]
    );
    if (!rows.length) return null;
    const existing = rows[0];

    if (existing.debt_id) {
      throw new ValidationError('Debt transactions must be changed from the debt details page.');
    }

    if (existing.is_transfer) {
      const { rows: legs } = await client.query(
        'SELECT * FROM transactions WHERE transfer_group_id = $1 AND user_id = $2 FOR UPDATE',
        [existing.transfer_group_id, userId]
      );
      for (const leg of legs) {
        // eslint-disable-next-line no-await-in-loop
        await client.query('UPDATE accounts SET current_balance = current_balance - $1 WHERE id = $2', [
          leg.amount,
          leg.account_id,
        ]);
      }
      await client.query('DELETE FROM transactions WHERE transfer_group_id = $1 AND user_id = $2', [
        existing.transfer_group_id,
        userId,
      ]);
      return { deleted: true, wasTransfer: true };
    }

    await client.query('UPDATE accounts SET current_balance = current_balance - $1 WHERE id = $2', [
      existing.amount,
      existing.account_id,
    ]);
    await client.query('DELETE FROM transactions WHERE id = $1', [transactionId]);
    return { deleted: true, wasTransfer: false };
  });
}

async function list(userId, { page = 1, pageSize = 25, accountId, cardId, categoryId, startDate, endDate, minAmount, maxAmount, search } = {}) {
  await cardsModel.ensureSchema();
  const offset = (page - 1) * pageSize;
  const params = [userId];
  const conditions = ['t.user_id = $1'];

  if (accountId) {
    params.push(accountId);
    conditions.push(`t.account_id = $${params.length}`);
  }
  if (cardId) {
    params.push(cardId);
    conditions.push(`t.card_id = $${params.length}`);
  }
  if (startDate) {
    params.push(startDate);
    conditions.push(`t.date >= $${params.length}::date`);
  }
  if (endDate) {
    params.push(endDate);
    conditions.push(`t.date <= $${params.length}::date`);
  }
  if (minAmount !== undefined && minAmount !== '') {
    params.push(Number(minAmount));
    conditions.push(`ABS(t.amount) >= $${params.length}`);
  }
  if (maxAmount !== undefined && maxAmount !== '') {
    params.push(Number(maxAmount));
    conditions.push(`ABS(t.amount) <= $${params.length}`);
  }
  if (search && search.trim()) {
    params.push(`%${search.trim()}%`);
    conditions.push(`(t.payee ILIKE $${params.length} OR t.note ILIKE $${params.length})`);
  }

  if (categoryId) {
    params.push(categoryId);
    conditions.push(`EXISTS (
      SELECT 1 FROM transaction_splits sf
      WHERE sf.transaction_id = t.id AND sf.category_id = $${params.length}
    )`);
  }

  const whereClause = conditions.join(' AND ');

  const countParams = [...params];
  const { rows: countRows } = await pool.query(
    `SELECT count(*)::int AS count FROM transactions t WHERE ${whereClause}`,
    countParams
  );
  const total = countRows[0].count;

  params.push(pageSize, offset);
  const { rows } = await pool.query(
    `SELECT t.*, COALESCE(NULLIF(a.account_title, ''), a.name) AS account_name,
       a.bank_name AS bank_name, a.currency AS account_currency, a.type AS account_type,
       cd.card_name AS card_name, cd.card_type AS card_type, cd.network AS card_network, cd.last4 AS card_last4,
       (SELECT json_agg(json_build_object('category_id', s.category_id, 'category_name', c.name, 'amount', s.amount))
        FROM transaction_splits s LEFT JOIN categories c ON c.id = s.category_id
        WHERE s.transaction_id = t.id) AS splits
     FROM transactions t
     JOIN accounts a ON a.id = t.account_id
     LEFT JOIN cards cd ON cd.id = t.card_id
     WHERE ${whereClause}
     ORDER BY t.date DESC, t.created_at DESC, t.id
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    transactions: rows,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

// --- Transfers: two linked transactions sharing transfer_group_id ---

async function createTransfer(userId, { fromAccountId, toAccountId, date, amount, note }) {
  if (fromAccountId === toAccountId) {
    throw new ValidationError('Source and destination accounts must be different.');
  }
  if (Number(amount) <= 0) {
    throw new ValidationError('Transfer amount must be positive.');
  }

  return withTransaction(async (client) => {
    await assertAccountOwnership(client, userId, fromAccountId);
    await assertAccountOwnership(client, userId, toAccountId);

    const transferGroupId = crypto.randomUUID();

    const outgoing = await client.query(
      `INSERT INTO transactions (user_id, account_id, date, amount, payee, note, is_transfer, transfer_group_id)
       VALUES ($1, $2, $3, $4, 'Self', $5, true, $6) RETURNING *`,
      [userId, fromAccountId, date, -Math.abs(amount), note || null, transferGroupId]
    );
    await insertSplits(client, outgoing.rows[0].id, [{ categoryId: null, amount: -Math.abs(amount) }]);

    const incoming = await client.query(
      `INSERT INTO transactions (user_id, account_id, date, amount, payee, note, is_transfer, transfer_group_id)
       VALUES ($1, $2, $3, $4, 'Self', $5, true, $6) RETURNING *`,
      [userId, toAccountId, date, Math.abs(amount), note || null, transferGroupId]
    );
    await insertSplits(client, incoming.rows[0].id, [{ categoryId: null, amount: Math.abs(amount) }]);

    await client.query('UPDATE accounts SET current_balance = current_balance - $1 WHERE id = $2', [
      Math.abs(amount),
      fromAccountId,
    ]);
    await client.query('UPDATE accounts SET current_balance = current_balance + $1 WHERE id = $2', [
      Math.abs(amount),
      toAccountId,
    ]);

    return { transferGroupId };
  });
}

async function getTransfer(userId, transferGroupId) {
  const { rows } = await pool.query(
    'SELECT * FROM transactions WHERE transfer_group_id = $1 AND user_id = $2',
    [transferGroupId, userId]
  );
  if (rows.length !== 2) return null;

  const outgoing = rows.find((r) => Number(r.amount) < 0);
  const incoming = rows.find((r) => Number(r.amount) > 0);
  return {
    transferGroupId,
    fromAccountId: outgoing.account_id,
    toAccountId: incoming.account_id,
    amount: Math.abs(Number(outgoing.amount)),
    date: outgoing.date,
    note: outgoing.note,
  };
}

async function updateTransfer(userId, transferGroupId, { fromAccountId, toAccountId, date, amount, note }) {
  if (fromAccountId === toAccountId) {
    throw new ValidationError('Source and destination accounts must be different.');
  }
  if (Number(amount) <= 0) {
    throw new ValidationError('Transfer amount must be positive.');
  }

  return withTransaction(async (client) => {
    const { rows: legs } = await client.query(
      'SELECT * FROM transactions WHERE transfer_group_id = $1 AND user_id = $2 FOR UPDATE',
      [transferGroupId, userId]
    );
    if (legs.length !== 2) {
      throw new ValidationError('Transfer not found.');
    }

    await assertAccountOwnership(client, userId, fromAccountId);
    await assertAccountOwnership(client, userId, toAccountId);

    for (const leg of legs) {
      // eslint-disable-next-line no-await-in-loop
      await client.query('UPDATE accounts SET current_balance = current_balance - $1 WHERE id = $2', [
        leg.amount,
        leg.account_id,
      ]);
    }
    await client.query('DELETE FROM transactions WHERE transfer_group_id = $1 AND user_id = $2', [
      transferGroupId,
      userId,
    ]);

    const outgoing = await client.query(
      `INSERT INTO transactions (user_id, account_id, date, amount, payee, note, is_transfer, transfer_group_id)
       VALUES ($1, $2, $3, $4, 'Self', $5, true, $6) RETURNING *`,
      [userId, fromAccountId, date, -Math.abs(amount), note || null, transferGroupId]
    );
    await insertSplits(client, outgoing.rows[0].id, [{ categoryId: null, amount: -Math.abs(amount) }]);

    const incoming = await client.query(
      `INSERT INTO transactions (user_id, account_id, date, amount, payee, note, is_transfer, transfer_group_id)
       VALUES ($1, $2, $3, $4, 'Self', $5, true, $6) RETURNING *`,
      [userId, toAccountId, date, Math.abs(amount), note || null, transferGroupId]
    );
    await insertSplits(client, incoming.rows[0].id, [{ categoryId: null, amount: Math.abs(amount) }]);

    await client.query('UPDATE accounts SET current_balance = current_balance - $1 WHERE id = $2', [
      Math.abs(amount),
      fromAccountId,
    ]);
    await client.query('UPDATE accounts SET current_balance = current_balance + $1 WHERE id = $2', [
      Math.abs(amount),
      toAccountId,
    ]);

    return { transferGroupId };
  });
}

async function findExistingImportHashes(accountId, hashes) {
  if (!hashes.length) return new Set();
  const { rows } = await pool.query(
    'SELECT import_hash FROM transactions WHERE account_id = $1 AND import_hash = ANY($2::text[])',
    [accountId, hashes]
  );
  return new Set(rows.map((r) => r.import_hash));
}

// Bulk-inserts CSV-imported rows as simple (uncategorized, single-split)
// transactions. Relies on the DB's unique (account_id, import_hash) index as
// the final line of defense against duplicates — ON CONFLICT DO NOTHING
// means a row that slips past the pre-insert duplicate check (e.g. a race
// with another import) is silently skipped rather than failing the batch.
async function bulkImport(userId, accountId, rows) {
  return withTransaction(async (client) => {
    await assertAccountOwnership(client, userId, accountId);

    let insertedCount = 0;
    let insertedTotal = 0;

    for (const row of rows) {
      // eslint-disable-next-line no-await-in-loop
      const resolved = await cardsModel.resolveCardAndPaymentMethod(client, userId, {
        accountId,
        payee: row.payee || '',
        note: row.note || '',
      });
      // eslint-disable-next-line no-await-in-loop
      const { rows: inserted } = await client.query(
        `INSERT INTO transactions
         (user_id, account_id, date, amount, transaction_type, payee, note, import_source, import_hash, card_id, payment_method)
         VALUES ($1, $2, $3, $4, CASE WHEN $4 >= 0 THEN 'income' ELSE 'expense' END, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (account_id, import_hash) WHERE import_hash IS NOT NULL DO NOTHING
         RETURNING id`,
        [userId, accountId, row.date, row.amount, row.payee || null, row.note || null, row.importSource || null, row.importHash, resolved.cardId, resolved.paymentMethod]
      );
      if (inserted.length) {
        // eslint-disable-next-line no-await-in-loop
        await insertSplits(client, inserted[0].id, [{ categoryId: null, amount: row.amount }]);
        insertedCount += 1;
        insertedTotal += Number(row.amount);
      }
    }

    if (insertedTotal !== 0) {
      await client.query('UPDATE accounts SET current_balance = current_balance + $1 WHERE id = $2', [
        insertedTotal,
        accountId,
      ]);
    }

    return { insertedCount, skippedCount: rows.length - insertedCount };
  });
}

async function findLegIdByTransferGroup(userId, transferGroupId) {
  const { rows } = await pool.query(
    'SELECT id FROM transactions WHERE transfer_group_id = $1 AND user_id = $2 LIMIT 1',
    [transferGroupId, userId]
  );
  return rows[0]?.id || null;
}

module.exports = {
  ValidationError,
  create,
  getById,
  update,
  remove,
  list,
  createTransfer,
  getTransfer,
  updateTransfer,
  findLegIdByTransferGroup,
  bulkImport,
  findExistingImportHashes,
};
