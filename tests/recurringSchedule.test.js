const { computeNextDate, monthlyEquivalent } = require('../lib/recurringSchedule');

describe('computeNextDate', () => {
  it('advances daily/weekly/biweekly by fixed day counts', () => {
    expect(computeNextDate('2026-01-01', 'daily')).toBe('2026-01-02');
    expect(computeNextDate('2026-01-01', 'weekly')).toBe('2026-01-08');
    expect(computeNextDate('2026-01-01', 'biweekly')).toBe('2026-01-15');
  });

  it('advances custom_days by the given interval', () => {
    expect(computeNextDate('2026-01-01', 'custom_days', 10)).toBe('2026-01-11');
  });

  it('rejects custom_days without a positive interval', () => {
    expect(() => computeNextDate('2026-01-01', 'custom_days', 0)).toThrow();
  });

  it('advances monthly across a normal month boundary', () => {
    expect(computeNextDate('2026-01-15', 'monthly')).toBe('2026-02-15');
  });

  it('clamps monthly to the last day of a shorter month instead of rolling over', () => {
    // Jan 31 + 1 month should land on Feb 28 (2026 is not a leap year), not Mar 3.
    expect(computeNextDate('2026-01-31', 'monthly')).toBe('2026-02-28');
  });

  it('clamps correctly for a leap year February', () => {
    expect(computeNextDate('2027-12-31', 'monthly')).toBe('2028-01-31');
    expect(computeNextDate('2028-01-31', 'monthly')).toBe('2028-02-29'); // 2028 is a leap year
  });

  it('advances yearly, including Feb 29 clamping in a non-leap year', () => {
    expect(computeNextDate('2026-03-01', 'yearly')).toBe('2027-03-01');
    expect(computeNextDate('2028-02-29', 'yearly')).toBe('2029-02-28');
  });
});

describe('monthlyEquivalent', () => {
  it('converts weekly and yearly amounts to a monthly figure using average month/week lengths', () => {
    expect(monthlyEquivalent(10, 'weekly')).toBeCloseTo((10 * 52.1775) / 12, 2);
    expect(monthlyEquivalent(1200, 'yearly')).toBeCloseTo(100, 2);
    expect(monthlyEquivalent(50, 'monthly')).toBe(50);
  });
});
