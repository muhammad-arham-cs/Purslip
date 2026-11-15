/**
 * PURSLIP — Vanilla JavaScript Landing Page Controller
 * Zero frontend framework dependencies. Ready for Express / EJS integration.
 */
(function (global) {
  'use strict';

  /**
   * 1. CENTRALIZED ROUTE & APPLICATION CONFIGURATION
   * Update these routes in one place when integrating into Express / EJS.
   */
  var PURSLIP_CONFIG = Object.assign(
    {
      routes: {
        login: '/auth/login',
        register: '/auth/signup',
        dashboard: '/dashboard',
        privacy: '#trust',
        terms: '#faq'
      },
      // Set `interceptPlaceholderRoutes: false` in production Express when /auth/login & /auth/signup routes are live
      interceptPlaceholderRoutes: false,
      exchangeRates: {
        PKR: { rate: 1, symbol: 'PKR ', decimals: 0 },
        USD: { rate: 1 / 278.5, symbol: '$', decimals: 2 },
        GBP: { rate: 1 / 352.0, symbol: '£', decimals: 2 }
      }
    },
    global.PURSLIP_CONFIG || {}
  );

  global.PURSLIP_CONFIG = PURSLIP_CONFIG;

  /**
   * Realistic Purslip Financial Dataset (Base amounts in PKR)
   */
  var DASHBOARD_VIEWS = {
    overview: {
      titleEn: 'Consolidated Financial Command',
      titleUr: 'مجموعی مالیاتی جائزہ',
      kpis: [
        {
          labelEn: 'Net Worth',
          labelUr: 'مجموعی مالیت',
          amountPkr: 4820500,
          subEn: '+PKR 164,000 (+3.5%) vs Oct',
          subUr: 'گزشتہ ماہ سے 3.5% اضافہ',
          tone: 'positive'
        },
        {
          labelEn: 'Liquid Account Balance',
          labelUr: 'دستیاب بیلنس',
          amountPkr: 1485200,
          subEn: 'Across 4 active accounts',
          subUr: '4 فعال اکاؤنٹس میں',
          tone: 'neutral'
        },
        {
          labelEn: 'Monthly Income (Nov)',
          labelUr: 'ماہانہ آمدنی (نومبر)',
          amountPkr: 465000,
          subEn: 'Salary + 1 USD transfer',
          subUr: 'تنخواہ اور فری لانس آمدنی',
          tone: 'positive'
        },
        {
          labelEn: 'Monthly Expenses (Nov)',
          labelUr: 'ماہانہ اخراجات (نومبر)',
          amountPkr: 278450,
          subEn: '59.8% of monthly income',
          subUr: 'آمدنی کا 59.8 فیصد',
          tone: 'expense'
        }
      ],
      chartTitleEn: 'Six-Month Cash Flow (Income vs. Expenses)',
      chartTitleUr: 'چھ ماہ کا کیش فلو (آمدنی بمقابلہ اخراجات)',
      incomeSeries: [410000, 425000, 410000, 480000, 445000, 465000],
      expenseSeries: [295000, 268000, 312000, 289000, 264000, 278450],
      months: ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'],
      budgets: [
        { nameEn: 'Household & Groceries', nameUr: 'گھریلو راشن اور اخراجات', spent: 68400, limit: 85000, status: 'caution' },
        { nameEn: 'Utilities, Fiber & Fuel', nameUr: 'بجلی، انٹرنیٹ اور ایندھن', spent: 54200, limit: 60000, status: 'near-limit' },
        { nameEn: 'Dining & Family Outings', nameUr: 'کھانا اور فیملی تفریح', spent: 22800, limit: 45000, status: 'healthy' },
        { nameEn: 'Emergency Reserve Goal', nameUr: 'ایمرجنسی بچت ہدف', spent: 120000, limit: 150000, status: 'healthy' }
      ],
      transactions: [
        { title: 'Systems Ltd — Monthly Payroll', account: 'Meezan Bank Current', category: 'Salary Income', date: '14 Nov', amountPkr: 385000, type: 'in' },
        { title: 'Imtiaz Super Market — Clifton', account: 'HBL Freedom Card', category: 'Groceries', date: '13 Nov', amountPkr: -24650, type: 'out' },
        { title: 'K-Electric — Billing Cycle Oct', account: 'Meezan Bank Current', category: 'Utilities', date: '11 Nov', amountPkr: -31400, type: 'out' },
        { title: 'Wise Transfer — Design Retainer', account: 'SadaPay Multi-Currency', category: 'Freelance', date: '09 Nov', amountPkr: 80000, type: 'in' },
        { title: 'PSO Station — Shahrah-e-Faisal', account: 'SadaPay Wallet', category: 'Transport & Fuel', date: '08 Nov', amountPkr: -14800, type: 'out' }
      ],
      breakdown: [
        { label: 'Housing & Utilities', pct: '32%', amountPkr: 89100 },
        { label: 'Groceries & Essentials', pct: '25%', amountPkr: 68400 },
        { label: 'Transport & Fuel', pct: '18%', amountPkr: 50150 },
        { label: 'Family & Healthcare', pct: '14%', amountPkr: 39000 },
        { label: 'Dining & Subscriptions', pct: '11%', amountPkr: 31800 }
      ]
    },
    transactions: {
      titleEn: 'Transaction Ledger & CSV Statement Import',
      titleUr: 'لین دین کا ریکارڈ اور CSV امپورٹ',
      kpis: [
        {
          labelEn: 'Recorded Entries (Nov)',
          labelUr: 'درج شدہ ٹرانزیکشنز',
          amountPkr: 278450,
          subEn: '64 verified ledger entries',
          subUr: '64 تصدیق شدہ اندراجات',
          tone: 'neutral'
        },
        {
          labelEn: 'CSV Batch Imported',
          labelUr: 'CSV اسٹیٹمنٹ امپورٹ',
          amountPkr: 465000,
          subEn: 'Meezan_Nov2026.csv (0 duplicates)',
          subUr: 'میزان بینک اسٹیٹمنٹ مکمل',
          tone: 'positive'
        },
        {
          labelEn: 'Internal Transfers',
          labelUr: 'اکاؤنٹ ٹرانسفرز',
          amountPkr: 150000,
          subEn: 'Meezan -> National Savings',
          subUr: 'میزان سے نیشنل سیونگز',
          tone: 'neutral'
        },
        {
          labelEn: 'Uncategorized Items',
          labelUr: 'غیر درجہ بند اندراجات',
          amountPkr: 0,
          subEn: '100% categorized cleanly',
          subUr: 'تمام اندراجات مکمل ہیں',
          tone: 'positive'
        }
      ],
      chartTitleEn: 'Daily Outflow Velocity vs. Monthly Baseline',
      chartTitleUr: 'روزانہ اخراجات کی رفتار',
      incomeSeries: [420000, 420000, 445000, 450000, 460000, 465000],
      expenseSeries: [240000, 255000, 248000, 272000, 264000, 278450],
      months: ['W1', 'W2', 'W3', 'W4', 'W5', 'Now'],
      budgets: [
        { nameEn: 'CSV Auto-Mapped Columns', nameUr: 'CSV کالم میپنگ', spent: 98000, limit: 100000, status: 'healthy' },
        { nameEn: 'Recurring Bill Matches', nameUr: 'ماہانہ بلوں کی شناخت', spent: 54200, limit: 60000, status: 'healthy' },
        { nameEn: 'Inter-Account Transfers', nameUr: 'بین الاکاؤنٹ ٹرانسفر', spent: 150000, limit: 200000, status: 'healthy' },
        { nameEn: 'Discretionary Spend Cap', nameUr: 'اضافی اخراجات کی حد', spent: 39200, limit: 45000, status: 'near-limit' }
      ],
      transactions: [
        { title: 'Transfer -> National Savings Vault', account: 'Meezan -> Savings', category: 'Account Transfer', date: '14 Nov', amountPkr: -150000, type: 'out' },
        { title: 'Nayatel Fiber 100Mbps — Auto Bill', account: 'HBL Freedom Account', category: 'Internet & Comms', date: '12 Nov', amountPkr: -6850, type: 'out' },
        { title: 'Aga Khan Lab — Family Checkup', account: 'Meezan Bank Current', category: 'Healthcare', date: '10 Nov', amountPkr: -18500, type: 'out' },
        { title: 'Upwork Direct Contract (USD $287)', account: 'SadaPay Multi-Currency', category: 'Foreign Remittance', date: '09 Nov', amountPkr: 80000, type: 'in' },
        { title: 'Daraz.pk — Home Office UPS Battery', account: 'SadaPay Wallet', category: 'Equipment', date: '05 Nov', amountPkr: -22400, type: 'out' }
      ],
      breakdown: [
        { label: 'Meezan Bank Current', pct: '54%', amountPkr: 802000 },
        { label: 'HBL Freedom Account', pct: '27%', amountPkr: 401200 },
        { label: 'SadaPay Multi-Currency', pct: '12%', amountPkr: 178000 },
        { label: 'Cash in Hand Wallet', pct: '7%', amountPkr: 104000 }
      ]
    },
    budgets: {
      titleEn: 'Monthly Budgets, Limits & Savings Goals',
      titleUr: 'ماہانہ بجٹ اور بچت کے اہداف',
      kpis: [
        {
          labelEn: 'Total Monthly Budget',
          labelUr: 'کل ماہانہ بجٹ',
          amountPkr: 310000,
          subEn: 'Allocated across 7 categories',
          subUr: '7 زمروں میں تقسیم شدہ',
          tone: 'neutral'
        },
        {
          labelEn: 'Remaining Safe Spend',
          labelUr: 'باقی محفوظ بجٹ',
          amountPkr: 31550,
          subEn: '15 days left in November',
          subUr: 'نومبر کے 15 دن باقی',
          tone: 'positive'
        },
        {
          labelEn: 'Active Savings Goals',
          labelUr: 'بچت کے فعال اہداف',
          amountPkr: 1850000,
          subEn: '3 goals on schedule (74% funded)',
          subUr: '3 اہداف شیڈول کے مطابق',
          tone: 'positive'
        },
        {
          labelEn: 'Monthly Goal Contribution',
          labelUr: 'ماہانہ بچت حصہ',
          amountPkr: 150000,
          subEn: '32.2% savings rate achieved',
          subUr: 'آمدنی کا 32.2 فیصد بچت',
          tone: 'positive'
        }
      ],
      chartTitleEn: 'Cumulative Savings Goal Trajectory',
      chartTitleUr: 'بچت کے اہداف کی پیشرفت',
      incomeSeries: [1150000, 1290000, 1410000, 1550000, 1700000, 1850000],
      expenseSeries: [900000, 1000000, 1100000, 1200000, 1300000, 1400000],
      months: ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'],
      budgets: [
        { nameEn: 'Emergency Fund (6 Months)', nameUr: 'ایمرجنسی فنڈ (6 ماہ)', spent: 1080000, limit: 1200000, status: 'healthy' },
        { nameEn: 'Solar Hybrid Inverter Upgrade', nameUr: 'سولر انورٹر اپ گریڈ', spent: 450000, limit: 550000, status: 'healthy' },
        { nameEn: 'Annual Car Takaful & Tax', nameUr: 'گاڑی کا تکافل اور ٹیکس', spent: 112000, limit: 120000, status: 'near-limit' },
        { nameEn: 'Northern Areas Family Trip', nameUr: 'فیملی سفر فنڈ', spent: 208000, limit: 350000, status: 'caution' }
      ],
      transactions: [
        { title: 'Goal Allocation — Emergency Reserve', account: 'National Savings', category: 'Savings Goal', date: '14 Nov', amountPkr: 100000, type: 'in' },
        { title: 'Goal Allocation — Solar Upgrade', account: 'Meezan Savings Pot', category: 'Savings Goal', date: '14 Nov', amountPkr: 50000, type: 'in' },
        { title: 'Sui Southern Gas — Monthly Bill', account: 'Meezan Bank Current', category: 'Utilities Budget', date: '11 Nov', amountPkr: -8450, type: 'out' },
        { title: 'Carrefour Hypermarket — Packages', account: 'HBL Freedom Card', category: 'Grocery Budget', date: '07 Nov', amountPkr: -32100, type: 'out' }
      ],
      breakdown: [
        { label: 'Emergency Reserve Vault', pct: '90% Funded', amountPkr: 1080000 },
        { label: 'Solar Hybrid Upgrade', pct: '82% Funded', amountPkr: 450000 },
        { label: 'Vehicle Takaful Reserve', pct: '93% Funded', amountPkr: 112000 },
        { label: 'Family Travel Fund', pct: '59% Funded', amountPkr: 208000 }
      ]
    },
    lending: {
      titleEn: 'Money Lent, Borrowed & Recurring Commitments',
      titleUr: 'قرض حسنہ، ادھار اور ماہانہ بل',
      kpis: [
        {
          labelEn: 'Total Money Lent (Receivable)',
          labelUr: 'واجب الوصول رقم (قرض دیا)',
          amountPkr: 245000,
          subEn: 'Across 3 active personal records',
          subUr: '3 افراد سے وصول طلب',
          tone: 'positive'
        },
        {
          labelEn: 'Money Borrowed (Payable)',
          labelUr: 'واجب الادا رقم (قرض لیا)',
          amountPkr: 60000,
          subEn: '1 interest-free family installment',
          subUr: '1 خاندانی قسط باقی',
          tone: 'expense'
        },
        {
          labelEn: 'Net Lending Position',
          labelUr: 'خالص پوزیشن',
          amountPkr: 185000,
          subEn: 'Included in total net worth',
          subUr: 'مجموعی مالیت میں شامل',
          tone: 'positive'
        },
        {
          labelEn: 'Upcoming Recurring Bills',
          labelUr: 'آنے والے ماہانہ بل',
          amountPkr: 74500,
          subEn: '4 bills due in next 10 days',
          subUr: 'اگلے 10 دنوں میں 4 بل',
          tone: 'neutral'
        }
      ],
      chartTitleEn: 'Repayment Settlements & Recurring Bill Schedule',
      chartTitleUr: 'قرض کی واپسی اور ماہانہ بلوں کا شیڈول',
      incomeSeries: [320000, 300000, 290000, 275000, 260000, 245000],
      expenseSeries: [140000, 120000, 105000, 90000, 75000, 60000],
      months: ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'],
      budgets: [
        { nameEn: 'Lent to Bilal Ahmed (Laptop)', nameUr: 'بلال احمد کو قرض', spent: 110000, limit: 150000, status: 'healthy' },
        { nameEn: 'Lent to Usman Tariq (Medical)', nameUr: 'عثمان طارق کو قرض', spent: 45000, limit: 100000, status: 'caution' },
        { nameEn: 'Borrowed — Uncle Tariq (Car)', nameUr: 'طارق صاحب کی واپسی', spent: 240000, limit: 300000, status: 'healthy' },
        { nameEn: 'Nov Recurring Bills Paid', nameUr: 'نومبر کے ادا شدہ بل', spent: 62000, limit: 74500, status: 'healthy' }
      ],
      transactions: [
        { title: 'Repayment Received — Bilal Ahmed', account: 'Meezan Bank Current', category: 'Lent Settlement', date: '12 Nov', amountPkr: 35000, type: 'in' },
        { title: 'Installment Paid — Uncle Tariq', account: 'Meezan Bank Current', category: 'Borrowed Repayment', date: '05 Nov', amountPkr: -15000, type: 'out' },
        { title: 'Recurring: House Rent — DHA Phase 6', account: 'HBL Freedom Account', category: 'Recurring Bill', date: '01 Nov', amountPkr: -55000, type: 'out' },
        { title: 'Recurring: PTCL / Nayatel Fiber', account: 'SadaPay Wallet', category: 'Recurring Bill', date: '03 Nov', amountPkr: -6850, type: 'out' }
      ],
      breakdown: [
        { label: 'Bilal Ahmed — Due 30 Dec', pct: 'Receivable', amountPkr: 140000 },
        { label: 'Usman Tariq — Due 15 Jan', pct: 'Receivable', amountPkr: 105000 },
        { label: 'Uncle Tariq — Remaining', pct: 'Payable', amountPkr: 60000 },
        { label: 'Upcoming December Bills', pct: 'Scheduled', amountPkr: 74500 }
      ]
    }
  };

  /**
   * 5 Interactive Lenses for the Financial Insights Section (Section 3.F)
   */
  var INSIGHTS_DATA = {
    trends: {
      heading: 'Monthly Spending Trends',
      subtitle: 'Spot seasonal spikes across utilities, groceries, and fuel before they erode your monthly surplus.',
      kpis: [
        { label: '6-Month Avg Spend', amountPkr: 284400, note: 'Down 4.2% since August' },
        { label: 'Lowest Spend Month', amountPkr: 264000, note: 'October 2026' },
        { label: 'Peak Utility Variance', amountPkr: 46800, note: 'July Summer Tariff' }
      ],
      primarySeries: [295000, 318000, 312000, 289000, 264000, 278450],
      secondarySeries: [300000, 300000, 300000, 300000, 300000, 300000],
      primaryLabel: 'Actual Monthly Spend',
      secondaryLabel: 'Target Spending Ceiling',
      rows: [
        { name: 'Summer Electricity Peak (Jul–Aug)', meta: 'K-Electric + Generator Fuel', amountPkr: 58400 },
        { name: 'Autumn Baseline Stabilization (Oct–Nov)', meta: 'Reduced HVAC & dining out', amountPkr: 31400 },
        { name: 'Projected December Commitment', meta: 'Includes annual school fee', amountPkr: 292000 }
      ]
    },
    income_vs_expense: {
      heading: 'Income vs. Expenses Surplus',
      subtitle: 'Measure the exact gap between what enters your accounts and what leaves every single month.',
      kpis: [
        { label: 'Nov Net Cash Flow', amountPkr: 186550, note: '+40.1% net positive margin' },
        { label: '6-Month Cumulative Surplus', amountPkr: 928550, note: 'Retained across accounts' },
        { label: 'Expense-to-Income Ratio', amountPkr: 278450, note: '59.8% of PKR 465,000' }
      ],
      primarySeries: [410000, 425000, 410000, 480000, 445000, 465000],
      secondarySeries: [295000, 268000, 312000, 289000, 264000, 278450],
      primaryLabel: 'Total Verified Income',
      secondaryLabel: 'Total Verified Expenses',
      rows: [
        { name: 'Primary Salary Inflow', meta: 'Meezan Bank · Monthly on 1st', amountPkr: 385000 },
        { name: 'Secondary / Remittance Inflow', meta: 'SadaPay · USD Client Retainer', amountPkr: 80000 },
        { name: 'Net Retained Monthly Surplus', meta: 'Available for goals & investments', amountPkr: 186550 }
      ]
    },
    categories: {
      heading: 'Category Breakdown & Concentration',
      subtitle: 'See which categories absorb the largest share of your rupees without digging through raw bank statements.',
      kpis: [
        { label: 'Top Category (Housing & Bills)', amountPkr: 89100, note: '32.0% of total spend' },
        { label: 'Second Category (Groceries)', amountPkr: 68400, note: '24.6% of total spend' },
        { label: 'Discretionary Share', amountPkr: 31800, note: '11.4% (Within 15% target)' }
      ],
      primarySeries: [89100, 68400, 50150, 39000, 31800, 24000],
      secondarySeries: [95000, 85000, 55000, 45000, 45000, 30000],
      primaryLabel: 'Category Actual Spend',
      secondaryLabel: 'Category Budget Limit',
      rows: [
        { name: 'Housing, Rent & Utilities', meta: '32.0% share · 6 transactions', amountPkr: 89100 },
        { name: 'Groceries & Household Provision', meta: '24.6% share · 14 transactions', amountPkr: 68400 },
        { name: 'Transport, Fuel & Maintenance', meta: '18.0% share · 9 transactions', amountPkr: 50150 }
      ]
    },
    savings: {
      heading: 'Savings Progress & Goal Velocity',
      subtitle: 'Track dedicated funds for emergency reserves, household upgrades, and annual obligations.',
      kpis: [
        { label: 'Total Saved Across Goals', amountPkr: 1850000, note: '73.4% of PKR 2.52M target' },
        { label: 'Monthly Goal Deposit', amountPkr: 150000, note: 'Automated internal transfer' },
        { label: 'Emergency Runway', amountPkr: 1080000, note: 'Covers 3.9 months of expenses' }
      ],
      primarySeries: [1150000, 1290000, 1410000, 1550000, 1700000, 1850000],
      secondarySeries: [1100000, 1240000, 1380000, 1520000, 1660000, 1800000],
      primaryLabel: 'Actual Goal Balance',
      secondaryLabel: 'Planned Savings Schedule',
      rows: [
        { name: '6-Month Emergency Reserve', meta: '90% complete · PKR 120,000 remaining', amountPkr: 1080000 },
        { name: 'Home Solar Lithium Upgrade', meta: '82% complete · Target Dec 2026', amountPkr: 450000 },
        { name: 'Annual Takaful & Property Tax', meta: '93% complete · Ready for Jan', amountPkr: 112000 }
      ]
    },
    networth: {
      heading: 'Net Worth History (Assets vs. Liabilities)',
      subtitle: 'Combine bank accounts, cash wallets, savings pots, and net lending balances into one longitudinal view.',
      kpis: [
        { label: 'Current Net Worth', amountPkr: 4820500, note: '+PKR 840,500 over 6 months' },
        { label: 'Total Liquid & Goal Assets', amountPkr: 4880500, note: 'Accounts + Savings + Lent' },
        { label: 'Outstanding Payables', amountPkr: 60000, note: 'Down from PKR 140,000 in Jun' }
      ],
      primarySeries: [3980000, 4120000, 4290000, 4465000, 4656500, 4820500],
      secondarySeries: [3840000, 4000000, 4185000, 4375000, 4581500, 4760500],
      primaryLabel: 'Total Assets',
      secondaryLabel: 'Net Worth (Assets - Payables)',
      rows: [
        { name: 'Bank & Digital Wallets (4 Accounts)', meta: 'Meezan, HBL, SadaPay, Cash', amountPkr: 1485200 },
        { name: 'Dedicated Savings & Certificates', meta: 'National Savings + Goal Pots', amountPkr: 3150300 },
        { name: 'Net Lending Balance (Lent - Borrowed)', meta: 'PKR 245k receivable - PKR 60k payable', amountPkr: 185000 }
      ]
    }
  };

  var state = {
    dashView: 'overview',
    currency: 'PKR',
    lang: 'en',
    theme: 'dark',
    insightTab: 'trends'
  };

  function formatMoney(amountPkr) {
    var cfg = PURSLIP_CONFIG.exchangeRates[state.currency] || PURSLIP_CONFIG.exchangeRates.PKR;
    var val = amountPkr * cfg.rate;
    var sign = val < 0 ? '-' : '';
    var abs = Math.abs(val);
    var formatted = abs.toLocaleString('en-US', {
      minimumFractionDigits: cfg.decimals,
      maximumFractionDigits: cfg.decimals
    });
    return sign + cfg.symbol + formatted;
  }

  function buildChartPaths(seriesA, seriesB, width, height) {
    var all = seriesA.concat(seriesB);
    var maxVal = Math.max.apply(null, all) * 1.08;
    var minVal = Math.min.apply(null, all) * 0.82;
    var span = Math.max(1, maxVal - minVal);
    var padX = 24;
    var padY = 18;
    var usableW = width - padX * 2;
    var usableH = height - padY * 2;

    function toPoints(arr) {
      return arr.map(function (v, i) {
        var x = padX + (i / Math.max(1, arr.length - 1)) * usableW;
        var y = padY + usableH - ((v - minVal) / span) * usableH;
        return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)), raw: v };
      });
    }

    function toPath(pts) {
      return pts
        .map(function (p, i) {
          return (i === 0 ? 'M ' : 'L ') + p.x + ' ' + p.y;
        })
        .join(' ');
    }

    function toArea(pts) {
      if (!pts.length) return '';
      var line = toPath(pts);
      var last = pts[pts.length - 1];
      var first = pts[0];
      return line + ' L ' + last.x + ' ' + (height - padY) + ' L ' + first.x + ' ' + (height - padY) + ' Z';
    }

    var ptsA = toPoints(seriesA);
    var ptsB = toPoints(seriesB);

    return {
      ptsA: ptsA,
      ptsB: ptsB,
      pathA: toPath(ptsA),
      pathB: toPath(ptsB),
      areaA: toArea(ptsA)
    };
  }

  function renderDashboardShowcase() {
    var viewData = DASHBOARD_VIEWS[state.dashView] || DASHBOARD_VIEWS.overview;
    var isUr = state.lang === 'ur';

    var frameEl = document.getElementById('ps-dashboard-frame');
    if (frameEl) {
      frameEl.setAttribute('data-preview-theme', state.theme);
      frameEl.setAttribute('data-preview-currency', state.currency);
      frameEl.setAttribute('data-preview-lang', state.lang);
    }

    var titleEl = document.getElementById('ps-dash-view-title');
    if (titleEl) {
      titleEl.textContent = isUr ? viewData.titleUr : viewData.titleEn;
    }

    // 1. Render 4 KPIs
    var kpiContainer = document.getElementById('ps-dash-kpi-strip');
    if (kpiContainer) {
      kpiContainer.innerHTML = viewData.kpis
        .map(function (kpi) {
          var subClass =
            kpi.tone === 'positive'
              ? 'ps-dash-sub ps-dash-sub-positive'
              : kpi.tone === 'expense'
              ? 'ps-dash-sub ps-dash-sub-expense'
              : 'ps-dash-sub';
          return (
            '<div class="ps-dash-kpi">' +
            '<div class="ps-dash-label"><span>' +
            (isUr ? kpi.labelUr : kpi.labelEn) +
            '</span><span>' +
            state.currency +
            '</span></div>' +
            '<div class="ps-dash-value ps-tabular">' +
            formatMoney(kpi.amountPkr) +
            '</div>' +
            '<div class="' +
            subClass +
            '">' +
            (isUr ? kpi.subUr : kpi.subEn) +
            '</div>' +
            '</div>'
          );
        })
        .join('');
    }

    // 2. Render SVG Chart
    var chartHeading = document.getElementById('ps-dash-chart-heading');
    if (chartHeading) {
      chartHeading.textContent = isUr ? viewData.chartTitleUr : viewData.chartTitleEn;
    }

    var svgEl = document.getElementById('ps-dash-chart-svg');
    if (svgEl) {
      var w = 640;
      var h = 200;
      var geom = buildChartPaths(viewData.incomeSeries, viewData.expenseSeries, w, h);

      var labelsSvg = viewData.months
        .map(function (m, idx) {
          var pt = geom.ptsA[idx];
          return (
            '<text x="' +
            pt.x +
            '" y="196" fill="#BDA697" font-size="11" font-family="JetBrains Mono, monospace" text-anchor="middle">' +
            m +
            '</text>'
          );
        })
        .join('');

      var dotsA = geom.ptsA
        .map(function (p) {
          return '<circle cx="' + p.x + '" cy="' + p.y + '" r="3.5" fill="#3D9A6B" />';
        })
        .join('');

      var dotsB = geom.ptsB
        .map(function (p) {
          return '<circle cx="' + p.x + '" cy="' + p.y + '" r="3.5" fill="#C58F71" />';
        })
        .join('');

      svgEl.innerHTML =
        '<defs>' +
        '<linearGradient id="psCashArea" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="#3D9A6B" stop-opacity="0.24"/>' +
        '<stop offset="100%" stop-color="#3D9A6B" stop-opacity="0.0"/>' +
        '</linearGradient>' +
        '</defs>' +
        '<line x1="24" y1="45" x2="616" y2="45" stroke="rgba(189,166,151,0.1)" stroke-dasharray="3 3" />' +
        '<line x1="24" y1="95" x2="616" y2="95" stroke="rgba(189,166,151,0.1)" stroke-dasharray="3 3" />' +
        '<line x1="24" y1="145" x2="616" y2="145" stroke="rgba(189,166,151,0.1)" stroke-dasharray="3 3" />' +
        '<path d="' +
        geom.areaA +
        '" fill="url(#psCashArea)" />' +
        '<path d="' +
        geom.pathA +
        '" fill="none" stroke="#3D9A6B" stroke-width="2.4" />' +
        '<path d="' +
        geom.pathB +
        '" fill="none" stroke="#C58F71" stroke-width="2.2" stroke-dasharray="5 3" />' +
        dotsA +
        dotsB +
        labelsSvg;
    }

    // 3. Render Budgets & Limits
    var budgetList = document.getElementById('ps-dash-budget-list');
    if (budgetList) {
      budgetList.innerHTML = viewData.budgets
        .map(function (b) {
          var pct = Math.min(100, Math.round((b.spent / Math.max(1, b.limit)) * 100));
          return (
            '<div class="ps-budget-item">' +
            '<div class="ps-budget-row">' +
            '<span class="ps-budget-cat">' +
            (isUr ? b.nameUr : b.nameEn) +
            '</span>' +
            '<span class="ps-budget-meta ps-tabular">' +
            formatMoney(b.spent) +
            ' / ' +
            formatMoney(b.limit) +
            ' (' +
            pct +
            '%)</span>' +
            '</div>' +
            '<div class="ps-progress-track">' +
            '<div class="ps-progress-fill" data-status="' +
            b.status +
            '" style="width:' +
            pct +
            '%"></div>' +
            '</div>' +
            '</div>'
          );
        })
        .join('');
    }

    // 4. Render Recent Transactions
    var txContainer = document.getElementById('ps-dash-tx-list');
    if (txContainer) {
      txContainer.innerHTML = viewData.transactions
        .map(function (tx) {
          var amtClass = tx.type === 'in' ? 'ps-tx-amount ps-tx-amount-in ps-tabular' : 'ps-tx-amount ps-tabular';
          var prefix = tx.type === 'in' ? '+' : '';
          return (
            '<div class="ps-tx-row">' +
            '<div><div class="ps-tx-title">' +
            tx.title +
            '</div><div class="ps-tx-meta">' +
            tx.account +
            '</div></div>' +
            '<div class="ps-tx-meta">' +
            tx.category +
            '</div>' +
            '<div class="ps-tx-meta ps-tabular">' +
            tx.date +
            '</div>' +
            '<div class="' +
            amtClass +
            '">' +
            prefix +
            formatMoney(tx.amountPkr) +
            '</div>' +
            '</div>'
          );
        })
        .join('');
    }

    // 5. Render Spending / Account Breakdown
    var breakdownContainer = document.getElementById('ps-dash-breakdown-list');
    if (breakdownContainer) {
      breakdownContainer.innerHTML = viewData.breakdown
        .map(function (row) {
          return (
            '<div class="ps-breakdown-row">' +
            '<div><div class="ps-tx-title">' +
            row.label +
            '</div><div class="ps-tx-meta">' +
            row.pct +
            '</div></div>' +
            '<div class="ps-tabular">' +
            formatMoney(row.amountPkr) +
            '</div>' +
            '</div>'
          );
        })
        .join('');
    }
  }

  function renderInsightsStage() {
    var lens = INSIGHTS_DATA[state.insightTab] || INSIGHTS_DATA.trends;
    var headingEl = document.getElementById('ps-insight-stage-heading');
    var subEl = document.getElementById('ps-insight-stage-subtitle');
    var kpiRow = document.getElementById('ps-insight-kpi-row');
    var svgEl = document.getElementById('ps-insight-svg');
    var rowsEl = document.getElementById('ps-insight-rows');
    var leg1 = document.getElementById('ps-insight-leg-primary');
    var leg2 = document.getElementById('ps-insight-leg-secondary');

    if (headingEl) headingEl.textContent = lens.heading;
    if (subEl) subEl.textContent = lens.subtitle;
    if (leg1) leg1.textContent = lens.primaryLabel;
    if (leg2) leg2.textContent = lens.secondaryLabel;

    if (kpiRow) {
      kpiRow.innerHTML = lens.kpis
        .map(function (k) {
          return (
            '<div>' +
            '<div class="ps-dash-label">' +
            k.label +
            '</div>' +
            '<div class="ps-dash-value ps-tabular">' +
            formatMoney(k.amountPkr) +
            '</div>' +
            '<div class="ps-dash-sub">' +
            k.note +
            '</div>' +
            '</div>'
          );
        })
        .join('');
    }

    if (svgEl) {
      var geom = buildChartPaths(lens.primarySeries, lens.secondarySeries, 640, 190);
      var months = ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'];
      var monthLabels = months
        .map(function (m, i) {
          var pt = geom.ptsA[i];
          return (
            '<text x="' +
            pt.x +
            '" y="186" fill="#BDA697" font-size="11" font-family="JetBrains Mono, monospace" text-anchor="middle">' +
            m +
            '</text>'
          );
        })
        .join('');

      var circles = geom.ptsA
        .map(function (p) {
          return '<circle cx="' + p.x + '" cy="' + p.y + '" r="4" fill="#C58F71" />';
        })
        .join('');

      svgEl.innerHTML =
        '<defs>' +
        '<linearGradient id="psInsightGrad" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="#C58F71" stop-opacity="0.28"/>' +
        '<stop offset="100%" stop-color="#C58F71" stop-opacity="0.0"/>' +
        '</linearGradient>' +
        '</defs>' +
        '<line x1="24" y1="40" x2="616" y2="40" stroke="rgba(189,166,151,0.1)" stroke-dasharray="3 3" />' +
        '<line x1="24" y1="90" x2="616" y2="90" stroke="rgba(189,166,151,0.1)" stroke-dasharray="3 3" />' +
        '<line x1="24" y1="140" x2="616" y2="140" stroke="rgba(189,166,151,0.1)" stroke-dasharray="3 3" />' +
        '<path d="' +
        geom.areaA +
        '" fill="url(#psInsightGrad)" />' +
        '<path d="' +
        geom.pathA +
        '" fill="none" stroke="#C58F71" stroke-width="2.5" />' +
        '<path d="' +
        geom.pathB +
        '" fill="none" stroke="#6D5A50" stroke-width="1.8" stroke-dasharray="4 4" />' +
        circles +
        monthLabels;
    }

    if (rowsEl) {
      rowsEl.innerHTML = lens.rows
        .map(function (r) {
          return (
            '<div class="ps-demo-row">' +
            '<div><div class="ps-tx-title">' +
            r.name +
            '</div><div class="ps-tx-meta">' +
            r.meta +
            '</div></div>' +
            '<div class="ps-tabular">' +
            formatMoney(r.amountPkr) +
            '</div>' +
            '</div>'
          );
        })
        .join('');
    }
  }

  function applyConfigurableRoutes() {
    var routeLinks = document.querySelectorAll('[data-route]');
    routeLinks.forEach(function (link) {
      var key = link.getAttribute('data-route');
      var targetHref = PURSLIP_CONFIG.routes[key];
      if (targetHref) {
        link.setAttribute('href', targetHref);
      }
    });
  }

  function initNavigationAndScrollTelemetry() {
    var nav = document.getElementById('purslip-nav');
    var frameReadout = document.getElementById('ps-live-frame-readout');
    var canvas = document.getElementById('purslip-scroll-canvas');
    var mobileBtn = document.getElementById('ps-mobile-menu-btn');
    var mobileDrawer = document.getElementById('ps-mobile-drawer');

    function syncScrollUI() {
      var y = window.pageYOffset || document.documentElement.scrollTop || 0;
      if (nav) {
        nav.setAttribute('data-scrolled', y > 24 ? 'true' : 'false');
      }
      if (frameReadout && canvas) {
        var cur = canvas.getAttribute('data-current-frame') || '0';
        var tot = canvas.getAttribute('data-total-frames') || '153';
        var padded = String(cur).padStart(4, '0');
        frameReadout.textContent = 'Frame ' + padded + ' / ' + String(Number(tot) - 1).padStart(4, '0');
      }
    }

    window.addEventListener('scroll', syncScrollUI, { passive: true });
    syncScrollUI();

    if (mobileBtn && mobileDrawer) {
      mobileBtn.addEventListener('click', function () {
        var isOpen = mobileDrawer.getAttribute('data-open') === 'true';
        var next = !isOpen;
        mobileDrawer.setAttribute('data-open', String(next));
        mobileBtn.setAttribute('aria-expanded', String(next));
      });

      mobileDrawer.querySelectorAll('a').forEach(function (a) {
        a.addEventListener('click', function () {
          mobileDrawer.setAttribute('data-open', 'false');
          mobileBtn.setAttribute('aria-expanded', 'false');
        });
      });
    }
  }

  function initInteractiveControls() {
    // 1. Dashboard View Tabs
    document.querySelectorAll('[data-dash-view]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.dashView = btn.getAttribute('data-dash-view');
        document.querySelectorAll('[data-dash-view]').forEach(function (b) {
          b.setAttribute('aria-selected', String(b === btn));
        });
        renderDashboardShowcase();
      });
    });

    // 2. Currency Selector
    document.querySelectorAll('[data-dash-currency]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.currency = btn.getAttribute('data-dash-currency');
        document.querySelectorAll('[data-dash-currency]').forEach(function (b) {
          b.setAttribute('aria-pressed', String(b === btn));
        });
        renderDashboardShowcase();
        renderInsightsStage();
      });
    });

    // 3. Language Toggle (EN / UR)
    document.querySelectorAll('[data-dash-lang]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.lang = btn.getAttribute('data-dash-lang');
        document.querySelectorAll('[data-dash-lang]').forEach(function (b) {
          b.setAttribute('aria-pressed', String(b === btn));
        });
        renderDashboardShowcase();
      });
    });

    // 4. Theme Toggle (Dark / Night / Light)
    document.querySelectorAll('[data-dash-theme]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.theme = btn.getAttribute('data-dash-theme');
        document.querySelectorAll('[data-dash-theme]').forEach(function (b) {
          b.setAttribute('aria-pressed', String(b === btn));
        });
        renderDashboardShowcase();
      });
    });

    // 5. Financial Insights Tabs
    document.querySelectorAll('[data-insight-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.insightTab = btn.getAttribute('data-insight-tab');
        document.querySelectorAll('[data-insight-tab]').forEach(function (b) {
          b.setAttribute('aria-selected', String(b === btn));
        });
        renderInsightsStage();
      });
    });

    // 6. FAQ Accordion
    document.querySelectorAll('[data-faq-trigger]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var expanded = btn.getAttribute('aria-expanded') === 'true';
        var panelId = btn.getAttribute('aria-controls');
        var panel = document.getElementById(panelId);
        btn.setAttribute('aria-expanded', String(!expanded));
        if (panel) {
          panel.hidden = expanded;
        }
      });
    });
  }

  function init() {
    applyConfigurableRoutes();
    initNavigationAndScrollTelemetry();
    initInteractiveControls();
    renderDashboardShowcase();
    renderInsightsStage();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
