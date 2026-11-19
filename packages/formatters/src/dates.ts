// =====================================================================
// 📅 dates.ts — Formatage temporel unifié (relatif & absolu)
// =====================================================================

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// R69 — constante interne : aucun consommateur hors du paquet, elle ne sort
// donc plus par le barrel (`MONTHS_FR` n'était importé nulle part).
const MONTHS_FR = [
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

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDate(input: string | Date): Date | null {
  if (typeof input === 'string') {
    // « 2026-08-17 » est une date civile, pas un instant : `new Date()` la
    // lisait comme minuit UTC et l'affichait le 16 à New York. On la construit
    // à minuit **local**, seul sens stable quel que soit le fuseau.
    const match = DATE_ONLY.exec(input.trim());
    if (match) {
      const [, year, month, day] = match;
      const value = new Date(Number(year), Number(month) - 1, Number(day));
      const exact =
        value.getFullYear() === Number(year) &&
        value.getMonth() === Number(month) - 1 &&
        value.getDate() === Number(day);
      return exact ? value : null;
    }
  }

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

/** Fuseau de référence des dates de facturation (produit français). */
export const DEFAULT_TIME_ZONE = 'Europe/Paris';

const DATE_TIME_FORMAT_LIMIT = 32;
const dateTimeFormats = new Map<string, Intl.DateTimeFormat>();

/** Formateur date+heure mémoïsé (locale × fuseau). */
function getDateTimeFormatter(locale: string, timeZone: string): Intl.DateTimeFormat | null {
  const key = `${locale}|${timeZone}`;
  const cached = dateTimeFormats.get(key);
  if (cached) return cached;

  try {
    const formatter = new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone,
    });
    if (dateTimeFormats.size >= DATE_TIME_FORMAT_LIMIT) dateTimeFormats.clear();
    dateTimeFormats.set(key, formatter);
    return formatter;
  } catch {
    return null;
  }
}

/**
 * Formate une date de transaction au format français (jour, mois court, heure).
 *
 * `timeZone` est **explicite** et vaut `Europe/Paris` par défaut : suivre le
 * fuseau ambiant faisait diverger le rendu serveur (UTC) du rendu client
 * (Paris) — « 17 août 2026, 22:30 » contre « 18 août 2026, 00:30 » — donc un
 * mismatch d'hydratation React dès qu'un composant client était prérendu.
 */
export function formatTransactionDate(
  dateInput: string | Date,
  locale: string = 'fr-FR',
  timeZone: string = DEFAULT_TIME_ZONE
): string {
  const date = parseDate(dateInput);
  if (!date) return '';

  const formatter = getDateTimeFormatter(locale, timeZone);
  if (!formatter) return niceDate(date);

  return formatter.format(date);
}
