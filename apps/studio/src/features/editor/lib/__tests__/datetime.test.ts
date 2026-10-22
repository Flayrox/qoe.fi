import { describe, expect, it } from 'vitest';
import {
  currentTimeZoneLabel,
  formatScheduledAt,
  parseDateTimeLocalValue,
  toDateTimeLocalValue,
} from '../datetime';

describe('datetime helpers', () => {
  it('convertit un ISO en datetime-local local sans décalage UTC', () => {
    const local = new Date(2026, 9, 22, 18, 30);
    expect(toDateTimeLocalValue(local.toISOString())).toBe('2026-10-22T18:30');
  });

  it('retourne une chaîne vide sur une date invalide', () => {
    expect(toDateTimeLocalValue('pas-une-date')).toBe('');
    expect(toDateTimeLocalValue(null)).toBe('');
  });

  it('interprète datetime-local dans le fuseau du navigateur', () => {
    const parsed = parseDateTimeLocalValue('2026-10-22T18:30');
    expect(parsed).not.toBeNull();
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getHours()).toBe(18);
    expect(parsed?.getMinutes()).toBe(30);
  });

  it('rejette une valeur datetime-local invalide', () => {
    expect(parseDateTimeLocalValue('')).toBeNull();
    expect(parseDateTimeLocalValue('nope')).toBeNull();
  });

  it('expose un fuseau lisible et formate la date programmee', () => {
    expect(currentTimeZoneLabel().length).toBeGreaterThan(0);
    const formatted = formatScheduledAt('2026-10-22T16:30:00.000Z', 'fr-FR');
    expect(formatted).toContain('2026');
  });
});
