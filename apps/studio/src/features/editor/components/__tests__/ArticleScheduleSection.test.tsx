import { beforeAll, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ArticleScheduleSection } from '../ArticleScheduleSection';
import { todayCalendarDate } from '../../lib/schedule-draft';

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

function segment(type: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[role="spinbutton"][data-type="${type}"]`);
  if (!element) throw new Error(`Segment introuvable : ${type}`);
  return element;
}

/** Choisit une date dans le vrai calendrier du DatePicker, sans dépendre du clavier. */
async function selectCalendarDay(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^Date/ }));
  const dialog = await screen.findByRole('dialog');
  const cells = within(dialog).getAllByRole('gridcell');
  const target = cells
    .map((cell) => cell.querySelector<HTMLElement>('[role="button"], [tabindex]'))
    .find((element) => element && element.getAttribute('aria-disabled') !== 'true');

  if (!target) throw new Error('Aucun jour sélectionnable dans le calendrier');
  await user.click(target);
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
}

function ScheduleHarness({
  initialDraft = '',
  scheduledAt = null,
  onSchedule = vi.fn(),
  onClearSchedule = vi.fn(),
}: {
  initialDraft?: string;
  scheduledAt?: string | null;
  onSchedule?: () => void;
  onClearSchedule?: () => void;
}) {
  const [draft, setDraft] = useState(initialDraft);

  return (
    <>
      <ArticleScheduleSection
        status={scheduledAt ? 'SCHEDULED' : 'DRAFT'}
        scheduledAt={scheduledAt}
        scheduleDraft={draft}
        timeZoneLabel="Europe/Paris"
        onScheduleDraftChange={setDraft}
        onSchedule={onSchedule}
        onClearSchedule={onClearSchedule}
      />
      <output data-testid="schedule-draft">{draft}</output>
    </>
  );
}

async function typeTime(user: ReturnType<typeof userEvent.setup>) {
  segment('hour').focus();
  await user.keyboard('0830');
}

describe('ArticleScheduleSection', () => {
  it('date puis heure : conserve la date et applique l’heure', async () => {
    const user = userEvent.setup();
    render(<ScheduleHarness />);

    await selectCalendarDay(user);
    await waitFor(() =>
      expect(screen.getByTestId('schedule-draft').textContent).toMatch(/^\d{4}-\d{2}-\d{2}T09:00$/)
    );

    await typeTime(user);
    await waitFor(() =>
      expect(screen.getByTestId('schedule-draft').textContent).toMatch(/^\d{4}-\d{2}-\d{2}T08:30$/)
    );
  });

  it('heure puis date : part du jour local puis conserve l’heure', async () => {
    const user = userEvent.setup();
    render(<ScheduleHarness />);
    const today = todayCalendarDate().toString();

    await typeTime(user);
    await waitFor(() =>
      expect(screen.getByTestId('schedule-draft').textContent).toBe(`${today}T08:30`)
    );

    await selectCalendarDay(user);
    await waitFor(() =>
      expect(screen.getByTestId('schedule-draft').textContent).toMatch(/^\d{4}-\d{2}-\d{2}T08:30$/)
    );
  });

  it('applique les raccourcis de programmation', async () => {
    const user = userEvent.setup();
    render(<ScheduleHarness />);

    await user.click(screen.getByRole('button', { name: 'Demain 9 h' }));
    await waitFor(() =>
      expect(screen.getByTestId('schedule-draft').textContent).toMatch(/T09:00$/)
    );

    await user.click(screen.getByRole('button', { name: 'Lundi 9 h' }));
    await waitFor(() =>
      expect(screen.getByTestId('schedule-draft').textContent).toMatch(/T09:00$/)
    );

    await user.click(screen.getByRole('button', { name: 'Dans 1 h' }));
    await waitFor(() =>
      expect(screen.getByTestId('schedule-draft').textContent).toMatch(/T\d{2}:00$/)
    );
  });

  it('propose de reporter puis d’annuler une programmation existante', async () => {
    const user = userEvent.setup();
    const onSchedule = vi.fn();
    const onClearSchedule = vi.fn();
    const scheduledAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    render(
      <ScheduleHarness
        scheduledAt={scheduledAt}
        onSchedule={onSchedule}
        onClearSchedule={onClearSchedule}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Reporter' }));
    expect(onSchedule).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Annuler la programmation' }));
    expect(onClearSchedule).toHaveBeenCalledTimes(1);
  });
});
