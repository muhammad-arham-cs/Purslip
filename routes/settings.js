const express = require('express');
const { body, validationResult } = require('express-validator');

const users = require('../models/users');
const { normalizeRates } = require('../lib/currency');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const supportedCurrencies = ['PKR', 'USD', 'EUR', 'GBP'];
const supportedLanguages = ['en', 'ur'];
const supportedThemes = ['light', 'dark', 'night'];

router.get('/', async (req, res, next) => {
  try {
    const preferences = await users.getPreferences(req.session.user.id);
    res.render('settings/index', {
      title: 'Settings',
      preferences,
      supportedCurrencies,
      supportedLanguages,
      supportedThemes,
      errors: [],
    });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  body('displayCurrency').isIn(supportedCurrencies).withMessage('Choose a supported display currency.'),
  body('ratePKR').isFloat({ gt: 0 }).withMessage('PKR rate must be greater than zero.'),
  body('rateUSD').isFloat({ gt: 0 }).withMessage('USD rate must be greater than zero.'),
  body('rateEUR').isFloat({ gt: 0 }).withMessage('EUR rate must be greater than zero.'),
  body('rateGBP').isFloat({ gt: 0 }).withMessage('GBP rate must be greater than zero.'),
  body('language').isIn(supportedLanguages).withMessage('Choose a supported language.'),
  body('theme').isIn(supportedThemes).withMessage('Choose a supported theme.'),
  async (req, res, next) => {
    const result = validationResult(req);
    const rates = normalizeRates({
      PKR: req.body.ratePKR,
      USD: req.body.rateUSD,
      EUR: req.body.rateEUR,
      GBP: req.body.rateGBP,
    });
    if (!result.isEmpty()) {
      return res.status(400).render('settings/index', {
        title: 'Settings',
        preferences: {
          display_currency: req.body.displayCurrency,
          exchange_rates: rates,
          language: req.body.language,
          theme: req.body.theme,
        },
        supportedCurrencies,
        supportedLanguages,
        supportedThemes,
        errors: result.array(),
      });
    }
    try {
      const updated = await users.updatePreferences(req.session.user.id, {
        displayCurrency: req.body.displayCurrency,
        exchangeRates: rates,
        language: req.body.language,
        theme: req.body.theme,
      });
      req.session.preferences = updated;
      req.flash('success', 'Currency settings updated.');
      res.redirect('/settings');
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
