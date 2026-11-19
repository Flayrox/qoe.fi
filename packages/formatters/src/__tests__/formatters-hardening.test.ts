import { describe, expect, it } from 'vitest';
import {
  formatBalanceCents,
  formatCount,
  formatCurrency,
  formatPercentage,
  formatTransactionAmount,
  formatTransactionDate,
  niceDate,
  niceDateShort,
} from '../index';

// =====================================================================
// 🔒 Durcissement L12 — chaque test ci-dessous échouait avant correctif.
// =====================================================================

describe('🔢 entrées non finies (F162)', () => {
  it('refuse Infinity comme une entrée invalide, dans tous les formateurs', () => {
    // `Infinity` traversait `typeof num === 'number'` et sortait tel quel :
    // « Infinity Md », « Infinity », « +Infinity € », « ∞ € ».
    expect(formatCount(Infinity)).toBe('0');
    expect(formatCount(-Infinity)).toBe('0');
    expect(formatBalanceCents(Infinity)).toBe('0.00');
    expect(formatTransactionAmount(Infinity).formatted).toBe('0.00 €');
    expect(formatTransactionAmount(NaN).formatted).toBe('0.00 €');
    expect(formatCurrency(Infinity).replace(/\u202f|\u00a0/g, ' ')).toContain('0,00 €');
    expect(formatCurrency(-Infinity).replace(/\u202f|\u00a0/g, ' ')).toContain('0,00 €');
    expect(formatPercentage(Infinity, 100)).toBe(0);
    expect(formatPercentage(100, Infinity)).toBe(0);
  });
});

describe('🌍 repli localisé (F163)', () => {
  it('rend l’entrée invalide dans la locale demandée, comme le chemin valide', () => {
    // Le repli était codé en dur en français : `0,00 USD` au lieu de `$0.00`,
    // alors que `formatCurrency(100, { locale: 'en-US', currency: 'USD' })`
    // rend bien `$100.00`.
    expect(formatCurrency(NaN, { locale: 'en-US', currency: 'USD' })).toBe('$0.00');
    expect(formatCurrency(null as unknown as number, { locale: 'en-US', currency: 'USD' })).toBe(
      '$0.00'
    );
  });
});

describe('🧮 cohérence des options (F164)', () => {
  it('borne les décimales au lieu de perdre la devise et le groupement', () => {
    // `minimumFractionDigits > maximumFractionDigits` faisait lever `Intl`,
    // le `catch` rendait alors « 1.234 € » (trois décimales, sans groupement).
    const clamped = formatCurrency(1.2, {
      minimumFractionDigits: 3,
      maximumFractionDigits: 2,
    });
    expect(clamped.replace(/\u202f|\u00a0/g, ' ')).toContain('1,200 €');
  });

  it('ne rend pas une devise vide accompagnée d’un espace final', () => {
    // Code devise vide → RangeError → « 25.50 » avec un espace orphelin.
    expect(formatCurrency(25.5, { currency: '' })).toBe('25.50');
  });

  it('ignore des décimales non finies', () => {
    // `toFixed(NaN)` rendait « 25 » sans décimales.
    expect(
      formatCurrency(25.5, { minimumFractionDigits: NaN }).replace(/\u202f|\u00a0/g, ' ')
    ).toContain('25,50 €');
  });
});

describe('🕰️ fuseau déterministe (F165)', () => {
  const instant = '2026-08-17T22:30:00Z';

  it('rend la même heure sur le serveur (UTC) et sur le client (Paris)', () => {
    // `toLocaleDateString` suivait le fuseau ambiant : le serveur rendait
    // « 17 août 2026, 22:30 » (UTC) et le navigateur parisien
    // « 18 août 2026, 00:30 » → mismatch d’hydratation dans BillingClient.
    expect(formatTransactionDate(instant)).toContain('18 août 2026');
    expect(formatTransactionDate(instant)).toContain('00:30');
  });

  it('accepte un fuseau explicite', () => {
    // Le test tourne sous n’importe quel TZ : la sortie ne dépend que de
    // l’option, jamais de la machine.
    expect(formatTransactionDate(instant, 'fr-FR', 'UTC')).toContain('17 août 2026');
    expect(formatTransactionDate(instant, 'fr-FR', 'UTC')).toContain('22:30');
    expect(formatTransactionDate(instant, 'en-US', 'America/New_York')).toContain('6:30');
  });

  it('retombe sur le format absolu quand le fuseau est invalide', () => {
    const fallback = formatTransactionDate(instant, 'fr-FR', 'Bad/Zone');
    expect(fallback).not.toBe('');
    expect(fallback).toContain('août 2026');
  });
});

describe('📅 date seule (F166)', () => {
  it('interprète « 2026-08-17 » comme le 17 à minuit local, pas en UTC', () => {
    // `new Date('2026-08-17')` = minuit UTC : à New York la date affichée
    // était « 16 août 2026 ».
    expect(niceDateShort('2026-08-17')).toBe('17 août 2026');
    expect(niceDate('2026-08-17')).toBe('17 août 2026 à 00:00');
    // Les instants complets gardent leur fuseau d’origine.
    expect(niceDateShort('2026-08-17T12:00:00')).toBe('17 août 2026');
  });

  it('refuse une date civile impossible sans déborder sur le mois suivant', () => {
    // `new Date(2026, 1, 31)` vaut le 3 mars : la date était « corrigée » en
    // silence. On l'écarte comme une entrée invalide.
    expect(niceDateShort('2026-02-31')).toBe('2026-02-31');
    expect(niceDateShort('2026-13-01')).toBe('2026-13-01');
  });
});

/** Compte les constructions de `Intl` pendant `fn` (constructeur instrumenté). */
function countConstructions<T>(key: 'NumberFormat' | 'DateTimeFormat', fn: () => T): [T, number] {
  const intl = Intl as unknown as Record<string, unknown>;
  const Original = intl[key] as new (...args: never[]) => object;
  let count = 0;

  function Counting(this: object, ...args: never[]): object {
    count += 1;
    return Reflect.construct(Original, args);
  }

  intl[key] = Counting;
  try {
    return [fn(), count];
  } finally {
    intl[key] = Original;
  }
}

describe('♻️ mémoïsation Intl (F167)', () => {
  it('construit un seul NumberFormat pour des appels identiques', () => {
    // Un formateur mémoïsé est reconstruit à chaque appel (« got 3 times »).
    const [, count] = countConstructions('NumberFormat', () => {
      const options = { locale: 'de-DE', currency: 'CHF' };
      formatCurrency(1, options);
      formatCurrency(2, options);
      return formatCurrency(3, options);
    });
    expect(count).toBe(1);
  });

  it('construit un seul DateTimeFormat pour des appels identiques', () => {
    // `toLocaleDateString` en construisait un par appel.
    const [first, count] = countConstructions('DateTimeFormat', () => {
      formatTransactionDate('2026-08-17T22:30:00Z', 'de-DE', 'Asia/Tokyo');
      return formatTransactionDate('2026-08-18T22:30:00Z', 'de-DE', 'Asia/Tokyo');
    });
    expect(count).toBe(1);
    expect(first).not.toBe('');
  });
});

describe('📊 décimales de pourcentage (F168)', () => {
  it('ignore une précision non finie ou négative', () => {
    // `10 ** NaN` propageait `NaN` jusqu’à l’affichage.
    expect(formatPercentage(1, 3, { decimals: NaN })).toBe(33);
    expect(formatPercentage(1, 3, { decimals: -2 })).toBe(33);
    expect(formatPercentage(1, 3, { decimals: 2.7 })).toBe(33.33);
  });
});
