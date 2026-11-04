const crypto = require('crypto');
const { parse } = require('csv-parse/sync');

class CsvImportError extends Error {}

const MAX_ROWS = 5000;

// Bank CSV exports disagree on date order (MM/DD/YYYY vs DD/MM/YYYY vs
// ISO), so rather than guess, the user picks the format explicitly in the
// mapping step. Each entry maps a UI value to a parser.
const DATE_FORMATS = {
  'YYYY-MM-DD': (s) => s,
  'MM/DD/YYYY': (s) => {
    const [m, d, y] = s.split('/');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  },
  'DD/MM/YYYY': (s) => {
    const [d, m, y] = s.split('/');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  },
  'MM-DD-YYYY': (s) => {
    const [m, d, y] = s.split('-');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  },
};

function parseDate(raw, dateFormat) {
  const parser = DATE_FORMATS[dateFormat];
  if (!parser) {
    throw new CsvImportError(`Unknown date format: ${dateFormat}`);
  }
  const iso = parser(raw.trim());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || Number.isNaN(Date.parse(iso))) {
    throw new CsvImportError(`Could not parse date "${raw}" as ${dateFormat}.`);
  }
  return iso;
}

// Handles common bank export quirks: currency symbols, thousands commas, and
// parentheses used to mean negative (e.g. "(1,234.56)" => -1234.56).
function parseAmount(raw) {
  if (raw === undefined || raw === null || raw.trim() === '') return 0;
  let s = raw.trim();
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[^0-9.\-]/g, '');
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  }
  const value = parseFloat(s || '0');
  if (Number.isNaN(value)) {
    throw new CsvImportError(`Could not parse amount "${raw}".`);
  }
  return negative ? -value : value;
}

function parseCsvBuffer(buffer) {
  let records;
  try {
    records = parse(buffer, { columns: false, skip_empty_lines: true, bom: true, relax_column_count: true });
  } catch (err) {
    throw new CsvImportError(`Could not parse CSV file: ${err.message}`);
  }
  if (!records.length) {
    throw new CsvImportError('The file has no rows.');
  }
  if (records.length - 1 > MAX_ROWS) {
    throw new CsvImportError(`This file has more than ${MAX_ROWS} rows — split it into smaller files.`);
  }

  const [headerRow, ...dataRows] = records;
  return { headers: headerRow.map((h) => String(h).trim()), rows: dataRows };
}

function computeImportHash(accountId, date, amount, description) {
  const normalized = `${accountId}|${date}|${Number(amount).toFixed(2)}|${(description || '').trim().toLowerCase()}`;
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

// mapping: { dateColumn, descriptionColumn, payeeColumn?, dateFormat,
//            amountMode: 'single' | 'debit_credit',
//            amountColumn?, debitColumn?, creditColumn? }
function applyMapping({ headers, rows }, mapping, accountId) {
  const colIndex = (name) => headers.indexOf(name);
  const dateIdx = colIndex(mapping.dateColumn);
  const descIdx = colIndex(mapping.descriptionColumn);
  const payeeIdx = mapping.payeeColumn ? colIndex(mapping.payeeColumn) : -1;

  if (dateIdx === -1) throw new CsvImportError('Date column not found in file.');
  if (descIdx === -1) throw new CsvImportError('Description column not found in file.');

  let amountIdx = -1;
  let debitIdx = -1;
  let creditIdx = -1;
  if (mapping.amountMode === 'debit_credit') {
    debitIdx = colIndex(mapping.debitColumn);
    creditIdx = colIndex(mapping.creditColumn);
    if (debitIdx === -1 || creditIdx === -1) {
      throw new CsvImportError('Debit/credit columns not found in file.');
    }
  } else {
    amountIdx = colIndex(mapping.amountColumn);
    if (amountIdx === -1) throw new CsvImportError('Amount column not found in file.');
  }

  return rows.map((row, i) => {
    const date = parseDate(row[dateIdx], mapping.dateFormat);
    const description = (row[descIdx] || '').trim();
    const payee = payeeIdx !== -1 ? (row[payeeIdx] || '').trim() : description;

    let amount;
    if (mapping.amountMode === 'debit_credit') {
      const debit = parseAmount(row[debitIdx]);
      const credit = parseAmount(row[creditIdx]);
      amount = credit - Math.abs(debit);
    } else {
      amount = parseAmount(row[amountIdx]);
    }

    return {
      rowNumber: i + 2, // +1 for header, +1 for 1-indexing
      date,
      amount,
      payee,
      note: description !== payee ? description : undefined,
      importHash: computeImportHash(accountId, date, amount, description),
    };
  });
}

module.exports = {
  CsvImportError,
  DATE_FORMATS: Object.keys(DATE_FORMATS),
  MAX_ROWS,
  parseCsvBuffer,
  applyMapping,
  parseAmount,
  parseDate,
  computeImportHash,
};
