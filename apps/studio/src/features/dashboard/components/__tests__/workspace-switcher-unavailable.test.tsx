// =====================================================================
// 🧪 HeaderWorkspaceSwitcher — le sélecteur ne disparaît plus en silence
// =====================================================================
// Le défaut mesuré (R152) : `if (!res.success) return;` puis
// `if (!activeWorkspace) return null` retiraient le sélecteur du DOM quand
// `GET /v1/media/workspaces` échouait — l'utilisateur n'avait plus aucun
// moyen de savoir qu'il existe d'autres espaces, ni de réessayer. Il rend
// désormais un bouton « Espaces indisponibles » dont le clic relance la
// lecture.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// `setupFiles` rend un routeur neuf à chaque appel : l'effet se relancerait à
// chaque rendu. Le vrai `useRouter` est stable, on reproduit ce contrat.
const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/analytics',
  useSearchParams: () => new URLSearchParams(),
}));

const actions = vi.hoisted(() => ({
  getUserWorkspacesAction: vi.fn(),
  listPendingMediaInvitesAction: vi.fn(),
  acceptMediaInviteAction: vi.fn(),
}));

vi.mock('@/app/(creator)/media/actions', () => actions);

import { HeaderWorkspaceSwitcher } from '../HeaderWorkspaceSwitcher';

const PERSONAL = {
  id: 'user_1',
  name: 'Camille',
  slug: 'camille',
  logoUrl: null,
  type: 'PERSONAL' as const,
  role: 'OWNER',
};

describe('HeaderWorkspaceSwitcher — lecture échouée', () => {
  beforeEach(() => {
    actions.getUserWorkspacesAction.mockReset();
    actions.listPendingMediaInvitesAction.mockReset();
    actions.listPendingMediaInvitesAction.mockResolvedValue({ success: true, items: [] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('affiche un état indisponible au lieu de disparaître', async () => {
    actions.getUserWorkspacesAction.mockResolvedValue({ success: false, error: 'api down' });

    render(<HeaderWorkspaceSwitcher />);

    expect(
      await screen.findByRole('button', { name: 'Espaces de travail indisponibles — réessayer' })
    ).toBeInTheDocument();
    expect(screen.getByText('Espaces indisponibles')).toBeInTheDocument();
  });

  it('relance la lecture au clic, puis affiche le sélecteur quand elle réussit', async () => {
    actions.getUserWorkspacesAction
      .mockResolvedValueOnce({ success: false, error: 'api down' })
      .mockResolvedValueOnce({ success: true, personal: PERSONAL, medias: [] });

    const user = userEvent.setup();
    render(<HeaderWorkspaceSwitcher />);

    const retry = await screen.findByRole('button', {
      name: 'Espaces de travail indisponibles — réessayer',
    });
    await user.click(retry);

    await waitFor(() => {
      expect(actions.getUserWorkspacesAction).toHaveBeenCalledTimes(2);
    });
    expect(
      screen.queryByRole('button', { name: 'Espaces de travail indisponibles — réessayer' })
    ).toBeNull();
    expect(
      await screen.findByRole('button', { name: 'Changer d’espace de travail' })
    ).toBeInTheDocument();
  });
});
