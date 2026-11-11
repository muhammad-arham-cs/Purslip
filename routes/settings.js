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
    const profile = await users.getProfile(req.session.user.id);
    res.render('settings/index', {
      title: 'Settings',
      profile,
      maskedCnic: users.maskCnic(profile.cnic),
      revealedCnic: null,
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
      res.status(400);
      return loadSettings(req, res, {
        preferences: {
          display_currency: req.body.displayCurrency,
          exchange_rates: rates,
          language: req.body.language,
          theme: req.body.theme,
        },
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

async function loadSettings(req, res, overrides = {}) {
  const [preferences, profile] = await Promise.all([
    users.getPreferences(req.session.user.id),
    users.getProfile(req.session.user.id),
  ]);
  return res.render('settings/index', {
    title: 'Settings',
    preferences,
    profile,
    maskedCnic: users.maskCnic(profile.cnic),
    revealedCnic: null,
    supportedCurrencies,
    supportedLanguages,
    supportedThemes,
    errors: [],
    ...overrides,
  });
}

async function requireCurrentPassword(req) {
  const user = await users.findByEmail(req.session.user.email);
  return user && users.verifyPassword(user, req.body.currentPassword || '');
}

router.post(
  '/profile',
  [
    body('fullName').trim().isLength({ min: 1, max: 100 }).withMessage('Enter your name.'),
    body('country').trim().isLength({ min: 1, max: 80 }).withMessage('Enter your country.'),
    body('phoneNumber').trim().isLength({ min: 7, max: 30 }).withMessage('Enter a valid phone number.'),
    body('currentPassword').notEmpty().withMessage('Enter your current password to save profile changes.'),
  ],
  async (req, res, next) => {
    const result = validationResult(req);
    if (!result.isEmpty()) return loadSettings(req, res, { errors: result.array() });
    try {
      if (!await requireCurrentPassword(req)) {
        return loadSettings(req, res, { errors: [{ msg: 'Current password is incorrect.' }] });
      }
      await users.updateProfile(req.session.user.id, req.body);
      req.flash('success', 'Personal information updated.');
      return res.redirect('/settings');
    } catch (err) {
      return next(err);
    }
  }
);

router.post('/profile/reveal-cnic', async (req, res, next) => {
  try {
    if (!await requireCurrentPassword(req)) {
      return loadSettings(req, res, { errors: [{ msg: 'Current password is incorrect.' }] });
    }
    const profile = await users.getProfile(req.session.user.id);
    return loadSettings(req, res, { revealedCnic: profile.cnic });
  } catch (err) {
    return next(err);
  }
});

router.post(
  '/security/password',
  [
    body('cnic').trim().notEmpty().withMessage('Enter your CNIC.'),
    body('currentPassword').notEmpty().withMessage('Enter your current password.'),
    body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters.'),
    body('passwordConfirm').custom((value, { req }) => value === req.body.newPassword)
      .withMessage('Passwords do not match.'),
  ],
  async (req, res, next) => {
    const result = validationResult(req);
    if (!result.isEmpty()) return loadSettings(req, res, { errors: result.array() });
    try {
      const profile = await users.getProfile(req.session.user.id);
      if (!profile || profile.cnic !== req.body.cnic.trim() || !await requireCurrentPassword(req)) {
        return loadSettings(req, res, { errors: [{ msg: 'CNIC or current password is incorrect.' }] });
      }
      await users.updatePassword(profile.id, req.body.newPassword);
      req.flash('success', 'Password changed. Please log in again next time.');
      return res.redirect('/settings');
    } catch (err) {
      return next(err);
    }
  }
);

router.post(
  '/security/email',
  [
    body('email').isEmail().normalizeEmail().withMessage('Enter a valid email address.'),
    body('currentPassword').notEmpty().withMessage('Enter your current password.'),
  ],
  async (req, res, next) => {
    const result = validationResult(req);
    if (!result.isEmpty()) return loadSettings(req, res, { errors: result.array() });
    try {
      if (!await requireCurrentPassword(req)) {
        return loadSettings(req, res, { errors: [{ msg: 'Current password is incorrect.' }] });
      }
      const updated = await users.updateEmail(req.session.user.id, req.body.email);
      req.session.user.email = updated.email;
      req.flash('success', 'Email address updated.');
      return res.redirect('/settings');
    } catch (err) {
      if (err.code === '23505' && err.constraint === 'users_email_key') {
        return loadSettings(req, res, { errors: [{ msg: 'An account with that email already exists.' }] });
      }
      return next(err);
    }
  }
);

router.post(
  '/delete-account',
  [
    body('currentPassword').notEmpty().withMessage('Enter your current password.'),
    body('confirmation').equals('DELETE').withMessage('Type DELETE to confirm account deletion.'),
  ],
  async (req, res, next) => {
    const result = validationResult(req);
    if (!result.isEmpty()) return loadSettings(req, res, { errors: result.array() });
    try {
      if (!await requireCurrentPassword(req)) {
        return loadSettings(req, res, { errors: [{ msg: 'Current password is incorrect.' }] });
      }
      const deleted = await users.deleteUser(req.session.user.id);
      if (!deleted) return loadSettings(req, res, { errors: [{ msg: 'Account could not be deleted.' }] });
      return req.session.destroy((err) => {
        if (err) return next(err);
        res.clearCookie('purslip.sid');
        return res.redirect('/');
      });
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;
