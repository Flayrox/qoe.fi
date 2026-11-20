// @vitest-environment jsdom
// =====================================================================
// L20c6 — MessagesApp : garanties écrites AVANT correctif
// =====================================================================
// 1. Si le chargement des conversations échoue, l'écran ne doit pas rester
//    sur un spinner éternel : `setLoadingList(false)` n'était appelé que sur
//    succès (`if (!res.ok) return;`), donc l'état d'erreur n'existait pas.
// 2. Deux conversations ouvertes coup sur coup : la réponse lente de la
//    première écrasait le fil de la seconde (aucun jeton de requête).
// 3. Une recherche de membre qui échoue doit le dire : `res.ok` faux ou un
//    rejet laissait « Aucun résultat. » (mensonge) ou le spinner à jamais.
// =====================================================================

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  getConversationsAction,
  getConversationMessagesAction,
  markConversationReadAction,
} from '@qoe/sdk/actions/messages';
import { searchUsersAction } from '@qoe/sdk/actions/feed';

vi.mock('@qoe/sdk/actions/messages', () => ({
  createConversationAction: vi.fn(),
  getConversationMessagesAction: vi.fn(),
  getConversationsAction: vi.fn(),
  markConversationReadAction: vi.fn(),
  sendMessageAction: vi.fn(),
}));
vi.mock('@qoe/sdk/actions/feed', () => ({ searchUsersAction: vi.fn() }));
vi.mock('@qoe/ui', () => ({ SafeAvatar: () => null }));

import { MessagesApp } from '../MessagesApp';

const listConversations = vi.mocked(getConversationsAction);
const listMessages = vi.mocked(getConversationMessagesAction);
const searchUsers = vi.mocked(searchUsersAction);

function conversation(id: string, name: string) {
  return {
    id,
    participant: { id: `user-${id}`, name, username: name.toLowerCase(), logoUrl: null },
    unreadCount: 0,
    lastMessage: null,
  };
}

function message(id: string, content: string) {
  return { id, senderId: 'user-b', content, createdAt: '2026-01-01T10:00:00.000Z' };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(markConversationReadAction).mockResolvedValue({ ok: true } as never);
  listMessages.mockResolvedValue({ ok: true, data: { messages: [] } } as never);
  searchUsers.mockResolvedValue({ ok: true, data: { users: [] } } as never);
});

describe('MessagesApp — chargement de la liste', () => {
  it('sort du spinner et affiche l’erreur quand la liste échoue', async () => {
    listConversations.mockResolvedValue({ ok: false, error: { message: 'boom' } } as never);

    const { container } = render(<MessagesApp />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Impossible de charger vos conversations.');
    // Le spinner du chargement initial ne doit pas rester.
    expect(container.querySelector('.animate-spin')).toBeNull();
  });
});

describe('MessagesApp — course entre deux conversations', () => {
  it('ignore la réponse de la conversation qu’on vient de quitter', async () => {
    let resolveSlow: (value: unknown) => void = () => {};
    const slow = new Promise((resolve) => {
      resolveSlow = resolve;
    });

    listConversations.mockResolvedValue({
      ok: true,
      data: [conversation('a', 'Alice'), conversation('b', 'Bob')],
    } as never);
    listMessages.mockImplementation((({ conversationId }: { conversationId: string }) =>
      conversationId === 'a'
        ? slow
        : Promise.resolve({
            ok: true,
            data: { messages: [message('m-b', 'réponse B')] },
          })) as never);

    render(<MessagesApp />);

    fireEvent.click(await screen.findByText('Alice'));
    fireEvent.click(screen.getByText('Bob'));

    await waitFor(() => expect(screen.getByText('réponse B')).toBeTruthy());

    // La réponse lente d'Alice arrive après : elle ne doit pas repeindre le fil.
    await act(async () => {
      resolveSlow({ ok: true, data: { messages: [message('m-a', 'message A')] } });
    });

    expect(screen.queryByText('message A')).toBeNull();
    expect(screen.getByText('réponse B')).toBeTruthy();
  });
});

describe('MessagesApp — recherche de membre', () => {
  it('dit l’échec au lieu de « Aucun résultat. » et coupe le spinner', async () => {
    listConversations.mockResolvedValue({ ok: true, data: [] } as never);
    searchUsers.mockRejectedValue(new Error('réseau'));

    const { container } = render(<MessagesApp />);

    fireEvent.click(screen.getByText('Nouveau message'));
    fireEvent.change(screen.getByPlaceholderText('Chercher un membre…'), {
      target: { value: 'ali' },
    });

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Recherche de membres impossible');
    expect(screen.queryByText('Aucun résultat.')).toBeNull();
    expect(container.querySelector('.animate-spin')).toBeNull();
  });
});

describe('MessagesApp — garde de source', () => {
  it('exige un jeton de course et un échec de liste non silencieux', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/messages/MessagesApp.tsx'),
      'utf8'
    );

    // Course : une réponse périmée ne doit pas pouvoir peindre le fil.
    expect(source).toContain('requestToken');
    // Liste : l'échec doit sortir du spinner, pas `return` en silence.
    expect(source).not.toMatch(/if \(!res\.ok\) return;\s*\n\s*setConversations/);
  });
});

describe('MessagesApp — mise en page mobile', () => {
  it('réagit au redimensionnement (l’aperçu calculé au rendu ne se rafraîchissait pas)', async () => {
    listConversations.mockResolvedValue({
      ok: true,
      data: [conversation('a', 'Alice')],
    } as never);

    // Aucun état ne doit bouger entre le rendu et le redimensionnement : le
    // marquage « lu » reste en vol, sinon le polling re-rend le composant et
    // masque l'absence d'écouteur (c'est ce qui rendait le défaut invisible).
    vi.mocked(markConversationReadAction).mockReturnValue(new Promise(() => {}) as never);

    const { container } = render(<MessagesApp />);
    fireEvent.click(await screen.findByText('Alice'));
    await screen.findByText(/Aucun message pour l'instant/);

    const aside = container.querySelector('aside') as HTMLElement;
    expect(aside.className).toContain('flex');

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 480 });
    fireEvent(window, new Event('resize'));

    await waitFor(() => expect(aside.className).toContain('hidden'));
  });
});
