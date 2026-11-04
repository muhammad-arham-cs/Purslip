const CURRENCY_LOCALES = {
  PKR: 'en-PK',
  USD: 'en-US',
  EUR: 'de-DE',
  GBP: 'en-GB',
};

function normalizeRates(rates) {
  const normalized = { PKR: 1, USD: 1 };
  if (rates && typeof rates === 'object') {
    for (const [currency, value] of Object.entries(rates)) {
      const code = String(currency).toUpperCase();
      const rate = Number(value);
      if (/^[A-Z]{3}$/.test(code) && Number.isFinite(rate) && rate > 0) normalized[code] = rate;
    }
  }
  return normalized;
}

function convertAmount(amount, fromCurrency, toCurrency, rates) {
  const from = String(fromCurrency || toCurrency).toUpperCase();
  const to = String(toCurrency).toUpperCase();
  if (from === to) return Number(amount);
  const normalized = normalizeRates(rates);
  if (!normalized[from] || !normalized[to]) return Number(amount);
  return (Number(amount) / normalized[from]) * normalized[to];
}

function formatCurrency(amount, currency = 'PKR') {
  const code = String(currency || 'PKR').toUpperCase();
  return Number(amount || 0).toLocaleString(CURRENCY_LOCALES[code] || 'en-US', {
    style: 'currency',
    currency: code,
    minimumFractionDigits: 2,
  });
}

module.exports = { normalizeRates, convertAmount, formatCurrency };
