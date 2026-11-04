CREATE INDEX IF NOT EXISTS idx_transactions_user_date
  ON transactions(user_id, date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_user_account_date
  ON transactions(user_id, account_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_transaction_splits_transaction_category
  ON transaction_splits(transaction_id, category_id);

CREATE INDEX IF NOT EXISTS idx_accounts_user_active_order
  ON accounts(user_id, is_active, display_order, created_at);
