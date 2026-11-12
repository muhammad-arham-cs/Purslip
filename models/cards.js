const { pool } = require('../config/db');

const CARD_TYPES = ['debit', 'credit'];
const CARD_NETWORKS = ['VISA', 'Mastercard', 'PayPak', 'UnionPay', 'Amex'];
const CARD_THEMES = ['lime', 'slate', 'obsidian', 'emerald', 'amber'];

let schemaPromise = null;

function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS cards (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
          card_name TEXT NOT NULL,
          cardholder_name TEXT NOT NULL DEFAULT '',
          card_type TEXT NOT NULL DEFAULT 'debit' CHECK (card_type IN ('debit', 'credit')),
          network TEXT NOT NULL DEFAULT 'VISA',
          last4 TEXT NOT NULL,
          expiry TEXT NOT NULL DEFAULT '03/30',
          theme_color TEXT NOT NULL DEFAULT 'lime',
          spending_limit NUMERIC(14, 2),
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_cards_user_id ON cards(user_id);
        CREATE INDEX IF NOT EXISTS idx_cards_account_id ON cards(account_id);
        ALTER TABLE transactions
          ADD COLUMN IF NOT EXISTS card_id UUID REFERENCES cards(id) ON DELETE SET NULL,
          ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'account';
        CREATE INDEX IF NOT EXISTS idx_transactions_card_id ON transactions(card_id);
      `);
    })().catch((err) => {
      schemaPromise = null;
      throw err;
    });
  }
  return schemaPromise;
}

async function list(userId, { includeInactive = false } = {}) {
  await ensureSchema();
  const { rows } = await pool.query(
    `SELECT c.*,
            COALESCE(NULLIF(a.account_title, ''), a.name) AS account_name,
            a.bank_name,
            a.type AS account_type,
            a.currency AS account_currency,
            a.current_balance::float AS account_balance
     FROM cards c
     JOIN accounts a ON a.id = c.account_id
     WHERE c.user_id = $1 ${includeInactive ? '' : 'AND c.is_active = true'}
     ORDER BY c.created_at DESC`,
    [userId]
  );
  return rows;
}

async function listWithStats(userId, startDate, endDate) {
  await ensureSchema();
  const { rows } = await pool.query(
    `SELECT c.*,
            COALESCE(NULLIF(a.account_title, ''), a.name) AS account_name,
            a.bank_name,
            a.type AS account_type,
            a.currency AS account_currency,
            a.current_balance::float AS account_balance,
            COALESCE((
              SELECT ABS(SUM(t.amount))::float
              FROM transactions t
              WHERE t.card_id = c.id
                AND t.amount < 0
                AND t.date >= $2::date AND t.date <= $3::date
            ), 0) AS month_spent,
            COALESCE((
              SELECT COUNT(*)::int
              FROM transactions t
              WHERE t.card_id = c.id
            ), 0) AS tx_count
     FROM cards c
     JOIN accounts a ON a.id = c.account_id
     WHERE c.user_id = $1 AND c.is_active = true
     ORDER BY c.created_at DESC`,
    [userId, startDate, endDate]
  );
  return rows;
}

async function getById(userId, cardId) {
  await ensureSchema();
  const { rows } = await pool.query(
    `SELECT c.*,
            COALESCE(NULLIF(a.account_title, ''), a.name) AS account_name,
            a.bank_name,
            a.type AS account_type,
            a.currency AS account_currency,
            a.current_balance::float AS account_balance
     FROM cards c
     JOIN accounts a ON a.id = c.account_id
     WHERE c.id = $1 AND c.user_id = $2`,
    [cardId, userId]
  );
  return rows[0] || null;
}

async function create(userId, {
  accountId,
  cardName,
  cardholderName = '',
  cardType = 'debit',
  network = 'VISA',
  last4,
  expiry = '03/30',
  themeColor = 'lime',
  spendingLimit = null,
}) {
  await ensureSchema();
  const cleanLast4 = String(last4 || '').replace(/\D/g, '').slice(-4).padStart(4, '0');
  const validType = CARD_TYPES.includes(cardType) ? cardType : 'debit';
  const validNetwork = CARD_NETWORKS.includes(network) ? network : 'VISA';
  const validTheme = CARD_THEMES.includes(themeColor) ? themeColor : (validType === 'credit' ? 'slate' : 'lime');

  const { rows } = await pool.query(
    `INSERT INTO cards
       (user_id, account_id, card_name, cardholder_name, card_type, network, last4, expiry, theme_color, spending_limit)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      userId,
      accountId,
      String(cardName || `${validNetwork} ${validType === 'credit' ? 'Credit' : 'Debit'}`).trim(),
      String(cardholderName || '').trim(),
      validType,
      validNetwork,
      cleanLast4,
      String(expiry || '03/30').trim(),
      validTheme,
      spendingLimit !== null && spendingLimit !== '' ? Number(spendingLimit) : null,
    ]
  );
  return rows[0];
}

