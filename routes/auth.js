const express = require('express');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');

const users = require('../models/users');
const { redirectIfAuthenticated } = require('../middleware/auth');
const { sendPasswordResetEmail } = require('../lib/mailer');
const { authLimiter, loginLimiter } = require('../middleware/rateLimit');

const router = express.Router();

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

router.use((req, res, next) => {
  if (req.method === 'POST') return authLimiter(req, res, next);
  return next();
});

router.get('/signup', redirectIfAuthenticated, (req, res) => {
  res.render('auth/signup', { title: 'Sign up', errors: [], values: { displayCurrency: 'PKR' } });
});

router.post(
  '/signup',
  redirectIfAuthenticated,
  [
    body('fullName').optional({ checkFalsy: true }).trim().isLength({ max: 100 }).withMessage('Name is too long.'),
    body('country').optional({ checkFalsy: true }).trim().isLength({ max: 80 }).withMessage('Country is too long.'),
    body('phoneNumber').optional({ checkFalsy: true }).trim().isLength({ min: 7, max: 30 }).withMessage('Enter a valid phone number.'),
    body('displayCurrency').optional({ checkFalsy: true }).trim().isAlpha().isLength({ min: 3, max: 3 }).withMessage('Choose a 3-letter currency code.').toUpperCase(),
    body('cnic').optional({ checkFalsy: true }).trim().isLength({ min: 5, max: 30 }).withMessage('Enter a valid CNIC.'),
    body('email').isEmail().withMessage('Enter a valid email address.').normalizeEmail(),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters.'),
    body('passwordConfirm').custom((value, { req }) => value === req.body.password)
      .withMessage('Passwords do not match.'),
  ],
  async (req, res, next) => {
    const result = validationResult(req);
    if (!result.isEmpty()) {
      return res.status(400).render('auth/signup', {
        title: 'Sign up',
        errors: result.array(),
        values: req.body,
      });
    }

    try {
      const existing = await users.findByEmail(req.body.email);
      if (existing) {
        return res.status(400).render('auth/signup', {
          title: 'Sign up',
          errors: [{ msg: 'An account with that email already exists.' }],
          values: req.body,
        });
      }

      await users.createUser(req.body.email, req.body.password, {
        fullName: req.body.fullName,
        country: req.body.country,
        phoneNumber: req.body.phoneNumber,
        displayCurrency: req.body.displayCurrency,
        cnic: req.body.cnic,
      });
      req.flash('success', 'Account created. Log in to continue.');
      res.redirect('/auth/login');
    } catch (err) {
      if (err.code === '23505' && err.constraint === 'users_email_key') {
        return res.status(400).render('auth/signup', {
          title: 'Sign up',
          errors: [{ msg: 'An account with that email already exists.' }],
          values: req.body,
        });
      }
      next(err);
    }
  }
);

router.get('/login', redirectIfAuthenticated, (req, res) => {
  const errors = req.query.expired === '1'
    ? [{ msg: 'Your session expired after 5 minutes of inactivity. Please log in again.' }]
    : [];
  res.render('auth/login', { title: 'Log in', errors, values: {}, cooldownSeconds: 0 });
});

