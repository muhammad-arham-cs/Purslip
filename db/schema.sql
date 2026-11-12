-- Purslip database schema
-- Designed up front (Phase 0) to cover every entity in the full feature set,
-- even though routes/logic for later phases (budgets, recurring, goals, import)
-- land incrementally. This avoids painful migrations later.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;   -- case-insensitive email column
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- free-text search on payee/note

-- ---------------------------------------------------------------------------
-- Generic updated_at trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Sessions (connect-pg-simple standard table)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "session" (
  "sid" varchar NOT NULL COLLATE "default" PRIMARY KEY,
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email CITEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  phone_number TEXT NOT NULL DEFAULT '',
  cnic TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  reset_token TEXT,
  reset_token_expires TIMESTAMPTZ,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  display_currency TEXT NOT NULL DEFAULT 'PKR',
  exchange_rates JSONB NOT NULL DEFAULT '{"PKR": 1, "USD": 1}'::jsonb,
  language TEXT NOT NULL DEFAULT 'en',
  theme TEXT NOT NULL DEFAULT 'dark',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------
CREATE TYPE account_type AS ENUM ('checking', 'savings', 'credit_card', 'cash', 'investment', 'other');

CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  account_title TEXT NOT NULL DEFAULT '',
  bank_name TEXT NOT NULL DEFAULT '',
  type account_type NOT NULL DEFAULT 'checking',
  currency TEXT NOT NULL DEFAULT 'PKR',
  opening_balance NUMERIC(14, 2) NOT NULL DEFAULT 0,
  current_balance NUMERIC(14, 2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_accounts_user_id ON accounts(user_id);
CREATE INDEX idx_accounts_user_active_order ON accounts(user_id, is_active, display_order, created_at);

CREATE TRIGGER trg_accounts_updated_at BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Linked Cards (Debit & Credit cards linked to Accounts)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Categories (custom, with subcategories via self-reference)
-- ---------------------------------------------------------------------------
CREATE TYPE category_kind AS ENUM ('income', 'expense');

CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES categories(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  kind category_kind NOT NULL DEFAULT 'expense',
  rollover BOOLEAN NOT NULL DEFAULT false,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, parent_id, name)
);

CREATE INDEX idx_categories_user_id ON categories(user_id);
CREATE INDEX idx_categories_parent_id ON categories(parent_id);

CREATE TRIGGER trg_categories_updated_at BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TYPE debt_direction AS ENUM ('lent', 'borrowed');

CREATE TABLE debts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  person_name TEXT NOT NULL,
  direction debt_direction NOT NULL,
  principal NUMERIC(14, 2) NOT NULL CHECK (principal > 0),
  currency TEXT NOT NULL DEFAULT 'PKR',
  note TEXT,
  is_settled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_debts_user_status ON debts(user_id, is_settled, created_at DESC);

-- ---------------------------------------------------------------------------
-- Transactions
-- A transaction always has one or more transaction_splits rows (see below) --
-- there is no category_id directly on transactions. A "normal" transaction
-- just has a single split covering the full amount. This keeps split and
-- non-split transactions on one code path for reporting.
--
-- Transfers are modeled as two linked transactions (one per account), both
-- flagged is_transfer = true and sharing the same transfer_group_id. Reports
-- exclude is_transfer = true from income/expense totals.
-- ---------------------------------------------------------------------------
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  amount NUMERIC(14, 2) NOT NULL, -- positive = inflow, negative = outflow
  transaction_type TEXT
    CHECK (transaction_type IN ('income', 'expense', 'neither')),
  payee TEXT,
  note TEXT,
  card_id UUID REFERENCES cards(id) ON DELETE SET NULL,
  payment_method TEXT NOT NULL DEFAULT 'account',
  debt_id UUID REFERENCES debts(id) ON DELETE SET NULL,
  is_transfer BOOLEAN NOT NULL DEFAULT false,
  transfer_group_id UUID,
  import_source TEXT,
  import_hash TEXT, -- dedupe fingerprint: hash(account_id, date, amount, description)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_account_id ON transactions(account_id);
CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_transactions_user_date ON transactions(user_id, date DESC, created_at DESC);
CREATE INDEX idx_transactions_user_account_date ON transactions(user_id, account_id, date DESC);
CREATE INDEX idx_transactions_transfer_group_id ON transactions(transfer_group_id);
CREATE UNIQUE INDEX idx_transactions_import_dedupe ON transactions(account_id, import_hash) WHERE import_hash IS NOT NULL;
-- Free-text search across payee/note
CREATE INDEX idx_transactions_payee_trgm ON transactions USING gin (payee gin_trgm_ops);
CREATE INDEX idx_transactions_note_trgm ON transactions USING gin (note gin_trgm_ops);

CREATE TRIGGER trg_transactions_updated_at BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE debt_repayments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debt_id UUID NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
  transaction_id UUID UNIQUE REFERENCES transactions(id) ON DELETE CASCADE,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_debt_repayments_debt_id ON debt_repayments(debt_id);

-- ---------------------------------------------------------------------------
-- Transaction splits (one-to-many; sum of amounts must equal parent amount,
-- validated at the application layer on write since a cross-row CHECK
-- constraint isn't expressible directly in Postgres).
-- ---------------------------------------------------------------------------
CREATE TABLE transaction_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE RESTRICT,
  amount NUMERIC(14, 2) NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_transaction_splits_transaction_id ON transaction_splits(transaction_id);
CREATE INDEX idx_transaction_splits_transaction_category ON transaction_splits(transaction_id, category_id);
CREATE INDEX idx_transaction_splits_category_id ON transaction_splits(category_id);

-- ---------------------------------------------------------------------------
-- Budgets (per category, per month)
-- ---------------------------------------------------------------------------
CREATE TABLE budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  month DATE NOT NULL, -- always stored as first-of-month
  amount NUMERIC(14, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (category_id, month)
);

CREATE INDEX idx_budgets_user_id ON budgets(user_id);
CREATE INDEX idx_budgets_month ON budgets(month);

CREATE TRIGGER trg_budgets_updated_at BEFORE UPDATE ON budgets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Recurring transaction templates
-- ---------------------------------------------------------------------------
CREATE TYPE recurrence_frequency AS ENUM ('daily', 'weekly', 'biweekly', 'monthly', 'yearly', 'custom_days');

CREATE TABLE recurring_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE RESTRICT,
  payee TEXT,
  note TEXT,
  amount NUMERIC(14, 2) NOT NULL,
  frequency recurrence_frequency NOT NULL,
  custom_interval_days INTEGER, -- only used when frequency = 'custom_days'
  start_date DATE NOT NULL,
  end_date DATE,
  next_run_date DATE NOT NULL,
  last_generated_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_recurring_user_id ON recurring_transactions(user_id);
CREATE INDEX idx_recurring_next_run_date ON recurring_transactions(next_run_date) WHERE is_active = true;

CREATE TRIGGER trg_recurring_updated_at BEFORE UPDATE ON recurring_transactions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Links a generated transaction back to the recurring template that created
-- it, so generation can be idempotent (never double-generate for a date).
CREATE TABLE recurring_transaction_occurrences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recurring_transaction_id UUID NOT NULL REFERENCES recurring_transactions(id) ON DELETE CASCADE,
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  occurrence_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (recurring_transaction_id, occurrence_date)
);

-- ---------------------------------------------------------------------------
-- Goals
-- ---------------------------------------------------------------------------
CREATE TABLE goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_amount NUMERIC(14, 2) NOT NULL,
  starting_balance NUMERIC(14, 2) NOT NULL DEFAULT 0,
  target_date DATE,
  is_achieved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_goals_user_id ON goals(user_id);
CREATE INDEX idx_goals_account_id ON goals(account_id);

CREATE TRIGGER trg_goals_updated_at BEFORE UPDATE ON goals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- CSV import mappings (saved per named source/bank so they're reusable)
-- ---------------------------------------------------------------------------
CREATE TABLE import_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_name TEXT NOT NULL,
  column_mapping JSONB NOT NULL, -- { date: "Posted Date", amount: "Amount", description: "Description", ... }
  date_format TEXT NOT NULL DEFAULT 'YYYY-MM-DD',
  amount_mode TEXT NOT NULL DEFAULT 'single', -- 'single' (signed amount column) | 'debit_credit' (separate columns)
  default_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, source_name)
);

CREATE TRIGGER trg_import_mappings_updated_at BEFORE UPDATE ON import_mappings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
