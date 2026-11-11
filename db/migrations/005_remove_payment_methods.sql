ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_payment_method_check;

ALTER TABLE transactions
  DROP COLUMN IF EXISTS payment_method;
