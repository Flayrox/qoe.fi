// =====================================================================
// 💶 currency.ts — Formatage monétaire universel (web & mobile)
// =====================================================================

export interface FormattedTransactionAmount {
  formatted: string;
  isCredit: boolean;
  sign: string;
  euros: number;
}

export interface FormatCurrencyOptions {
  currency?: string;
  locale?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
}

/** Nombre de formateurs gardés en mémoire (locale × devise × décimales). */
const FORMATTER_CACHE_LIMIT = 64;
const numberFormats = new Map<string, Intl.NumberFormat>();

/**
 * Formateur `Intl.NumberFormat` mémoïsé : construire un formateur coûte
 * l'équivalent de plusieurs dizaines de formatages, et ces helpers sont
 * appelés à chaque rendu de liste (portefeuille, transactions).
 */
function getCurrencyFormatter(
  locale: string,
  currency: string,
  minimumFractionDigits: number,
  maximumFractionDigits: number
): Intl.NumberFormat | null {
  const key = `${locale}|${currency}|${minimumFractionDigits}|${maximumFractionDigits}`;
  const cached = numberFormats.get(key);
  if (cached) return cached;

  try {
    const formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits,
      maximumFractionDigits,
    });
    if (numberFormats.size >= FORMATTER_CACHE_LIMIT) numberFormats.clear();
    numberFormats.set(key, formatter);
    return formatter;
  } catch {
    // Locale ou code devise invalide : l'appelant décide du repli.
    return null;
  }
}

/** Décimales utilisables (entier, 0–20) — sinon le défaut. */
function normalizeDigits(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(0, Math.trunc(value)), 20);
}

/**
 * Formate un solde en centimes d'euro en chaîne décimale standard (ex: 4250 -> "42.50").
 */
export function formatBalanceCents(amountCents?: number | null): string {
  if (typeof amountCents !== 'number' || !Number.isFinite(amountCents)) {
    return '0.00';
  }
  return (amountCents / 100).toFixed(2);
}

/**
 * Formate le montant d'une transaction avec son signe explicite (+/-) et ses attributs.
 */
export function formatTransactionAmount(amountCents: number): FormattedTransactionAmount {
  // `Infinity`/`NaN` ne doivent jamais atteindre l'écran (« +Infinity € »).
  const cents = Number.isFinite(amountCents) ? amountCents : 0;
  const isCredit = cents > 0;
  const euros = cents / 100;
  const sign = isCredit ? '+' : '';
  const formatted = `${sign}${euros.toFixed(2)} €`;

  return {
    formatted,
    isCredit,
    sign,
    euros,
  };
}

/**
 * Formate un montant décimal avec la devise et la locale spécifiées via Intl.NumberFormat.
 *
 * Une entrée non finie (`NaN`, `±Infinity`, `null`) est rendue comme `0` **dans
 * la locale demandée** : `formatCurrency(NaN, { locale: 'en-US' })` donne
 * `$0.00`, pas `0,00 USD`.
 */
export function formatCurrency(amount: number, options: FormatCurrencyOptions = {}): string {
  const {
    currency = 'EUR',
    locale = 'fr-FR',
    minimumFractionDigits = 2,
    maximumFractionDigits = 2,
  } = options;

  const min = normalizeDigits(minimumFractionDigits, 2);
  // `Intl` lève un RangeError si max < min : on borne au lieu de perdre le
  // symbole, le groupement et la locale dans un repli brut.
  const max = Math.max(min, normalizeDigits(maximumFractionDigits, 2));
  const formatter = getCurrencyFormatter(locale, currency, min, max);

  if (!Number.isFinite(amount)) {
    // Repli d'entrée invalide : même locale et même devise que le chemin
    // valide, mais espaces insécables normalisés pour rester une chaîne
    // stable dans les écrans de repli (`0,00 €`, `$0.00`).
    const zero = formatter ? formatter.format(0) : null;
    if (zero !== null) return zero.replace(/[\u202f\u00a0]/g, ' ');
  }

  const value = Number.isFinite(amount) ? amount : 0;
  if (formatter) return formatter.format(value);

  const code = currency.trim();
  const suffix = code === '' ? '' : ` ${code === 'EUR' ? '€' : code}`;
  return `${value.toFixed(min)}${suffix}`;
}
