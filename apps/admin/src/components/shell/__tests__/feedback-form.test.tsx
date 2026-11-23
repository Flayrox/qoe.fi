// @vitest-environment jsdom
// =====================================================================
// 🧪 FeedbackForm — un refus de server action ne peut plus être muet
// =====================================================================
// Le défaut mesuré (R165) : `/admin/config` utilisait `<form action={…}>` avec
// des wrappers qui faisaient `await setSystemConfigAction(...)` sans lire le
// résultat. Un refus (capacité, validation Go) réaffichait l'état antérieur
// comme si le clic n'avait rien fait.
// =====================================================================

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const { toastSuccess, toastError, refresh } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('@qoe/ui/toast', () => ({
  toast: { success: toastSuccess, error: toastError },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

import { FeedbackForm } from '../feedback-form';

describe('FeedbackForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('annonce le motif d’un refus et ne revalide pas', async () => {
    const action = vi.fn().mockResolvedValue({ success: false, error: 'Capacité refusée' });
    render(
      <FeedbackForm action={action} successMessage="Enregistré">
        <input name="key" defaultValue="FEATURE_X" />
        <button type="submit">Enregistrer</button>
      </FeedbackForm>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Capacité refusée'));
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('annonce le succès et revalide la page', async () => {
    const action = vi.fn().mockResolvedValue({ success: true });
    render(
      <FeedbackForm action={action} successMessage="Configuration enregistrée">
        <input name="key" defaultValue="FEATURE_X" />
        <button type="submit">Enregistrer</button>
      </FeedbackForm>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Configuration enregistrée'));
    expect(refresh).toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });

  it('annonce un refus même sans motif', async () => {
    const action = vi.fn().mockResolvedValue({ success: false });
    render(
      <FeedbackForm action={action} successMessage="Enregistré">
        <button type="submit">Enregistrer</button>
      </FeedbackForm>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Action refusée'));
  });
});
