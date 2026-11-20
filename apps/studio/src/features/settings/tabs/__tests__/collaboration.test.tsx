// =====================================================================
// 🧪 CollaborationTab — une réponse qui échoue ne doit pas figer la ligne
// =====================================================================
// Même classe que F316/F317 de l'éditeur : sans capture, un rejet laissait
// `respondingId` posé, donc la ligne bloquée sur son indicateur et aucune
// explication. Le chargement, lui, ne doit jamais rester « en cours ».
// =====================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const list = vi.hoisted(() => vi.fn());
const respond = vi.hoisted(() => vi.fn());

vi.mock('../../collaboration-actions', () => ({
  getCollaborationRequestsAction: () => list(),
  respondToCollaborationRequestAction: (...args: unknown[]) => respond(...args),
}));

import { CollaborationTab } from '../collaboration';

const pendingRequest = {
  id: 'req-1',
  articleId: 'article-1',
  status: 'PENDING',
  article: { id: 'article-1', title: 'La ville sans voiture', slug: 'la-ville' },
  inviter: { id: 'u-1', name: 'Camille', username: 'camille' },
  invitee: null,
};

describe('CollaborationTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    list.mockResolvedValue({ success: true, received: [pendingRequest], sent: [] });
    respond.mockResolvedValue({ success: true });
  });

  it('explique l’échec d’une réponse et rend la ligne à nouveau actionnable', async () => {
    const user = userEvent.setup();
    respond.mockRejectedValue(new Error('Preuve forte requise'));

    render(<CollaborationTab />);

    await user.click(await screen.findByRole('button', { name: /accepter/i }));

    expect(await screen.findByText(/Preuve forte requise/)).toBeInTheDocument();
    const accept = screen.getByRole('button', { name: /accepter/i });
    expect(accept).not.toBeDisabled();
  });

  it('n’affiche pas un chargement éternel quand la lecture des invitations échoue', async () => {
    list.mockRejectedValue(new Error('Réseau coupé'));

    render(<CollaborationTab />);

    expect(await screen.findByText(/Réseau coupé/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/Chargement des invitations/)).toBeNull());
  });
});
