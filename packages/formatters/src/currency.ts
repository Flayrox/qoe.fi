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

/**
 * Formate un solde en centimes d'euro en chaîne décimale standard (ex: 4250 -> "42.50").
 */
export function formatBalanceCents(amountCents?: number | null): string {
  if (typeof amountCents !== 'number' || Number.isNaN(amountCents)) {
    return '0.00';
  }
  return (amountCents / 100).toFixed(2);
}

/**
 * Formate le montant d'une transaction avec son signe explicite (+/-) et ses attributs.
 */
export function formatTransactionAmount(amountCents: number): FormattedTransactionAmount {
  const isCredit = amountCents > 0;
  const euros = amountCents / 100;
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
 */
export function formatCurrency(amount: number, options: FormatCurrencyOptions = {}): string {
  const {
    currency = 'EUR',
    locale = 'fr-FR',
    minimumFractionDigits = 2,
    maximumFractionDigits = 2,
  } = options;

  if (typeof amount !== 'number' || Number.isNaN(amount)) {
    return `0,00 ${currency === 'EUR' ? '€' : currency}`;
  }

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits,
      maximumFractionDigits,
    }).format(amount);
  } catch {
    const safeAmount = amount.toFixed(minimumFractionDigits);
    return `${safeAmount} ${currency === 'EUR' ? '€' : currency}`;
  }
}
