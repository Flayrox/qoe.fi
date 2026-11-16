// =====================================================================
// 🧪 schedule-draft — programmation d'article sans dérive de fuseau
// =====================================================================
// Ces fonctions décident de l'heure réellement envoyée au serveur. Un bug ici
// publie au mauvais moment : elles méritent des tests de valeurs exactes,
// pas seulement de forme.
// =====================================================================

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
  it('formate une date locale sans secondes ni décalage UTC', () => {
    // 2 octobre 2026, 08:05 locales : surtout pas 06:05 (UTC en été).
    expect(toLocalScheduleValue(new Date(2026, 9, 2, 8, 5, 42))).toBe('2026-10-02T08:05');
    expect(toLocalScheduleValue(new Date(2026, 0, 1, 0, 0))).toBe('2026-01-01T00:00');
  });

  it('analyse un brouillon valide en date et heure de calendrier', () => {
    const { date, time } = parseScheduleDraft('2026-12-24T18:30');
    expect(parseScheduleDraft('2026-12-24T18:30:45').time?.minute).toBe(30);
    expect(date?.toString()).toBe('2026-12-24');
    expect(time?.toString()).toBe('18:30:00');
  });

  it('refuse silencieusement les brouillons vides ou mal formés', () => {
    for (const value of [null, undefined, '', 'n’importe quoi', '2026-12', '2026-12-24']) {
      expect(parseScheduleDraft(value)).toEqual({ date: null, time: null });
    }
  });

  it('refuse les composantes hors bornes au lieu de les normaliser', () => {
    // `new CalendarDate(2026, 13, 1)` roulerait sur janvier 2027 : on veut un refus.
    expect(parseScheduleDraft('2026-13-01T10:00')).toEqual({ date: null, time: null });
    expect(parseScheduleDraft('2026-02-30T10:00')).toEqual({ date: null, time: null });
    expect(parseScheduleDraft('2026-05-05T24:00')).toEqual({ date: null, time: null });
    expect(parseScheduleDraft('2026-05-05T10:61')).toEqual({ date: null, time: null });
  });

  it('applique 09:00 par défaut quand seule la date est choisie', () => {
    expect(scheduleDraftFromParts(new CalendarDate(2026, 11, 20), null)).toBe('2026-11-20T09:00');
    expect(scheduleDraftFromParts(new CalendarDate(2026, 11, 20), new Time(7, 5))).toBe(
      '2026-11-20T07:05'
    );
    expect(scheduleDraftFromParts(null, new Time(7, 5))).toBe('');
  });

  it('conserve l’heure existante lors d’un changement de date', () => {
    expect(applyScheduleDate('2026-11-20T14:45', new CalendarDate(2026, 12, 1))).toBe(
      '2026-12-01T14:45'
    );
    // Sans heure existante : 09:00, jamais minuit.
    expect(applyScheduleDate('', new CalendarDate(2026, 12, 1))).toBe('2026-12-01T09:00');
  });

  it('conserve la date existante lors d’un changement d’heure', () => {
    expect(applyScheduleTime('2026-11-20T14:45', new Time(22, 0))).toBe('2026-11-20T22:00');
  });

  it('repart du jour courant si l’heure est choisie avant la date', () => {
    const value = applyScheduleTime('', new Time(18, 30), new CalendarDate(2026, 3, 4));
    expect(value).toBe('2026-03-04T18:30');
  });

  it('propose trois raccourcis cohérents et futurs', () => {
    // Mardi 17 novembre 2026, 21:10 locales.
    const now = new Date(2026, 10, 17, 21, 10, 0, 0);
    const presets = schedulePresets(now);

    expect(presets.map((preset) => preset.label)).toEqual(['Dans 1 h', 'Demain 9 h', 'Lundi 9 h']);
    expect(presets[0].value).toBe('2026-11-17T22:00');
    expect(presets[1].value).toBe('2026-11-18T09:00');
    // Le lundi suivant (23/11), jamais « lundi prochain » à 7 jours pile.
    expect(presets[2].value).toBe('2026-11-23T09:00');

    for (const preset of presets) {
      expect(new Date(preset.value).getTime()).toBeGreaterThan(now.getTime());
    }
  });

  it('franchit correctement la fin de mois pour « demain 9 h »', () => {
    const presets = schedulePresets(new Date(2026, 11, 31, 22, 0, 0, 0));
    expect(presets[1].value).toBe('2027-01-01T09:00');
  });
});