async function remove(userId, cardId) {
  await ensureSchema();
  const { rowCount } = await pool.query(
    'DELETE FROM cards WHERE id = $1 AND user_id = $2',
    [cardId, userId]
  );
  return rowCount > 0;
}

/**
 * Smart detection for card transactions:
 * 1. If explicit cardId is provided, validates it and sets paymentMethod ('debit_card' or 'credit_card') and accountId.
 * 2. If not provided, inspects account type, paymentMethod, and payee/note text for card patterns
 *    (e.g. "*7890", "POS", "VISA", "MASTERCARD", "CARD", "ATM") and automatically links the matching card.
 */
async function resolveCardAndPaymentMethod(client, userId, {
  accountId,
  cardId = null,
  paymentMethod = null,
  payee = '',
  note = '',
}) {
  await ensureSchema();

  if (cardId) {
    const { rows } = await client.query(
      'SELECT id, account_id, card_type FROM cards WHERE id = $1 AND user_id = $2',
      [cardId, userId]
    );
    if (rows.length) {
      const card = rows[0];
      return {
        accountId: accountId || card.account_id,
        cardId: card.id,
        paymentMethod: card.card_type === 'credit' ? 'credit_card' : 'debit_card',
      };
    }
  }

  // Load user's active cards and the target account type
  const [cardsRes, accountRes] = await Promise.all([
    client.query(
      'SELECT id, account_id, card_type, last4, network FROM cards WHERE user_id = $1 AND is_active = true ORDER BY created_at DESC',
      [userId]
    ),
    accountId
      ? client.query('SELECT id, type FROM accounts WHERE id = $1 AND user_id = $2', [accountId, userId])
      : Promise.resolve({ rows: [] }),
  ]);

  const userCards = cardsRes.rows;
  const account = accountRes.rows[0] || null;
  const combinedText = `${payee || ''} ${note || ''}`;

  // 1. Check if text explicitly mentions a 4-digit card suffix like *7890 or •••• 7890 or card 7890
  for (const c of userCards) {
    if (c.last4 && new RegExp(`(?:\\*|•|ending\\s+|card\\s+|#)${c.last4}\\b`, 'i').test(combinedText)) {
      return {
        accountId: accountId || c.account_id,
        cardId: c.id,
        paymentMethod: c.card_type === 'credit' ? 'credit_card' : 'debit_card',
      };
    }
  }

  const cardKeywordMatch = /\b(pos|visa|mastercard|paypak|unionpay|debit\s*card|credit\s*card|card\s*purchase|card\s*payment|swipe|contactless|atm\s*withdrawal)\b/i.test(combinedText);
  const explicitCardMethod = paymentMethod === 'debit_card' || paymentMethod === 'credit_card';
  const isCreditAccount = account && account.type === 'credit_card';
  const isCashAccount = account && account.type === 'cash';

  if (explicitCardMethod || cardKeywordMatch || isCreditAccount) {
    const accountCards = userCards.filter((c) => c.account_id === accountId);
    const desiredType =
      paymentMethod === 'credit_card' || isCreditAccount || /\bcredit\s*card\b/i.test(combinedText)
        ? 'credit'
        : 'debit';

    const matchedCard =
      accountCards.find((c) => c.card_type === desiredType) ||
      accountCards[0] ||
      null;

    if (matchedCard) {
      return {
        accountId,
        cardId: matchedCard.id,
        paymentMethod: matchedCard.card_type === 'credit' ? 'credit_card' : 'debit_card',
      };
    }

    return {
      accountId,
      cardId: null,
      paymentMethod: desiredType === 'credit' ? 'credit_card' : 'debit_card',
    };
  }

  if (paymentMethod === 'cash' || isCashAccount) {
    return { accountId, cardId: null, paymentMethod: 'cash' };
  }

  return {
    accountId,
    cardId: null,
    paymentMethod: paymentMethod || 'account',
  };
}

module.exports = {
  CARD_TYPES,
  CARD_NETWORKS,
  CARD_THEMES,
  ensureSchema,
  list,
  listWithStats,
  getById,
  create,
  remove,
  resolveCardAndPaymentMethod,
};