router.post(
  '/login',
  redirectIfAuthenticated,
  loginLimiter,
  [body('email').isEmail().normalizeEmail(), body('password').notEmpty()],
  async (req, res, next) => {
    const result = validationResult(req);
    const rateRemaining = typeof req.rateLimit?.remaining === 'number' ? req.rateLimit.remaining : null;
    const invalidCredsResponse = (attemptsRemaining = rateRemaining) =>
      res.status(400).render('auth/login', {
        title: 'Log in',
        errors: [{ msg: 'Invalid email or password.' }],
        values: { email: req.body.email },
        cooldownSeconds: 0,
        attemptsRemaining,
      });

    if (!result.isEmpty()) {
      return invalidCredsResponse();
    }

    try {
      const user = await users.findByEmail(req.body.email);
      if (!user) {
        return invalidCredsResponse();
      }

      const { locked, retryAfterMs } = users.lockStatus(user);
      if (locked) {
        const retryAfterSec = Math.max(1, Math.ceil(retryAfterMs / 1000));
        const minutes = Math.ceil(retryAfterMs / 60000);
        res.setHeader('Retry-After', String(retryAfterSec));
        return res.status(429).render('auth/login', {
          title: 'Log in',
          errors: [{ msg: `Account temporarily locked after 5 failed attempts. Try again in ${minutes} minute(s) (${retryAfterSec}s).` }],
          values: { email: req.body.email },
          cooldownSeconds: retryAfterSec,
        });
      }

      const validPassword = await users.verifyPassword(user, req.body.password);
      if (!validPassword) {
        await users.registerFailedLogin(user);
        const remaining = Math.max(0, users.MAX_FAILED_ATTEMPTS - (Number(user.failed_login_attempts || 0) + 1));
        return invalidCredsResponse(remaining);
      }

      await users.resetFailedLogins(user.id);
      if (req.rateLimit && typeof loginLimiter.resetKey === 'function') {
        const emailKey = `${req.ip || 'unknown'}:${String(req.body?.email || '').toLowerCase().trim()}`;
        loginLimiter.resetKey(emailKey);
      }

      req.session.regenerate((err) => {
        if (err) return next(err);
        req.session.user = { id: user.id, email: user.email };
        req.session.lastActivityAt = Date.now();
        res.redirect('/dashboard');
      });
    } catch (err) {
      next(err);
    }
  }
);

router.delete('/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('purslip.sid');
    res.redirect('/');
  });
});

router.get('/forgot-password', redirectIfAuthenticated, (req, res) => {
  res.render('auth/forgot-password', { title: 'Forgot password', errors: [], values: {} });
});

router.post(
  '/forgot-password',
  redirectIfAuthenticated,
  [
    body('email').isEmail().normalizeEmail(),
    body('cnic').trim().isLength({ min: 5, max: 30 }).withMessage('Enter your CNIC.'),
  ],
  async (req, res, next) => {
    // Always respond the same way whether or not the email exists, to avoid
    // leaking which emails have accounts.
    const genericSuccess = () => {
      req.flash('success', 'If the details match an account, you can now choose a new password.');
      res.redirect('/auth/login');
    };

    const result = validationResult(req);
    if (!result.isEmpty()) {
      return genericSuccess();
    }

    try {
      const user = await users.findByEmail(req.body.email);
      if (user && user.cnic && user.cnic === req.body.cnic.trim()) {
        const token = crypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
        await users.setResetToken(user.email, token, expires);
        const resetUrl = `${req.protocol}://${req.get('host')}/auth/reset-password/${token}`;
        await sendPasswordResetEmail(user.email, resetUrl);
        return res.redirect(`/auth/reset-password/${token}`);
      }
      genericSuccess();
    } catch (err) {
      next(err);
    }
  }
);

router.get('/reset-password/:token', redirectIfAuthenticated, async (req, res, next) => {
  try {
    const user = await users.findByResetToken(req.params.token);
    if (!user) {
      req.flash('error', 'That reset link is invalid or has expired.');
      return res.redirect('/auth/forgot-password');
    }
    res.render('auth/reset-password', { title: 'Reset password', errors: [], token: req.params.token });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/reset-password/:token',
  redirectIfAuthenticated,
  [
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters.'),
    body('passwordConfirm').custom((value, { req }) => value === req.body.password)
      .withMessage('Passwords do not match.'),
  ],
  async (req, res, next) => {
    const result = validationResult(req);
    if (!result.isEmpty()) {
      return res.status(400).render('auth/reset-password', {
        title: 'Reset password',
        errors: result.array(),
        token: req.params.token,
      });
    }

    try {
      const user = await users.findByResetToken(req.params.token);
      if (!user) {
        req.flash('error', 'That reset link is invalid or has expired.');
        return res.redirect('/auth/forgot-password');
      }

      await users.updatePassword(user.id, req.body.password);
      req.flash('success', 'Password updated. You can now log in.');
      res.redirect('/auth/login');
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
