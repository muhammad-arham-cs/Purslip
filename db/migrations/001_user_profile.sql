ALTER TABLE users
  ADD COLUMN IF NOT EXISTS full_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS phone_number TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS display_currency TEXT NOT NULL DEFAULT 'PKR',
  ADD COLUMN IF NOT EXISTS cnic TEXT NOT NULL DEFAULT '';

UPDATE users
SET full_name = COALESCE(NULLIF(full_name, ''), split_part(email::text, '@', 1)),
    country = COALESCE(country, ''),
    phone_number = COALESCE(phone_number, ''),
    display_currency = COALESCE(NULLIF(display_currency, ''), 'PKR'),
    cnic = COALESCE(cnic, '')
WHERE full_name IS NULL
   OR full_name = ''
   OR country IS NULL
   OR phone_number IS NULL
   OR display_currency IS NULL
   OR display_currency = ''
   OR cnic IS NULL;
