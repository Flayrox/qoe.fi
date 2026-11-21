// @vitest-environment jsdom
// =====================================================================
// 🧪 WorkTable — la copie d'identifiant ne peut pas échouer en silence
// =====================================================================
// `navigator.clipboard.writeText` renvoie une promesse : sans `await` ni
// `.catch`, un refus du navigateur (permission clipboard, page non focus,
// iframe) devient un rejet non géré — l'utilisateur ne voit rien, le
// navigateur crie dans la console, et la personne croit avoir copié.
// L'action doit donc absorber l'échec et le dire.
// =====================================================================

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

import { WorkTable } from '../WorkTable';
import type { AdminQueueTriageEntry } from '@/lib/admin-data';

const entry: AdminQueueTriageEntry = {
  queue: 'reports',
  id: 'rep_42',
  title: 'Signalement de test',
  status: 'open',
  assignedTo: null,
  assignedName: null,
  priority: 'normal',
  dueAt: null,
  slaDueAt: '2026-11-25T10:00:00.000Z',
  slaState: 'on_track',
  assignedToMe: false,
  href: '/admin/reports/rep_42',
};

describe('WorkTable — copie de l’identifiant', () => {
  const writeText = vi.fn();

  beforeEach(() => {
    writeText.mockReset();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function openAndCopy() {
    render(<WorkTable entries={[entry]} queueLabels={{ reports: 'Signalements' }} limit={10} />);

    fireEvent.click(screen.getByRole('button', { name: 'Actions de la ligne' }));
    const item = await screen.findByRole('menuitem', { name: /Copier l’identifiant/ });
    await act(async () => {
      fireEvent.click(item);
    });
  }

  it('dit à l’opérateur que la copie a échoué au lieu de laisser un rejet muet', async () => {
    writeText.mockRejectedValue(new Error('Write permission denied.'));

    await openAndCopy();

    expect(writeText).toHaveBeenCalledWith('rep_42');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/Copie impossible/));
  });

  it('confirme la copie réussie dans la barre de statut', async () => {
    writeText.mockResolvedValue(undefined);

    await openAndCopy();

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/Identifiant copié/));
  });
});
