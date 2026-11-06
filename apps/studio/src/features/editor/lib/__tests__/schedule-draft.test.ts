import { describe, expect, it } from 'vitest';
import { CalendarDate, Time } from '@internationalized/date';
import {
  applyScheduleDate,
  applyScheduleTime,
  parseScheduleDraft,
  scheduleDraftFromParts,
  schedulePresets,
  toLocalScheduleValue,
} from '../schedule-draft';

describe('schedule-draft', () => {
  it('garde l’heure locale sans conversion UTC', () => {
    const local = new Date(2026, 9, 22, 18, 30);
    expect(toLocalScheduleValue(local)).toBe('2026-10-22T18:30');
  });

  it('parse une date et une heure locales', () => {
    const parsed = parseScheduleDraft('2026-10-22T18:30');

    expect(parsed.date?.toString()).toBe('2026-10-22');
    expect(parsed.time?.hour).toBe(18);
    expect(parsed.time?.minute).toBe(30);
  });

  it('rejette les dates et heures invalides', () => {
    expect(parseScheduleDraft('')).toEqual({ date: null, time: null });
    expect(parseScheduleDraft('pas-une-date')).toEqual({ date: null, time: null });
    expect(parseScheduleDraft('2026-02-31T18:30')).toEqual({ date: null, time: null });
    expect(parseScheduleDraft('2026-10-22T25:00')).toEqual({ date: null, time: null });
  });

  it('utilise 09:00 quand la date est choisie sans heure', () => {
    expect(scheduleDraftFromParts(new CalendarDate(2026, 10, 22), null)).toBe('2026-10-22T09:00');
  });

  it('date puis heure : conserve la date et applique l’heure choisie', () => {
    const afterDate = applyScheduleDate('', new CalendarDate(2026, 10, 22));
    expect(afterDate).toBe('2026-10-22T09:00');

    const afterTime = applyScheduleTime(afterDate, new Time(18, 30));
    expect(afterTime).toBe('2026-10-22T18:30');
  });

  it('heure puis date : part du jour local puis conserve l’heure choisie', () => {
    const today = new CalendarDate(2026, 11, 6);
    const afterTime = applyScheduleTime('', new Time(18, 30), today);
    expect(afterTime).toBe('2026-11-06T18:30');

    const afterDate = applyScheduleDate(afterTime, new CalendarDate(2026, 10, 22));
    expect(afterDate).toBe('2026-10-22T18:30');
  });

  it('calcule les trois raccourcis sur une date locale fixe', () => {
    const now = new Date(2026, 10, 6, 10, 45);

    expect(schedulePresets(now)).toEqual([
      { label: 'Dans 1 h', value: '2026-11-06T11:00' },
      { label: 'Demain 9 h', value: '2026-11-07T09:00' },
      { label: 'Lundi 9 h', value: '2026-11-09T09:00' },
    ]);
  });
});
