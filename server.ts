import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import express from 'express';
import type { Express, NextFunction, Request, Response } from 'express';
import session from 'express-session';
import pgSession from 'connect-pg-simple';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import methodOverride from 'method-override';
import flash from 'connect-flash';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { pool } = require('./config/db');
const { requireAuth } = require('./middleware/auth');
const accountsModel = require('./models/accounts');
const reportsModel = require('./models/reports');
const recurringModel = require('./models/recurring');
const debtsModel = require('./models/debts');
const usersModel = require('./models/users');
const { formatCurrency } = require('./lib/currency');
const { convertAmount } = require('./lib/currency');
const { translate } = require('./lib/i18n');

const dashboardCache = new Map<string, { expiresAt: number; value: any }>();
const dashboardGenerationByUser = new Map<string, string>();
const DASHBOARD_CACHE_TTL = 10000;

declare module 'express-session' {
  interface SessionData {
    user?: {
      id: string;
      email: string;
    };
    preferences?: {
      display_currency: string;
      exchange_rates: Record<string, number>;
    };
  }
}

const app: Express = express();
console.log('Purslip application starting');
const isProduction = process.env.NODE_ENV === 'production';
app.set('trust proxy', 1);
const pgSessionStore = pgSession(session);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('view cache', isProduction);

if (isProduction) {
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.headers['x-forwarded-proto'] && req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(`https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'script-src': ["'self'"],
        'img-src': ["'self'", 'data:'],
      },
    },
  })
);
app.use(morgan(isProduction ? 'combined' : 'dev'));
app.use(compression({ threshold: 1024 }));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: isProduction ? '7d' : 0,
  etag: true,
}));

if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET is not set. Copy .env.example to .env and configure it.');
}

app.use(
  session({
    store: new pgSessionStore({ pool, tableName: 'session', createTableIfMissing: false }),
    name: 'purslip.sid',
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  })
);

app.use(flash());

app.use((req: Request, res: Response, next: NextFunction) => {
  const locals = res.locals as Record<string, any>;
  locals.currentUser = (req.session && req.session.user) || null;
  locals.currentPath = req.originalUrl;
  locals.successMessages = req.flash('success');
  locals.errorMessages = req.flash('error');
  locals.formatCurrency = formatCurrency;
  next();
});

app.use(async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.session.user) {
      const preferences = req.session.preferences ||
        await usersModel.getPreferences(req.session.user.id);
      req.session.preferences = preferences;
      res.locals.displayCurrency = preferences.display_currency || 'PKR';
      res.locals.exchangeRates = preferences.exchange_rates || {};
      res.locals.language = preferences.language || 'en';
      res.locals.theme = preferences.theme || 'dark';
      res.locals.t = (key: string) => translate(key, res.locals.language);
      res.locals.displayAmount = (amount: number, currency?: string) =>
        formatCurrency(convertAmount(amount, currency, res.locals.displayCurrency, res.locals.exchangeRates), res.locals.displayCurrency);
    } else {
      res.locals.displayCurrency = 'PKR';
      res.locals.exchangeRates = {};
      res.locals.language = 'en';
      res.locals.theme = 'dark';
      res.locals.t = (key: string) => translate(key, 'en');
      res.locals.displayAmount = (amount: number) => formatCurrency(amount, 'PKR');
    }
    next();
  } catch (err) {
    next(err);
  }
});

app.get('/healthz', (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/', (req: Request, res: Response) => {
  res.render('home', { title: 'Purslip' });
});

app.get('/dashboard', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req.session as any).user.id;

    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
    const startDate = `${y}-${m}-01`;
    const endDate = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;

    const todayKey = new Date().toISOString().slice(0, 10);
    if (dashboardGenerationByUser.get(userId) !== todayKey) {
      await recurringModel.generateDue({ userId });
      dashboardGenerationByUser.set(userId, todayKey);
    }

    const cacheKey = `${userId}:${startDate}:${endDate}:${res.locals.displayCurrency}`;
    const cached = dashboardCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return res.render('dashboard', { title: 'Dashboard', ...cached.value });
    }

    const [accounts, incomeExpense, spending, currentNW, upcoming, debtRows] = await Promise.all([
      accountsModel.list(userId),
      reportsModel.incomeExpenseForRange(userId, startDate, endDate),
      reportsModel.spendingByCategory(userId, startDate, endDate),
      reportsModel.currentNetWorth(userId),
      recurringModel.upcomingBills(userId, 14),
      debtsModel.summary(userId),
    ]);
    const debtSummary = debtRows.reduce((summary: { lent: number; borrowed: number }, row: { direction: string; remaining: number; currency: string }) => {
      if (row.direction === 'lent' || row.direction === 'borrowed') {
        summary[row.direction] += convertAmount(row.remaining, row.currency, res.locals.displayCurrency, res.locals.exchangeRates);
      }
      return summary;
    }, { lent: 0, borrowed: 0 });

    const dashboardData = {
      accounts,
      incomeExpense,
      spending: JSON.stringify(spending),
      currentNW,
      upcoming,
      debtSummary,
      month: `${y}-${m}`,
    };
    dashboardCache.set(cacheKey, { value: dashboardData, expiresAt: Date.now() + DASHBOARD_CACHE_TTL });
    res.render('dashboard', { title: 'Dashboard', ...dashboardData });
  } catch (err: any) {
    next(err);
  }
});

app.use('/auth', require('./routes/auth'));
app.use('/accounts', require('./routes/accounts'));
app.use('/settings', require('./routes/settings'));
app.use('/transactions', require('./routes/transactions'));
app.use('/categories', require('./routes/categories'));
app.use('/budgets', require('./routes/budgets'));
app.use('/recurring', require('./routes/recurring'));
app.use('/reports', require('./routes/reports'));
app.use('/goals', require('./routes/goals'));
app.use('/debts', require('./routes/debts'));
app.use('/import', require('./routes/import'));

app.use((req: Request, res: Response) => {
  res.status(404).render('errors/404', { title: 'Not found' });
});

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error(err);
  res.status(err.status || 500).render('errors/500', {
    title: 'Something went wrong',
    message: isProduction ? 'Something went wrong.' : err.message,
  });
});

const PORT = process.env.PORT || 8080;

if (process.env.NODE_ENV !== 'test') {
  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
  });
  require('./lib/scheduler').start();
}

export default app;
