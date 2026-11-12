-- Linked debit & credit cards per account + card transaction tracking

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

