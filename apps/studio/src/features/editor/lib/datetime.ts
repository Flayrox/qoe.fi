const pad = (value: number) => String(value).padStart(2, '0');

/**
 * Convertit une date ISO (UTC) en valeur `datetime-local` **locale**.
 * `toISOString().slice(0, 16)` affichait l'heure UTC dans un champ interprété
 * comme local : l'auteur voyait un décalage de son fuseau horaire.
 */
export function toDateTimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

/**
 * Interprète une valeur `datetime-local` dans le fuseau du navigateur.
 * `new Date('2026-10-22T18:30')` suit la spec HTML (heure locale), on garde
 * ce comportement mais on centralise la validation.
 */
export function parseDateTimeLocalValue(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Date de programmation lisible, avec le fuseau réel de l'utilisateur. */
export function formatScheduledAt(iso: string | null | undefined, locale?: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}

/** Nom court du fuseau courant (ex. « Europe/Paris », « UTC »). */
export function currentTimeZoneLabel(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'local';
  } catch {
    return 'local';
  }
}
