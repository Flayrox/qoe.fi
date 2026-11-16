// @vitest-environment jsdom
// =====================================================================
// 🧪 MessagesApp — rendu et chargement initial
// =====================================================================
// Ce composant n'avait aucun test, et son instrumentation de couverture était
// impossible : il importe `@qoe/sdk/actions/messages`, un sous-chemin qui
// n'était pas déclaré dans les `exports` du paquet SDK. Déclaré depuis, ce qui
// rend le fichier mesurable — sinon il disparaissait silencieusement du rapport.
// =====================================================================

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

import { getConversationsAction } from '@qoe/sdk/actions/messages';
import { searchUsersAction } from '@qoe/sdk/actions/feed';

import { MessagesApp } from '../MessagesApp';

vi.mock('@qoe/sdk/actions/messages', () => ({
  createConversationAction: vi.fn(),
  getConversationMessagesAction: vi.fn(),
  getConversationsAction: vi.fn(),
  markConversationReadAction: vi.fn(),
  sendMessageAction: vi.fn(),
}));
vi.mock('@qoe/sdk/actions/feed', () => ({ searchUsersAction: vi.fn() }));
vi.mock('@qoe/ui', () => ({ SafeAvatar: () => null }));

const listConversations = vi.mocked(getConversationsAction);
const searchUsers = vi.mocked(searchUsersAction);

// `apps/core` n'active pas le cleanup automatique de Testing Library : sans
// ça, le DOM des tests précédents s'accumule et les `getByRole` deviennent
// ambigus dès que la suite complète tourne.
afterEach(cleanup);

describe('MessagesApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listConversations.mockResolvedValue({ ok: true, data: [] } as never);
    searchUsers.mockResolvedValue({ ok: true, data: [] } as never);
  });

  it('affiche la messagerie même sans conversation', async () => {
    render(<MessagesApp />);

    // En-têtes desktop + mobile : le titre apparaît deux fois.
    expect(screen.getAllByRole('heading', { name: 'Messages' }).length).toBeGreaterThan(0);
    await waitFor(() => expect(listConversations).toHaveBeenCalled());
  });

  it('n’affiche pas d’erreur quand le chargement aboutit', async () => {
    render(<MessagesApp />);

    await waitFor(() => expect(listConversations).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('reste utilisable quand l’API échoue (liste vide, pas de crash)', async () => {
    listConversations.mockResolvedValue({ ok: false, error: { message: 'boom' } } as never);

    render(<MessagesApp />);

    await waitFor(() => expect(listConversations).toHaveBeenCalled());
    expect(screen.getAllByRole('heading', { name: 'Messages' }).length).toBeGreaterThan(0);
  });
});
