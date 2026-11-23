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

import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { act, cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  createConversationAction,
  getConversationsAction,
  getConversationMessagesAction,
  markConversationReadAction,
  sendMessageAction,
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

const { tCalls } = vi.hoisted(() => ({ tCalls: [] as string[] }));

vi.mock('@lingui/core/macro', () => ({
  t: (strings: TemplateStringsArray | string, ...values: unknown[]) => {
    const message = Array.isArray(strings)
      ? strings.reduce((res, str, i) => res + str + (values[i] ?? ''), '')
      : String(strings);
    tCalls.push(message);
    return message;
  },
}));
vi.mock('@qoe/ui', () => ({ SafeAvatar: () => null }));

import { MessagesApp } from '../MessagesApp';
import { fileURLToPath } from 'node:url';

// Ancrage indépendant du cwd : `pnpm test:coverage` tourne depuis la racine du
// monorepo et `turbo run test` depuis `apps/core` — `CORE_DIR` ne pointe
// donc pas toujours sur l'app. La racine est déduite du fichier de test.
const CORE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

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

// `globals: false` : Testing Library n'auto-nettoie pas, un DOM laissé par
// le test précédent ferait passer des `findByText` sur le mauvais arbre.
afterEach(() => cleanup());

beforeEach(() => {
  vi.clearAllMocks();
  tCalls.length = 0;
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
      resolve(CORE_DIR, 'src/components/messages/MessagesApp.tsx'),
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

describe('MessagesApp — i18n (R135)', () => {
  it('passe les titres, panneaux et libellés du fil par `t`', async () => {
    listConversations.mockResolvedValue({
      ok: true,
      data: [conversation('a', 'Alice')],
    } as never);
    listMessages.mockResolvedValue({
      ok: true,
      data: { messages: [message('m1', 'Bonjour')] },
    } as never);

    render(<MessagesApp />);
    fireEvent.click(await screen.findByText('Alice'));

    expect(tCalls).toContain('Messages');
    expect(tCalls).toContain('Vos conversations privées et échanges directs.');
    expect(tCalls).toContain('Nouveau message');
    expect(tCalls).toContain('Écrire un message…');
    expect(tCalls).toContain('Envoyer');
    expect(tCalls).toContain('Retour');
  });

  it('passe les états vides de la liste et du fil par `t`', async () => {
    listConversations.mockResolvedValue({ ok: true, data: [] } as never);

    render(<MessagesApp />);
    await screen.findByText('Aucune conversation.');

    expect(tCalls).toContain('Aucune conversation.');
    expect(tCalls).toContain('Envoyez votre premier message à un membre de la communauté.');
    expect(tCalls).toContain('Vos messages privés');
    expect(tCalls).toContain(
      'Sélectionnez une conversation — ou lancez-en une nouvelle avec le bouton ci-dessus.'
    );

    cleanup();
    tCalls.length = 0;
    listConversations.mockResolvedValue({
      ok: true,
      data: [conversation('a', 'Alice')],
    } as never);

    render(<MessagesApp />);
    fireEvent.click(await screen.findByText('Alice'));
    await screen.findByText(/Aucun message pour l'instant/);
    expect(tCalls.some((call) => call.startsWith('Aucun message pour l'))).toBe(true);
  });

  it('passe les libellés interpolés par `t` (préfixe « Vous : », nom de repli)', async () => {
    listConversations.mockResolvedValue({
      ok: true,
      data: [
        {
          ...conversation('a', 'Alice'),
          lastMessage: {
            id: 'm1',
            // Envoyé par moi : le préfixe « Vous : » n'apparaît que dans ce cas.
            senderId: 'user-me',
            content: 'Coucou',
            createdAt: '2026-01-01T10:00:00.000Z',
          },
        },
        {
          id: 'b',
          participant: { id: 'user-b', name: null, username: null, logoUrl: null },
          unreadCount: 0,
          lastMessage: null,
        },
      ],
    } as never);

    render(<MessagesApp />);
    await screen.findByText('Alice');

    expect(tCalls).toContain('Vous : Coucou');
    expect(tCalls).toContain('Utilisateur');
    expect(tCalls).toContain('Conversation vide');
  });

  it('passe les erreurs de liste, de recherche et d’envoi par `t`', async () => {
    listConversations.mockResolvedValue({ ok: false, error: { message: 'boom' } } as never);
    render(<MessagesApp />);
    await screen.findByRole('alert');
    expect(tCalls).toContain('Impossible de charger vos conversations.');

    cleanup();
    tCalls.length = 0;
    vi.clearAllMocks();
    listConversations.mockResolvedValue({
      ok: true,
      data: [conversation('a', 'Alice')],
    } as never);
    listMessages.mockResolvedValue({ ok: true, data: { messages: [] } } as never);
    vi.mocked(sendMessageAction).mockResolvedValue({ ok: false, error: null } as never);

    render(<MessagesApp />);
    fireEvent.click(await screen.findByText('Alice'));
    fireEvent.change(screen.getByPlaceholderText('Écrire un message…'), {
      target: { value: 'Hello' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));

    await waitFor(() => expect(tCalls).toContain('Envoi impossible'));
  });

  it('passe le libellé de recherche et son échec par `t`', async () => {
    listConversations.mockResolvedValue({ ok: true, data: [] } as never);
    searchUsers.mockRejectedValue(new Error('réseau'));

    render(<MessagesApp />);
    fireEvent.click(screen.getByText('Nouveau message'));
    expect(tCalls).toContain('Chercher un membre…');

    fireEvent.change(screen.getByPlaceholderText('Chercher un membre…'), {
      target: { value: 'ali' },
    });

    await screen.findByRole('alert');
    expect(tCalls).toContain('Recherche de membres impossible pour le moment.');
  });

  it('passe l’échec de création de conversation par `t`', async () => {
    listConversations.mockResolvedValue({ ok: true, data: [] } as never);
    searchUsers.mockResolvedValue({
      ok: true,
      data: {
        users: [{ id: 'u9', name: 'Zoe', username: 'zoe', logoUrl: null, isCertified: false }],
      },
    } as never);
    vi.mocked(createConversationAction).mockResolvedValue({ ok: false, error: null } as never);

    render(<MessagesApp />);
    fireEvent.click(screen.getByText('Nouveau message'));
    fireEvent.change(screen.getByPlaceholderText('Chercher un membre…'), {
      target: { value: 'zo' },
    });
    fireEvent.click(await screen.findByText('Zoe'));

    await waitFor(() => expect(tCalls).toContain('Conversation impossible à créer'));
  });

  it('passe la date relative « hier » par `t`', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(9, 0, 0, 0);

    listConversations.mockResolvedValue({
      ok: true,
      data: [
        {
          ...conversation('a', 'Alice'),
          lastMessage: {
            id: 'm1',
            senderId: 'user-a',
            content: 'Hier',
            createdAt: yesterday.toISOString(),
          },
        },
      ],
    } as never);

    render(<MessagesApp />);
    await screen.findByText('Alice');

    expect(tCalls).toContain('hier');
  });

  it('interdit tout littéral français en dur (garde de source)', () => {
    const source = readFileSync(
      resolve(CORE_DIR, 'src/components/messages/MessagesApp.tsx'),
      'utf8'
    );
    const labels = [
      '</h1>',
      'Vos conversations privées',
      'Nouveau message',
      'Chercher un membre…',
      'Recherche…',
      'Aucun résultat.',
      'Aucune conversation.',
      'Envoyez votre premier message',
      'Utilisateur',
      'Conversation vide',
      'Vous : ',
      'hier',
      'Vos messages privés',
      'Sélectionnez une conversation',
      'Retour',
      "Aucun message pour l'instant",
      'Écrire un message…',
      'Envoyer',
      'Impossible de charger vos conversations.',
      'Impossible de charger cette conversation.',
      'Envoi impossible',
      'Conversation impossible à créer',
      'Recherche de membres impossible',
    ];
    const offenders = source.split('\n').filter((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        return false;
      }
      return labels.some((label) => line.includes(label)) && !line.includes('t`');
    });
    expect(offenders).toEqual([]);
  });
});
