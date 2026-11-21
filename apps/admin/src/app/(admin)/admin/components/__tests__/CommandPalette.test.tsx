// @vitest-environment jsdom
// =====================================================================
// 🧪 CommandPalette — copier un identifiant ne doit pas quitter la palette
// =====================================================================
// Chaque dossier de la palette porte un bouton « copier l'identifiant ».
// Ce bouton vit DANS l'élément sélectionnable de cmdk : sans barrière, le
// clic remonte et déclenche `onSelect`, donc la navigation vers le dossier —
// l'opérateur croyait copier, il a changé d'écran et perdu sa recherche.
// =====================================================================

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
}));

import { CommandPalette } from '../CommandPalette';

const dossier = {
  id: 'rep_42',
  queue: 'reports',
  title: 'Signalement de test',
  status: 'open',
  href: '/admin/reports/rep_42',
  slaState: 'on_track',
};

describe('CommandPalette — copie d’identifiant', () => {
  const writeText = vi.fn();

  beforeEach(() => {
    push.mockReset();
    writeText.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
  });

  it('copie l’identifiant sans naviguer vers le dossier', async () => {
    render(<CommandPalette capabilities={['admin.reports.read']} dossiers={[dossier]} />);

    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    const copy = await screen.findByRole('button', { name: /Copier l’identifiant du dossier/ });
    fireEvent.click(copy);

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('rep_42'));
    expect(push).not.toHaveBeenCalled();
  });
});
