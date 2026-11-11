CREATE INDEX IF NOT EXISTS idx_transactions_user_type_date
  ON transactions(user_id, transaction_type, date DESC)
  WHERE is_transfer = false AND debt_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_transaction_splits_transaction_category
  ON transaction_splits(transaction_id, category_id);
