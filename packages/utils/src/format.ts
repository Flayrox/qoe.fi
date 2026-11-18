// =====================================================================
// 📅 format — Helpers de formatage (dates, nombres, monnaie)
// =====================================================================

import { formatCurrency as formatCurrencyBase } from '@qoe/formatters';

/**
 * 💰 Formate un montant en centimes → "12,50 €" (FR) ou "$12.50" (EN).
 */
export function formatCurrency(
  cents: number,
  currency: string = 'EUR',
  locale: string = 'fr-FR'
): string {
  return formatCurrencyBase(cents / 100, { currency, locale });
}

/**
 * 🔢 Formate un nombre avec séparateurs.
 *   1234 → "1 234" (FR) ou "1,234" (EN)
 */
export function formatNumber(num: number, locale: string = 'fr-FR'): string {
  return new Intl.NumberFormat(locale).format(num);
}

/**
 * ⏱️ Formate une durée en secondes → "2 min 30 s".
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (minutes < 60) return secs > 0 ? `${minutes} min ${secs} s` : `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours} h ${mins} min`;
}

/**
 * 📖 Formate un temps de lecture (en minutes).
 *   5 → "5 min de lecture"
 */
export function formatReadingTime(minutes: number): string {
  return `${minutes} min de lecture`;
}

/**
 * 📅 Formate une date en relatif ("il y a 2h", "hier", "3j").
 */
export function formatRelativeDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  // Une date invalide produisait « il y a NaN ans » dans l'interface : on
  // préfère ne rien afficher, l'appelant décide du repli.
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;
  if (diffHour < 24) return `il y a ${diffHour} h`;
  if (diffDay === 1) return 'hier';
  if (diffDay < 7) return `il y a ${diffDay} j`;
  if (diffDay < 30) return `il y a ${Math.floor(diffDay / 7)} sem`;
  if (diffDay < 365) return `il y a ${Math.floor(diffDay / 30)} mois`;
  const years = Math.floor(diffDay / 365);
  return `il y a ${years} an${years > 1 ? 's' : ''}`;
}

/**
 * 📝 Tronque un texte à N caractères en ajoutant "…".
 *
 * La coupe se fait en POINTS DE CODE, pas en unités UTF-16 : `substring`
 * coupait au milieu d'une paire de substitution et affichait un caractère
 * cassé (« \uD83D… ») sur les textes contenant des emojis.
 */
export function truncate(text: string, maxLength: number = 200): string {
  if (!text) return '';
  const limit = Number.isFinite(maxLength) ? Math.max(0, Math.floor(maxLength)) : 200;
  const characters = Array.from(text);
  if (characters.length <= limit) return text;
  if (limit === 0) return '…';
  return characters.slice(0, limit).join('').trimEnd() + '…';
}

/**
 * 📧 Masque partiellement un email : j***@gmail.com
 *
 * Une valeur qui n'est pas un email plausible est entièrement masquée :
 * renvoyer l'entrée telle quelle affichait une donnée personnelle brute dans
 * les écrans d'administration (journaux, exports) au lieu d'un masque.
 */
export function maskEmail(email: string): string {
  const value = (email ?? '').trim();
  const at = value.indexOf('@');
  if (at <= 0 || at !== value.lastIndexOf('@')) return '***';

  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (!domain.includes('.') || /\s/.test(value)) return '***';

  return `${local[0]}***@${domain}`;
}
