// @vitest-environment jsdom
// =====================================================================
// ⌚ TimePickerInput — un champ qui prend les chiffres, pas le clavier
// =====================================================================
// 📖 Le champ posait `preventDefault()` sur TOUTES les touches sauf Tab.
//    Il bloquait donc Copier/Coller, ⌘A, Entrée (impossible de valider le
//    popover depuis le champ) et Retour arrière. Ces tests verrouillent la
//    frontière : nos flèches et nos chiffres, le reste au navigateur.
// =====================================================================

import React, { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { createEvent, fireEvent, render } from '@testing-library/react';

import { TimePickerInput } from '../time-picker-input';
import type { TimePickerType } from '../time-picker-utils';

function Harness({ picker }: { picker: TimePickerType }) {
  const [date, setDate] = useState<Date | undefined>(() => new Date(2026, 10, 18, 9, 5, 0));
  return (
    <>
      <TimePickerInput picker={picker} date={date} setDate={setDate} aria-label={picker} />
      <output data-testid="value">
        {date ? `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}` : '—'}
      </output>
    </>
  );
}

function keyDown(input: HTMLElement, init: KeyboardEventInit) {
  const event = createEvent.keyDown(input, init);
  fireEvent(input, event);
  return event;
}

describe('TimePickerInput — frontière clavier', () => {
  it('rend au navigateur les raccourcis de copie et de sélection', () => {
    render(<Harness picker="hours" />);
    const input = document.querySelector('input')!;

    expect(keyDown(input, { key: 'c', metaKey: true }).defaultPrevented).toBe(false);
    expect(keyDown(input, { key: 'c', ctrlKey: true }).defaultPrevented).toBe(false);
    expect(keyDown(input, { key: 'a', ctrlKey: true }).defaultPrevented).toBe(false);
    expect(keyDown(input, { key: 'v', metaKey: true }).defaultPrevented).toBe(false);
  });

  it('laisse Entrée valider le formulaire et Retour arrière agir', () => {
    render(<Harness picker="minutes" />);
    const input = document.querySelector('input')!;

    expect(keyDown(input, { key: 'Enter' }).defaultPrevented).toBe(false);
    expect(keyDown(input, { key: 'Backspace' }).defaultPrevented).toBe(false);
    expect(keyDown(input, { key: 'Tab' }).defaultPrevented).toBe(false);
  });

  it('incrémente l’heure avec la flèche haut', () => {
    render(<Harness picker="hours" />);
    const input = document.querySelector('input')!;

    const event = keyDown(input, { key: 'ArrowUp' });

    expect(event.defaultPrevented).toBe(true);
    expect(document.querySelector('[data-testid="value"]')?.textContent).toBe('10:05');
  });

  it('compose deux chiffres pour une heure', () => {
    render(<Harness picker="hours" />);
    const input = document.querySelector('input')!;

    keyDown(input, { key: '1' });
    expect(document.querySelector('[data-testid="value"]')?.textContent).toBe('1:05');

    keyDown(input, { key: '2' });
    expect(document.querySelector('[data-testid="value"]')?.textContent).toBe('12:05');
  });
});
