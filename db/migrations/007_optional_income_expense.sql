ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS transaction_type TEXT;

UPDATE transactions
SET transaction_type = CASE WHEN amount >= 0 THEN 'income' ELSE 'expense' END
WHERE transaction_type IS NULL;

ALTER TABLE transactions
  ALTER COLUMN transaction_type DROP DEFAULT,
  ALTER COLUMN transaction_type DROP NOT NULL;

ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_transaction_type_check;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_transaction_type_check
  CHECK (transaction_type IN ('income', 'expense', 'neither'));
