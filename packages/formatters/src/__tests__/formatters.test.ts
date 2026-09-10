import { describe, expect, it } from 'vitest';
import {
  formatBalanceCents,
  formatCurrency,
  formatPostDetailDate,
  formatCount,
  formatPercentage,
  formatTransactionAmount,
  formatTransactionDate,
  niceDate,
  niceDateShort,
  timeAgo,
} from '../index';

describe('@qoe/formatters - currency', () => {
  it('formats balance cents accurately', () => {
    expect(formatBalanceCents(4250)).toBe('42.50');
    expect(formatBalanceCents(0)).toBe('0.00');
    expect(formatBalanceCents(-1500)).toBe('-15.00');
    expect(formatBalanceCents(null)).toBe('0.00');
    expect(formatBalanceCents(undefined)).toBe('0.00');
    expect(formatBalanceCents(NaN)).toBe('0.00');
  });

  it('formats transaction amounts with signs and credit indicators', () => {
    const credit = formatTransactionAmount(4250);
    expect(credit.isCredit).toBe(true);
    expect(credit.sign).toBe('+');
    expect(credit.euros).toBe(42.5);
    expect(credit.formatted).toBe('+42.50 €');

    const debit = formatTransactionAmount(-1200);
    expect(debit.isCredit).toBe(false);
    expect(debit.sign).toBe('');
    expect(debit.euros).toBe(-12);
    expect(debit.formatted).toBe('-12.00 €');

    const zero = formatTransactionAmount(0);
    expect(zero.isCredit).toBe(false);
    expect(zero.sign).toBe('');
    expect(zero.euros).toBe(0);
    expect(zero.formatted).toBe('0.00 €');
  });

  it('formats general currency using Intl with options and fallbacks', () => {
    const formattedEur = formatCurrency(42.5, { locale: 'fr-FR', currency: 'EUR' });
    // French non-breaking space or normal space before €
    expect(formattedEur.replace(/\u202f|\u00a0/g, ' ')).toContain('42,50 €');

    const formattedUsd = formatCurrency(100, { locale: 'en-US', currency: 'USD' });
    expect(formattedUsd).toBe('$100.00');

    // NaN / Invalid number
    expect(formatCurrency(NaN)).toContain('0,00 €');
    expect(formatCurrency(null as unknown as number)).toContain('0,00 €');

    // Invalid currency code triggering fallback
    const fallback = formatCurrency(25.5, { currency: 'INVALID_CODE' });
    expect(fallback).toBe('25.50 INVALID_CODE');
  });
});

describe('@qoe/formatters - numbers', () => {
  it('formats compact counts with French and English symbols', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(42)).toBe('42');
    expect(formatCount(999)).toBe('999');
    expect(formatCount(1000)).toBe('1 k');
    expect(formatCount(1234)).toBe('1.2 k');
    expect(formatCount(1500)).toBe('1.5 k');
    expect(formatCount(1000000)).toBe('1 M');
    expect(formatCount(2400000)).toBe('2.4 M');
    expect(formatCount(1000000000)).toBe('1 Md');
    expect(formatCount(3500000000)).toBe('3.5 Md');

    // English locale
    expect(formatCount(1500000000, { locale: 'en' })).toBe('1.5 B');

    // Negative numbers
    expect(formatCount(-1234)).toBe('-1.2 k');
    expect(formatCount(-500)).toBe('-500');

    // Space option
    expect(formatCount(1234, { space: false })).toBe('1.2k');

    // Invalid values
    expect(formatCount(NaN)).toBe('0');
    expect(formatCount(null as unknown as number)).toBe('0');
  });

  it('calculates and formats percentages safely', () => {
    expect(formatPercentage(50, 100)).toBe(50);
    expect(formatPercentage(1, 3)).toBe(33);
    expect(formatPercentage(1, 3, { decimals: 2 })).toBe(33.33);
    expect(formatPercentage(10, 0)).toBe(0);
    expect(formatPercentage(NaN, 100)).toBe(0);
    expect(formatPercentage(50, NaN)).toBe(0);
  });
});

describe('@qoe/formatters - dates', () => {
  const fixedDate = new Date(2026, 7, 17, 14, 32, 0); // 17 août 2026 14:32

  it('formats niceDate correctly', () => {
    expect(niceDate(fixedDate)).toBe('17 août 2026 à 14:32');
    expect(niceDate(fixedDate.toISOString())).toBe(niceDate(fixedDate));
    expect(niceDate('invalid-date')).toBe('invalid-date');
  });

  it('formats niceDateShort correctly', () => {
    expect(niceDateShort(fixedDate)).toBe('17 août 2026');
    expect(niceDateShort(fixedDate.toISOString())).toBe('17 août 2026');
    expect(niceDateShort('invalid-date')).toBe('invalid-date');
  });

  it('formats post detail dates in Twitter/Bluesky style', () => {
    expect(formatPostDetailDate(fixedDate)).toBe('14:32 · 17/08/2026');
    expect(formatPostDetailDate('invalid-date')).toBe('invalid-date');
  });

  it('calculates relative timeAgo correctly', () => {
    const baseNow = fixedDate.getTime();

    // Just now (< 1 min)
    expect(timeAgo(new Date(baseNow - 30 * 1000), baseNow)).toBe('Maintenant');
    // Future date
    expect(timeAgo(new Date(baseNow + 5000), baseNow)).toBe('Maintenant');

    // Minutes (< 1h)
    expect(timeAgo(new Date(baseNow - 5 * 60 * 1000), baseNow)).toBe('5m');
    expect(timeAgo(new Date(baseNow - 59 * 60 * 1000), baseNow)).toBe('59m');

    // Hours (< 1 day)
    expect(timeAgo(new Date(baseNow - 3 * 3600 * 1000), baseNow)).toBe('3h');
    expect(timeAgo(new Date(baseNow - 23 * 3600 * 1000), baseNow)).toBe('23h');

    // Days (< 7 days)
    expect(timeAgo(new Date(baseNow - 3 * 86400 * 1000), baseNow)).toBe('3j');
    expect(timeAgo(new Date(baseNow - 6 * 86400 * 1000), baseNow)).toBe('6j');

    // Older than 7 days
    const oldDate = new Date(baseNow - 10 * 86400 * 1000);
    expect(timeAgo(oldDate, baseNow)).toBe(niceDateShort(oldDate));

    // Invalid date
    expect(timeAgo('invalid-date', baseNow)).toBe('invalid-date');
  });

  it('formats transaction dates with locale support and fallback', () => {
    const formatted = formatTransactionDate(fixedDate);
    expect(formatted).toContain('17');
    expect(formatted).toContain('2026');
    expect(formatTransactionDate('invalid-date')).toBe('');

    // Invalid locale triggering fallback to niceDate
    const fallback = formatTransactionDate(fixedDate, 'invalid_locale_xyz');
    expect(fallback).toBe('17 août 2026 à 14:32');
  });
});
