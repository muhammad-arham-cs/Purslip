const rateLimit = require('express-rate-limit');

const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes cooldown after 5 attempts

const loginLimiter = rateLimit({
  windowMs: LOGIN_COOLDOWN_MS,
  limit: LOGIN_MAX_ATTEMPTS,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = String(req.body?.email || '').toLowerCase().trim();
    return `${req.ip || 'unknown'}:${email || 'anonymous'}`;
  },
  handler: (req, res) => {
    const resetTime = req.rateLimit?.resetTime ? new Date(req.rateLimit.resetTime).getTime() : Date.now() + LOGIN_COOLDOWN_MS;
    const retryAfterSec = Math.max(1, Math.ceil((resetTime - Date.now()) / 1000));
    const minutes = Math.max(1, Math.ceil(retryAfterSec / 60));
    res.setHeader('Retry-After', String(retryAfterSec));
    return res.status(429).render('auth/login', {
      title: 'Log in',
      errors: [
        {
          msg: `Account temporarily locked after ${LOGIN_MAX_ATTEMPTS} login attempts. Cooldown active — please try again in ${minutes} minute(s) (${retryAfterSec}s).`,
        },
      ],
      values: { email: req.body?.email || '' },
      cooldownSeconds: retryAfterSec,
    });
  },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many authentication attempts. Please try again later.',
});

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !req.session?.user || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method),
  message: 'Too many changes in a short period. Please try again later.',
});

module.exports = {
  loginLimiter,
  authLimiter,
  writeLimiter,
  LOGIN_MAX_ATTEMPTS,
  LOGIN_COOLDOWN_MS,
};
