import { describe, it, expect } from 'vitest';
import { formatCount, niceDate, niceDateShort, formatPostDetailDate, timeAgo } from './format';

// ── formatCount : notation compacte tronquée ────────────────────────────
describe('formatCount', () => {
  it('laisse les petits nombres intacts', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(42)).toBe('42');
    expect(formatCount(999)).toBe('999');
  });

  it('passage au millier (k)', () => {
    expect(formatCount(1000)).toBe('1 k');
    expect(formatCount(1200)).toBe('1.2 k');
    // 1250 → tronqué à 1.2k (pas arrondi à 1.3k)
    expect(formatCount(1250)).toBe('1.2 k');
    expect(formatCount(999999)).toBe('999.9 k');
  });

  it('million (M) et milliard (Md)', () => {
    expect(formatCount(1_000_000)).toBe('1 M');
    expect(formatCount(3_400_000)).toBe('3.4 M');
    expect(formatCount(1_000_000_000)).toBe('1 Md');
  });

  it('aucun .0 superflu', () => {
    expect(formatCount(2000)).toBe('2 k');
    expect(formatCount(2_000_000)).toBe('2 M');
  });
});

// ── niceDate / niceDateShort / formatPostDetailDate ─────────────────────
describe('niceDate (localisé FR)', () => {
  it('affiche « 17 août 2026 à 14:32 »', () => {
    expect(niceDate('2026-08-17T14:32:00')).toBe('17 août 2026 à 14:32');
  });

  it('retourne l’entrée telle quelle si date invalide', () => {
    expect(niceDate('pas-une-date')).toBe('pas-une-date');
  });
});

describe('niceDateShort', () => {
  it('affiche « 17 août 2026 »', () => {
    expect(niceDateShort('2026-08-17T10:00:00')).toBe('17 août 2026');
  });

  it('retourne l’entrée si invalide', () => {
    expect(niceDateShort('--')).toBe('--');
  });
});

describe('formatPostDetailDate', () => {
  it('affiche « 18:19 · 18/08/2026 »', () => {
    expect(formatPostDetailDate('2026-08-18T18:19:00')).toMatch(/^18:19 · 18\/08\/2026$/);
  });

  it('retourne l’entrée si invalide', () => {
    expect(formatPostDetailDate('x')).toBe('x');
  });
});

// ── timeAgo : temps relatif « à la Bluesky », now injectable ────────────
describe('timeAgo', () => {
  const NOW = new Date('2026-08-18T18:00:00').getTime();
  const iso = (date: string) => new Date(date).toISOString();

  it('moins d’une minute → « Maintenant »', () => {
    expect(timeAgo(iso('2026-08-18T17:59:30'), NOW)).toBe('Maintenant');
  });

  it('heures écoulées en minutes (m)', () => {
    expect(timeAgo(iso('2026-08-18T17:55:00'), NOW)).toBe('5m');
  });

  it('jours en heures (h)', () => {
    expect(timeAgo(iso('2026-08-18T12:00:00'), NOW)).toBe('6h');
  });

  it('moins de 7 jours en jours (j)', () => {
    expect(timeAgo(iso('2026-08-15T18:00:00'), NOW)).toBe('3j');
  });

  it('au-delà de 7 jours → date courte', () => {
    expect(timeAgo(iso('2026-08-01T12:00:00'), NOW)).toBe('1 août 2026');
  });

  it('retourne l’entrée si invalide', () => {
    expect(timeAgo('nope', NOW)).toBe('nope');
  });
});
