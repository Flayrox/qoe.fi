// =====================================================================
// 📅 format — Helpers de formatage (dates, nombres, monnaie)
// =====================================================================

/**
 * 💰 Formate un montant en centimes → "12,50 €" (FR) ou "$12.50" (EN).
 */
export function formatCurrency(
  cents: number,
  currency: string = 'EUR',
  locale: string = 'fr-FR'
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(cents / 100);
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
  return `il y a ${Math.floor(diffDay / 365)} an${Math.floor(diffDay / 365) > 1 ? 's' : ''}`;
}

/**
 * 📝 Tronque un texte à N caractères en ajoutant "…".
 */
export function truncate(text: string, maxLength: number = 200): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trimEnd() + '…';
}

/**
 * 📧 Masque partiellement un email : j***@gmail.com
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  const maskedLocal = local[0] + '***';
  return `${maskedLocal}@${domain}`;
}
