// =====================================================================
// 📅 dates.ts — Formatage temporel unifié (relatif & absolu)
// =====================================================================

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const MONTHS_FR = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
] as const;

function parseDate(input: string | Date): Date | null {
  const d = typeof input === 'string' ? new Date(input) : input;
  if (!d || Number.isNaN(d.getTime())) {
    return null;
  }
  return d;
}

/**
 * Date absolue longue localisée en français, ex. « 17 août 2026 à 14:32 ».
 */
export function niceDate(iso: string | Date): string {
  const date = parseDate(iso);
  if (!date) return typeof iso === 'string' ? iso : '';

  const day = date.getDate();
  const month = MONTHS_FR[date.getMonth()] ?? '';
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${year} à ${hours}:${minutes}`;
}

/**
 * Date courte absolue, ex. « 17 août 2026 ».
 */
export function niceDateShort(iso: string | Date): string {
  const date = parseDate(iso);
  if (!date) return typeof iso === 'string' ? iso : '';

  const day = date.getDate();
  const month = MONTHS_FR[date.getMonth()] ?? '';
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

/**
 * Format Twitter / X pour le détail d'un post : « 18:19 · 18/08/2026 ».
 */
export function formatPostDetailDate(iso: string | Date): string {
  const date = parseDate(iso);
  if (!date) return typeof iso === 'string' ? iso : '';

  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${hours}:${minutes} · ${day}/${month}/${year}`;
}

/**
 * Temps relatif « à la Bluesky » :
 * - < 1m  → « Maintenant »
 * - < 1h  → « 5m »
 * - < 1j  → « 2h »
 * - < 7j  → « 3j »
 * - sinon → date courte (« 17 août 2026 »)
 *
 * `now` est injectable pour des tests déterministes.
 */
export function timeAgo(iso: string | Date, now: number = Date.now()): string {
  const date = parseDate(iso);
  if (!date) return typeof iso === 'string' ? iso : '';

  const timestamp = date.getTime();
  const diff = now - timestamp;

  if (diff < 0 || diff < MINUTE) return 'Maintenant';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}j`;
  return niceDateShort(date);
}

/**
 * Formate une date de transaction au format français (jour, mois court, heure).
 */
export function formatTransactionDate(dateInput: string | Date, locale: string = 'fr-FR'): string {
  const date = parseDate(dateInput);
  if (!date) return '';

  try {
    return date.toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return niceDate(date);
  }
}
