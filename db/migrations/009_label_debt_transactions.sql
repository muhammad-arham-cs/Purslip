UPDATE transactions t
SET payee = 'Debt: ' || d.person_name
FROM debts d
WHERE t.debt_id = d.id
  AND (t.payee IS NULL OR btrim(t.payee) = '');
