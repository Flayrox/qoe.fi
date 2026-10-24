'use client';

import { useState } from 'react';
import { CalendarDate, type DateValue } from '@internationalized/date';
import { Calendar } from '@qoe/ui/calendar';
import { DateField, DatePicker, DateRangePicker, TimeField } from '@qoe/ui/date-picker';
import { DefectList, Variant } from '../specimen-frame';

const march2026 = new CalendarDate(2026, 3, 12);

export function DatesSpecimen() {
  const [day, setDay] = useState<DateValue | null>(march2026);
  const [range, setRange] = useState<{ start: DateValue; end: DateValue } | null>({
    start: new CalendarDate(2026, 3, 2),
    end: new CalendarDate(2026, 3, 9),
  });

  return (
    <div className="grid gap-10">
      <Variant
        label="Ce qui existe aujourd’hui"
        kind="actuel"
        hint="Trois façons de saisir une date coexistent : l’input natif (dont le format dépend de la machine), un champ texte libre, et un calendrier react-day-picker dont la navigation clavier s’arrête à la souris."
      >
        <div className="grid max-w-md gap-3">
          <input
            type="date"
            defaultValue="2026-03-12"
            aria-label="Date (natif)"
            className="rounded-lg border border-border/40 bg-background px-3 py-2 text-xs"
          />
          <input
            type="text"
            placeholder="12/03/2026"
            aria-label="Date (texte libre)"
            className="rounded-lg border border-border/40 bg-background px-3 py-2 text-xs"
          />
        </div>

        <DefectList
          items={[
            '`type="date"` s’affiche jj/mm/aaaa ou mm/dd/yyyy selon la machine',
            'Un champ texte libre accepte « 32/13/2026 » : la validation arrive après coup',
            'Aucune borne (min/max) n’est appliquée côté champ',
            'Le format renvoyé est une chaîne à reparser, donc à interpréter différemment selon le fuseau',
          ]}
        />
      </Variant>

      <Variant
        label="Le champ — segments plutôt que texte"
        kind="candidat"
        hint="Chaque segment (jour, mois, année) est une zone éditable avec ses bornes. La valeur qui sort est une date typée, jamais une chaîne à reparser."
      >
        <div className="grid max-w-md gap-3">
          <DateField label="Date de publication" defaultValue={march2026} />
          <DatePicker
            label="Programmer la publication"
            defaultValue={march2026}
            minValue={new CalendarDate(2026, 1, 1)}
          />
          <DateRangePicker
            label="Période des statistiques"
            value={range as never}
            onChange={(next) => setRange(next as never)}
          />
          <TimeField label="Heure d’envoi" />
        </div>

        <DefectList
          items={[
            'Les bornes min/max désactivent les jours hors plage, dans le calendrier comme au clavier',
            'Le déclencheur du calendrier est un bouton nommé, atteint séparément de la date',
            'Flèches, PageUp/PageDown et Home/End fonctionnent : le calendrier est utilisable sans souris',
          ]}
        />
      </Variant>

      <Variant
        label="Le calendrier seul"
        kind="candidat"
        hint="Le même composant, sans champ : ce que le sélecteur de date des réglages utilisera. La locale suit l’application, pas une valeur codée ici."
      >
        <div className="flex flex-wrap items-start gap-6">
          <Calendar aria-label="Calendrier simple" value={day} onChange={setDay} />
          <Calendar
            aria-label="Calendrier avec bornes"
            value={day}
            onChange={setDay}
            maxValue={new CalendarDate(2026, 3, 20)}
          />
        </div>

        <DefectList
          items={[
            'Aujourd’hui est cerclé, la sélection est pleine : deux états distincts',
            'Les jours hors du mois restent lisibles mais atténués',
            'Les jours hors bornes sont barrés et inertes, pas seulement gris',
          ]}
        />
      </Variant>
    </div>
  );
}
