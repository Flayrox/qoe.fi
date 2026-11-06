import { t } from '@lingui/core/macro';
import { CalendarDate, Time } from '@internationalized/date';

export type ScheduleDraftParts = {
  date: CalendarDate | null;
  time: Time | null;
};

const pad = (value: number) => String(value).padStart(2, '0');

/** Valeur locale sans secondes, utilisée par les raccourcis et le brouillon. */
export function toLocalScheduleValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

/**
 * Le brouillon reste une heure locale (pas un ISO UTC) : `CalendarDate` et
 * `Time` représentent tous les deux des valeurs de calendrier sans fuseau.
 * On valide donc les composantes avant de les construire.
 */
export function parseScheduleDraft(value: string | null | undefined): ScheduleDraftParts {
  if (!value) return { date: null, time: null };
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?/.exec(value);
  if (!match) return { date: null, time: null };

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return { date: null, time: null };
  }

  const date = new CalendarDate(year, month, day);
  if (date.year !== year || date.month !== month || date.day !== day) {
    return { date: null, time: null };
  }

  return { date, time: new Time(hour, minute) };
}

/** Une date sans heure choisie reçoit 09:00, jamais minuit implicite. */
export function scheduleDraftFromParts(date: CalendarDate | null, time: Time | null): string {
  if (!date) return '';
  const resolvedTime = time ?? new Time(9, 0);
  return `${date.year}-${pad(date.month)}-${pad(date.day)}T${pad(resolvedTime.hour)}:${pad(
    resolvedTime.minute
  )}`;
}

/** Le changement de date conserve l'heure déjà choisie. */
export function applyScheduleDate(currentDraft: string, date: CalendarDate | null): string {
  return scheduleDraftFromParts(date, parseScheduleDraft(currentDraft).time);
}

/**
 * Le changement d'heure conserve la date. Si aucune date n'a encore été
 * choisie, on part du jour local courant pour que l'heure tapée ne soit pas
 * perdue ; l'auteur peut ensuite changer la date sans reperdre l'heure.
 */
export function applyScheduleTime(
  currentDraft: string,
  time: Time | null,
  today: CalendarDate = todayCalendarDate()
): string {
  return scheduleDraftFromParts(parseScheduleDraft(currentDraft).date ?? today, time);
}

export function todayCalendarDate(now: Date = new Date()): CalendarDate {
  return new CalendarDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** Raccourcis de programmation : les trois moments réellement demandés. */
export function schedulePresets(now: Date = new Date()): { label: string; value: string }[] {
  const nextHour = new Date(now.getTime() + 60 * 60 * 1000);
  nextHour.setMinutes(0, 0, 0);

  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0, 0, 0);

  const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
  const monday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + daysUntilMonday,
    9,
    0,
    0,
    0
  );

  return [
    { label: t`Dans 1 h`, value: toLocalScheduleValue(nextHour) },
    { label: t`Demain 9 h`, value: toLocalScheduleValue(tomorrow) },
    { label: t`Lundi 9 h`, value: toLocalScheduleValue(monday) },
  ];
}
