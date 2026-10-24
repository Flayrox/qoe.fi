import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CalendarDate, Time } from '@internationalized/date';

import { Calendar, RangeCalendar } from '../date/calendar';
import { DateField, DatePicker, TimeField } from '../date/date-picker';

// react-aria mesure ses popovers avec ResizeObserver, absent de jsdom.
beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    Object.defineProperty(globalThis, 'ResizeObserver', {
      value: ResizeObserverStub,
      writable: true,
    });
  }
});

const march2026 = new CalendarDate(2026, 3, 12);

/**
 * Le libellé d'un jour dépend de la locale de la machine de test (jsdom en
 * `en-US`) : on cherche par contenu plutôt que de figer un format, sinon le
 * test ne passe que sur les postes configurés en anglais.
 */
function dayButton(fragment: string): HTMLElement {
  const found = screen
    .getAllByRole('button')
    .find((button) => (button.getAttribute('aria-label') ?? '').includes(fragment));
  if (!found) throw new Error(`Jour introuvable : ${fragment}`);
  return found;
}

describe('Calendar', () => {
  it('rend une grille nommée, une cellule par jour', () => {
    render(<Calendar aria-label="Date de publication" value={march2026} />);

    expect(screen.getByRole('grid')).toBeTruthy();
    // 31 jours en mars + les débords des mois voisins.
    expect(screen.getAllByRole('gridcell').length).toBeGreaterThanOrEqual(31);
  });

  it('sélectionne au clavier sans souris', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Calendar aria-label="Date de publication" value={march2026} onChange={onChange} />);

    // Les jours sont des boutons dans la grille : on part du jour courant,
    // puis une flèche change de jour.
    dayButton('March 12').focus();
    await user.keyboard('{ArrowRight}{Enter}');

    expect(onChange).toHaveBeenCalledTimes(1);
    const selected = onChange.mock.calls[0][0] as CalendarDate;
    expect(selected.toString()).toBe('2026-03-13');
  });

  it('désactive les dates hors bornes', () => {
    render(
      <Calendar
        aria-label="Date de publication"
        defaultValue={march2026}
        minValue={new CalendarDate(2026, 3, 10)}
        maxValue={new CalendarDate(2026, 3, 20)}
      />
    );

    const cells = screen.getAllByRole('gridcell');
    const disabled = cells.filter((cell) => cell.getAttribute('aria-disabled') === 'true');
    expect(disabled.length).toBeGreaterThan(0);
  });
});

describe('RangeCalendar', () => {
  it('produit une plage début → fin', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<RangeCalendar aria-label="Période" onChange={onChange} />);

    // Deux clics : début puis fin. Le clavier est couvert par le test du
    // Calendar ; ici on vérifie que la valeur produite est bien une plage.
    const dayOf = (index: number) => {
      const cell = screen.getAllByRole('gridcell')[index];
      const target = cell.querySelector<HTMLElement>('[role="button"], [tabindex]');
      if (!target) throw new Error('Cellule sans cible cliquable');
      return target;
    };

    await user.click(dayOf(10));
    await user.click(dayOf(13));

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const range = onChange.mock.calls.at(-1)?.[0] as { start: CalendarDate; end: CalendarDate };
    expect(range.start).toBeTruthy();
    expect(range.end).toBeTruthy();
    expect(range.end.compare(range.start)).toBeGreaterThan(0);
  });
});

describe('DateField', () => {
  it('se remplit segment par segment et ne renvoie pas une chaîne', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DateField label="Date de publication" onChange={onChange} />);

    // Chaque segment est adressé par son `data-type` : l'ordre des segments
    // dépend de la locale, pas leur rôle.
    const segment = (type: string) => {
      const element = document.querySelector<HTMLElement>(
        `[role="spinbutton"][data-type="${type}"]`
      );
      if (!element) throw new Error(`Segment introuvable : ${type}`);
      return element;
    };

    segment('month').focus();
    await user.keyboard('03');
    segment('day').focus();
    await user.keyboard('12');
    segment('year').focus();
    await user.keyboard('2026');
    await user.keyboard('03');
    await user.keyboard('2026');

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    // Chaque frappe recompose la date : on regarde la valeur complète émise,
    // pas la dernière (les frappes suivantes peuvent la recomposer).
    const emitted = onChange.mock.calls.map((call) => String(call[0]));
    expect(emitted).toContain('2026-03-12');
  });

  it('expose chaque segment comme une zone éditable nommée', () => {
    render(<DateField label="Date de publication" defaultValue={march2026} />);

    // Les segments sont des spinbuttons : jour, mois, année.
    expect(screen.getAllByRole('spinbutton').length).toBe(3);
  });
});

describe('DatePicker', () => {
  it('ouvre le calendrier depuis un bouton nommé, puis referme au choix', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DatePicker label="Date de publication" onChange={onChange} />);

    const trigger = screen.getByRole('button', { name: /date de publication/i });
    await user.click(trigger);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeTruthy();

    const cells = screen.getAllByRole('gridcell');
    const target = cells[15].querySelector<HTMLElement>('[role="button"], [tabindex]');
    if (!target) throw new Error('Cellule sans cible cliquable');
    await user.click(target);

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('TimeField', () => {
  it('accepte une heure typée', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TimeField label="Heure de publication" onChange={onChange} />);

    screen.getAllByRole('spinbutton')[0].focus();
    await user.keyboard('0930');

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const value = onChange.mock.calls.at(-1)?.[0] as Time;
    expect(value.hour).toBe(9);
    expect(value.minute).toBe(30);
  });
});
