const csvImport = require('../lib/csvImport');

describe('parseAmount', () => {
  it('parses a plain positive number', () => {
    expect(csvImport.parseAmount('42.50')).toBeCloseTo(42.5);
  });

  it('parses a currency-prefixed, comma-separated amount', () => {
    expect(csvImport.parseAmount('$1,234.56')).toBeCloseTo(1234.56);
  });

  it('treats parentheses as negative (common accounting export convention)', () => {
    expect(csvImport.parseAmount('(1,234.56)')).toBeCloseTo(-1234.56);
  });

  it('parses an explicit leading minus', () => {
    expect(csvImport.parseAmount('-42.50')).toBeCloseTo(-42.5);
  });

  it('treats blank as zero', () => {
    expect(csvImport.parseAmount('')).toBe(0);
  });
});

describe('parseDate', () => {
  it('parses MM/DD/YYYY', () => {
    expect(csvImport.parseDate('03/07/2026', 'MM/DD/YYYY')).toBe('2026-03-07');
  });

  it('parses DD/MM/YYYY', () => {
    expect(csvImport.parseDate('07/03/2026', 'DD/MM/YYYY')).toBe('2026-03-07');
  });

  it('parses ISO YYYY-MM-DD as-is', () => {
    expect(csvImport.parseDate('2026-03-07', 'YYYY-MM-DD')).toBe('2026-03-07');
  });

  it('rejects an unparseable date', () => {
    expect(() => csvImport.parseDate('not-a-date', 'YYYY-MM-DD')).toThrow(csvImport.CsvImportError);
  });
});

describe('parseCsvBuffer', () => {
  it('rejects a file with more rows than the configured maximum', () => {
    const header = 'Date,Description,Amount\n';
    const row = '2026-01-01,Test,1.00\n';
    const bigCsv = header + row.repeat(csvImport.MAX_ROWS + 1);
    expect(() => csvImport.parseCsvBuffer(Buffer.from(bigCsv))).toThrow(/more than/);
  });

  it('rejects an empty file', () => {
    expect(() => csvImport.parseCsvBuffer(Buffer.from(''))).toThrow(csvImport.CsvImportError);
  });
});

describe('applyMapping — proves the mapping is flexible across differently-shaped bank exports', () => {
  it('handles Format A: Date,Description,Amount (MM/DD/YYYY, single signed amount column)', () => {
    const csv = 'Date,Description,Amount\n03/15/2026,Coffee Shop,-4.50\n03/16/2026,Paycheck,1500.00\n';
    const parsed = csvImport.parseCsvBuffer(Buffer.from(csv));
    const rows = csvImport.applyMapping(
      parsed,
      {
        dateColumn: 'Date',
        descriptionColumn: 'Description',
        dateFormat: 'MM/DD/YYYY',
        amountMode: 'single',
        amountColumn: 'Amount',
      },
      'acct-a'
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ date: '2026-03-15', amount: -4.5, payee: 'Coffee Shop' });
    expect(rows[1]).toMatchObject({ date: '2026-03-16', amount: 1500, payee: 'Paycheck' });
  });

  it('handles Format B: Transaction Date,Payee,Debit,Credit (DD/MM/YYYY, different column order, split debit/credit)', () => {
    const csv =
      'Transaction Date,Payee,Debit,Credit\n15/03/2026,Coffee Shop,4.50,\n16/03/2026,Paycheck,,1500.00\n';
    const parsed = csvImport.parseCsvBuffer(Buffer.from(csv));
    const rows = csvImport.applyMapping(
      parsed,
      {
        dateColumn: 'Transaction Date',
        descriptionColumn: 'Payee',
        dateFormat: 'DD/MM/YYYY',
        amountMode: 'debit_credit',
        debitColumn: 'Debit',
        creditColumn: 'Credit',
      },
      'acct-b'
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ date: '2026-03-15', amount: -4.5, payee: 'Coffee Shop' });
    expect(rows[1]).toMatchObject({ date: '2026-03-16', amount: 1500, payee: 'Paycheck' });
  });

  it('produces the same import hash for the same account+date+amount+description regardless of format', () => {
    const csvA = 'Date,Description,Amount\n03/15/2026,Coffee Shop,-4.50\n';
    const rowsA = csvImport.applyMapping(
      csvImport.parseCsvBuffer(Buffer.from(csvA)),
      { dateColumn: 'Date', descriptionColumn: 'Description', dateFormat: 'MM/DD/YYYY', amountMode: 'single', amountColumn: 'Amount' },
      'same-account'
    );

    const csvB = 'Transaction Date,Payee,Debit,Credit\n15/03/2026,Coffee Shop,4.50,\n';
    const rowsB = csvImport.applyMapping(
      csvImport.parseCsvBuffer(Buffer.from(csvB)),
      { dateColumn: 'Transaction Date', descriptionColumn: 'Payee', dateFormat: 'DD/MM/YYYY', amountMode: 'debit_credit', debitColumn: 'Debit', creditColumn: 'Credit' },
      'same-account'
    );

    expect(rowsA[0].importHash).toBe(rowsB[0].importHash);
  });
});
