// Pure date-string arithmetic for recurrence scheduling — deliberately never
// constructs a JS Date from a bare 'YYYY-MM-DD' and reads it back via local
// getters (that's the exact bug fixed in Phase 6: local-midnight parsing
// shifts the date across the UTC boundary depending on server timezone).
// The only Date.UTC() use here is to ask "how many days are in month X",
// which is timezone-safe because we only ever read back with getUTC*.

function pad2(n) {
  return String(n).padStart(2, '0');
}

function daysInMonth(year, month1To12) {
  // Day 0 of "next month" is the last day of the target month.
  return new Date(Date.UTC(year, month1To12, 0)).getUTCDate();
}

function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

// Adds calendar months, clamping the day-of-month to the target month's
// last day rather than letting it roll into the following month (Jan 31 +
// 1 month => Feb 28/29, not Mar 3).
function addMonthsClamped(dateStr, months) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const newY = Math.floor(total / 12);
  const newM = (((total % 12) + 12) % 12) + 1;
  const newD = Math.min(d, daysInMonth(newY, newM));
  return `${newY}-${pad2(newM)}-${pad2(newD)}`;
}

function computeNextDate(dateStr, frequency, customIntervalDays) {
  switch (frequency) {
    case 'daily':
      return addDays(dateStr, 1);
    case 'weekly':
      return addDays(dateStr, 7);
    case 'biweekly':
      return addDays(dateStr, 14);
    case 'custom_days':
      if (!customIntervalDays || customIntervalDays < 1) {
        throw new Error('custom_days frequency requires a positive customIntervalDays.');
      }
      return addDays(dateStr, customIntervalDays);
    case 'monthly':
      return addMonthsClamped(dateStr, 1);
    case 'yearly':
      return addMonthsClamped(dateStr, 12);
    default:
      throw new Error(`Unknown recurrence frequency: ${frequency}`);
  }
}

// Rough monthly-equivalent multiplier for the subscription tracker's
// "total monthly recurring spend" figure. Uses average month/week lengths
// rather than a fixed 30/4 so weekly and biweekly totals don't drift.
function monthlyEquivalent(amount, frequency, customIntervalDays) {
  const perYear = {
    daily: 365.25,
    weekly: 52.1775,
    biweekly: 26.08875,
    monthly: 12,
    yearly: 1,
    custom_days: customIntervalDays ? 365.25 / customIntervalDays : 0,
  }[frequency];
  return (amount * perYear) / 12;
}

module.exports = { computeNextDate, monthlyEquivalent, addDays, addMonthsClamped };
