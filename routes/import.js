const express = require('express');
const multer = require('multer');

const accountsModel = require('../models/accounts');
const importMappingsModel = require('../models/importMappings');
const transactionsModel = require('../models/transactions');
const csvImport = require('../lib/csvImport');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.originalname.toLowerCase().endsWith('.csv')) {
      return cb(new csvImport.CsvImportError('Please upload a .csv file.'));
    }
    cb(null, true);
  },
});

function wizardState(req) {
  return req.session.importWizard;
}

router.get('/', async (req, res, next) => {
  try {
    const [accounts, mappings] = await Promise.all([
      accountsModel.list(req.session.user.id),
      importMappingsModel.list(req.session.user.id),
    ]);
    if (!accounts.length) {
      req.flash('error', 'You need an account before you can import transactions. Create one first.');
      return res.redirect('/accounts/new');
    }
    res.render('import/upload', { title: 'Import CSV', errors: [], accounts, mappings });
  } catch (err) {
    next(err);
  }
});

router.get('/upload', (req, res) => {
  res.redirect('/import');
});

router.post('/upload', (req, res, next) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      const [accounts, mappings] = await Promise.all([
        accountsModel.list(req.session.user.id),
        importMappingsModel.list(req.session.user.id),
      ]);
      return res.status(400).render('import/upload', {
        title: 'Import CSV',
        errors: [{ msg: err.message }],
        accounts,
        mappings,
      });
    }

    const rerender = async (errors) => {
      const [accounts, mappings] = await Promise.all([
        accountsModel.list(req.session.user.id),
        importMappingsModel.list(req.session.user.id),
      ]);
      res.status(400).render('import/upload', { title: 'Import CSV', errors, accounts, mappings });
    };

    if (!req.file) {
      return rerender([{ msg: 'Choose a CSV file to upload.' }]);
    }
    if (!req.body.accountId) {
      return rerender([{ msg: 'Choose an account.' }]);
    }

    try {
      const account = await accountsModel.getById(req.session.user.id, req.body.accountId);
      if (!account) {
        return rerender([{ msg: 'Account not found.' }]);
      }

      const parsed = csvImport.parseCsvBuffer(req.file.buffer);

      let savedMapping = null;
      if (req.body.mappingId) {
        savedMapping = await importMappingsModel.getById(req.session.user.id, req.body.mappingId);
      }

      req.session.importWizard = {
        accountId: req.body.accountId,
        sourceName: savedMapping ? savedMapping.source_name : (req.body.sourceName || '').trim() || 'Unnamed source',
        headers: parsed.headers,
        rawRows: parsed.rows,
        savedMapping: savedMapping || null,
      };

      res.redirect('/import/mapping');
    } catch (err2) {
      if (err2 instanceof csvImport.CsvImportError) {
        return rerender([{ msg: err2.message }]);
      }
      next(err2);
    }
  });
});

router.get('/mapping', (req, res) => {
  const state = wizardState(req);
  if (!state) {
    req.flash('error', 'Start a new import first.');
    return res.redirect('/import');
  }

  const saved = state.savedMapping;
  res.render('import/mapping', {
    title: 'Map CSV columns',
    errors: [],
    headers: state.headers,
    previewRows: state.rawRows.slice(0, 5),
    sourceName: state.sourceName,
    dateFormats: csvImport.DATE_FORMATS,
    values: saved
      ? {
          dateColumn: saved.column_mapping.dateColumn,
          descriptionColumn: saved.column_mapping.descriptionColumn,
          payeeColumn: saved.column_mapping.payeeColumn || '',
          dateFormat: saved.date_format,
          amountMode: saved.amount_mode,
          amountColumn: saved.column_mapping.amountColumn || '',
          debitColumn: saved.column_mapping.debitColumn || '',
          creditColumn: saved.column_mapping.creditColumn || '',
        }
      : { amountMode: 'single', dateFormat: csvImport.DATE_FORMATS[0] },
  });
});

router.post('/mapping', async (req, res, next) => {
  const state = wizardState(req);
  if (!state) {
    req.flash('error', 'Start a new import first.');
    return res.redirect('/import');
  }

  const mapping = {
    dateColumn: req.body.dateColumn,
    descriptionColumn: req.body.descriptionColumn,
    payeeColumn: req.body.payeeColumn || undefined,
    dateFormat: req.body.dateFormat,
    amountMode: req.body.amountMode,
    amountColumn: req.body.amountColumn || undefined,
    debitColumn: req.body.debitColumn || undefined,
    creditColumn: req.body.creditColumn || undefined,
  };

  const rerender = (errors) =>
    res.status(400).render('import/mapping', {
      title: 'Map CSV columns',
      errors,
      headers: state.headers,
      previewRows: state.rawRows.slice(0, 5),
      sourceName: state.sourceName,
      dateFormats: csvImport.DATE_FORMATS,
      values: mapping,
    });

  try {
    const mappedRows = csvImport.applyMapping(
      { headers: state.headers, rows: state.rawRows },
      mapping,
      state.accountId
    );

    const existingHashes = await transactionsModel.findExistingImportHashes(
      state.accountId,
      mappedRows.map((r) => r.importHash)
    );
    const flaggedRows = mappedRows.map((r) => ({ ...r, isDuplicate: existingHashes.has(r.importHash) }));

    await importMappingsModel.upsert(req.session.user.id, {
      sourceName: state.sourceName,
      columnMapping: mapping,
      dateFormat: mapping.dateFormat,
      amountMode: mapping.amountMode,
      defaultAccountId: state.accountId,
    });

    req.session.importWizard = { ...state, mapping, mappedRows: flaggedRows };
    res.redirect('/import/review');
  } catch (err) {
    if (err instanceof csvImport.CsvImportError) {
      return rerender([{ msg: err.message }]);
    }
    next(err);
  }
});

router.get('/review', async (req, res) => {
  const state = wizardState(req);
  if (!state || !state.mappedRows) {
    req.flash('error', 'Start a new import first.');
    return res.redirect('/import');
  }
  const account = await accountsModel.getById(req.session.user.id, state.accountId);
  res.render('import/review', {
    title: 'Review import',
    account,
    rows: state.mappedRows,
    duplicateCount: state.mappedRows.filter((r) => r.isDuplicate).length,
  });
});

router.post('/confirm', async (req, res, next) => {
  const state = wizardState(req);
  if (!state || !state.mappedRows) {
    req.flash('error', 'Start a new import first.');
    return res.redirect('/import');
  }

  try {
    // Never trust resubmitted row data from the client for financial values —
    // only the checkbox selection is client input; the actual date/amount for
    // each selected row always comes from what we already parsed server-side.
    const selectedIndexes = new Set(
      (Array.isArray(req.body.selectedRows) ? req.body.selectedRows : [req.body.selectedRows])
        .filter(Boolean)
        .map(Number)
    );
    const rowsToImport = state.mappedRows.filter((_, i) => selectedIndexes.has(i));

    if (!rowsToImport.length) {
      req.flash('error', 'Select at least one row to import.');
      return res.redirect('/import/review');
    }

    const result = await transactionsModel.bulkImport(
      req.session.user.id,
      state.accountId,
      rowsToImport.map((r) => ({ ...r, importSource: state.sourceName }))
    );

    delete req.session.importWizard;
    req.flash(
      'success',
      `Imported ${result.insertedCount} transaction(s).` +
        (result.skippedCount ? ` ${result.skippedCount} were skipped as duplicates.` : '')
    );
    res.redirect('/transactions');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
