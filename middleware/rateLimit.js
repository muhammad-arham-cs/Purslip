const rateLimit = require('express-rate-limit');

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

module.exports = { authLimiter, writeLimiter };
