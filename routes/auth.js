const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');

const users = require('../models/users');
const { redirectIfAuthenticated } = require('../middleware/auth');
const { sendPasswordResetEmail } = require('../lib/mailer');

const router = express.Router();

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

// First line of defense against brute force: caps attempts per-IP regardless
// of which account is targeted. Per-account lockout (models/users.js) is the
// second line, since a distributed attacker could spread attempts across IPs.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many login attempts from this network. Try again later.',
});

router.get('/signup', redirectIfAuthenticated, (req, res) => {
  res.render('auth/signup', { title: 'Sign up', errors: [], values: {} });
});

router.post(
  '/signup',
  redirectIfAuthenticated,
  [
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
        values: { email: req.body.email },
      });
    }

    try {
      const existing = await users.findByEmail(req.body.email);
      if (existing) {
        return res.status(400).render('auth/signup', {
          title: 'Sign up',
          errors: [{ msg: 'An account with that email already exists.' }],
          values: { email: req.body.email },
        });
      }

      const user = await users.createUser(req.body.email, req.body.password);

      req.session.regenerate((err) => {
        if (err) return next(err);
        req.session.user = { id: user.id, email: user.email };
        req.flash('success', 'Welcome to Purslip!');
        res.redirect('/dashboard');
      });
    } catch (err) {
      next(err);
    }
  }
);

router.get('/login', redirectIfAuthenticated, (req, res) => {
  res.render('auth/login', { title: 'Log in', errors: [], values: {} });
});

router.post(
  '/login',
  redirectIfAuthenticated,
  loginLimiter,
  [body('email').isEmail().normalizeEmail(), body('password').notEmpty()],
  async (req, res, next) => {
    const result = validationResult(req);
    const invalidCredsResponse = () =>
      res.status(400).render('auth/login', {
        title: 'Log in',
        errors: [{ msg: 'Invalid email or password.' }],
        values: { email: req.body.email },
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
        const minutes = Math.ceil(retryAfterMs / 60000);
        return res.status(429).render('auth/login', {
          title: 'Log in',
          errors: [{ msg: `Account temporarily locked. Try again in ${minutes} minute(s).` }],
          values: { email: req.body.email },
        });
      }

      const validPassword = await users.verifyPassword(user, req.body.password);
      if (!validPassword) {
        await users.registerFailedLogin(user);
        return invalidCredsResponse();
      }

      await users.resetFailedLogins(user.id);

      req.session.regenerate((err) => {
        if (err) return next(err);
        req.session.user = { id: user.id, email: user.email };
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
  res.render('auth/forgot-password', { title: 'Forgot password', errors: [] });
});

router.post(
  '/forgot-password',
  redirectIfAuthenticated,
  [body('email').isEmail().normalizeEmail()],
  async (req, res, next) => {
    // Always respond the same way whether or not the email exists, to avoid
    // leaking which emails have accounts.
    const genericSuccess = () => {
      req.flash(
        'success',
        'If an account with that email exists, a reset link has been sent.'
      );
      res.redirect('/auth/login');
    };

    const result = validationResult(req);
    if (!result.isEmpty()) {
      return genericSuccess();
    }

    try {
      const user = await users.findByEmail(req.body.email);
      if (user) {
        const token = crypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
        await users.setResetToken(user.email, token, expires);
        const resetUrl = `${req.protocol}://${req.get('host')}/auth/reset-password/${token}`;
        await sendPasswordResetEmail(user.email, resetUrl);
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
