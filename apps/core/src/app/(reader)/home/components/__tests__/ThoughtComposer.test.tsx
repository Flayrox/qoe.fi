// @vitest-environment jsdom
// =====================================================================
// 🧪 ThoughtComposer — session, brouillons, limites et publication
// =====================================================================
// Le composeur est la porte d'entrée de tout contenu publié. Ce qui compte
// n'est pas son rendu mais ses garde-fous : pas de saisie sans session, un
// brouillon local qui survit au rechargement, une limite de 500 caractères
// qui compte une URL externe comme 20 (règle produit), et un envoi qui part
// avec le bon contrat.
// =====================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

const feedActions = vi.hoisted(() => ({
  createThoughtThreadAction: vi.fn(),
  deletePostAction: vi.fn(),
  getUserDraftsAction: vi.fn(),
  searchUsersAction: vi.fn(),
}));

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}));

vi.mock('@qoe/sdk/actions/feed', () => feedActions);
vi.mock('@qoe/ui/toast', () => ({ toast: toastMock }));
vi.mock('@qoe/ui', () => ({
  ProfileHoverCard: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => React.createElement('img', { src, alt }),
}));
vi.mock('@lingui/core/macro', () => ({
  t: (strings: TemplateStringsArray | string, ...values: unknown[]) => {
    if (Array.isArray(strings)) {
      return strings.reduce(
        (res, str, i) => res + str + (values[i] !== undefined ? values[i] : ''),
        ''
      );
    }
    return String(strings || '');
  },
}));

import { ThoughtComposer } from '../ThoughtComposer';

/**
 * Node 26 expose un `localStorage` global inutilisable sans
 * `--localstorage-file` ; jsdom ne le remplace pas ici. On injecte un stockage
 * mémoire déterministe (le composant n'utilise que getItem/setItem/removeItem).
 */
function memoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => void store.delete(key),
    setItem: (key: string, value: string) => void store.set(key, String(value)),
  } as Storage;
}

const dbUser = {
  id: 'u1',
  name: 'Ada',
  username: 'ada',
  logoUrl: null,
  isCertified: false,
  type: 'PERSONAL',
};

function renderComposer(props: Partial<React.ComponentProps<typeof ThoughtComposer>> = {}) {
  return render(<ThoughtComposer dbUser={dbUser} tagsList={['design', 'tech']} {...props} />);
}

// Le placeholder change entre le premier nœud et les suivants : on cible le
// textarea actif par son rôle.
const textarea = () => screen.getByRole('textbox') as HTMLTextAreaElement;
const submitButton = () => screen.getByRole('button', { name: /Publier|Tout publier|Répondre/ });

function type(value: string) {
  fireEvent.change(textarea(), { target: { value } });
}

describe('ThoughtComposer', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.stubGlobal('localStorage', memoryStorage());
    feedActions.createThoughtThreadAction.mockResolvedValue({
      ok: true,
      data: {
        posts: [
          {
            id: 'post_1',
            content: 'Bonjour',
            createdAt: '2026-11-16T10:00:00.000Z',
            author: { id: 'u1', name: 'Ada', username: 'ada' },
          },
        ],
      },
    });
    feedActions.deletePostAction.mockResolvedValue({ ok: true });
    feedActions.getUserDraftsAction.mockResolvedValue({ ok: true, data: { drafts: [] } });
  });

  it('refuse la saisie sans session et demande la connexion', () => {
    const onLoginRequired = vi.fn();
    render(<ThoughtComposer dbUser={null} tagsList={[]} onLoginRequired={onLoginRequired} />);

    type('Bonjour');

    expect(onLoginRequired).toHaveBeenCalledTimes(1);
    expect(textarea()).toHaveProperty('value', '');
    expect(localStorage.getItem('qoe_thought_draft')).toBeNull();
  });

  it('conserve le brouillon local à chaque frappe', () => {
    renderComposer();
    type('Bonjour le monde');

    expect(localStorage.getItem('qoe_thought_draft')).toBe('Bonjour le monde');
  });

  it('restaure le brouillon local au montage', () => {
    localStorage.setItem('qoe_thought_draft', 'Reprise de brouillon');

    renderComposer();

    expect(textarea()).toHaveProperty('value', 'Reprise de brouillon');
  });

  it('n’offre la publication qu’une fois un contenu saisi', () => {
    renderComposer();
    // Replié et vide : la barre d'action n'existe pas encore.
    expect(screen.queryByRole('button', { name: /Publier|Tout publier|Répondre/ })).toBeNull();

    type('Quelque chose');
    expect(submitButton()).toHaveProperty('disabled', false);
  });

  it('bloque la publication au-delà de 500 caractères et affiche le dépassement', () => {
    renderComposer();

    type('a'.repeat(500));
    expect(submitButton()).toHaveProperty('disabled', false);

    type('a'.repeat(501));
    expect(submitButton()).toHaveProperty('disabled', true);
    expect(screen.getByText('-1')).toBeDefined();
  });

  it('compte une URL externe comme 20 caractères, pas sa longueur réelle', () => {
    renderComposer();
    const url = `https://example.com/${'segment/'.repeat(20)}`;

    // 470 caractères + une URL de ~170 : sous la limite une fois l'URL pondérée.
    type(`${'a'.repeat(470)} ${url}`);
    expect(submitButton()).toHaveProperty('disabled', false);

    // Deux fois plus de texte : cette fois la limite est réellement dépassée.
    type(`${'a'.repeat(700)} ${url}`);
    expect(submitButton()).toHaveProperty('disabled', true);
  });

  it('publication : envoie le contrat attendu, vide le champ et prévient le feed', async () => {
    const onPostCreated = vi.fn();
    renderComposer({ onPostCreated });

    type('Bonjour #design');
    fireEvent.click(submitButton());

    await waitFor(() => expect(feedActions.createThoughtThreadAction).toHaveBeenCalledTimes(1));

    const payload = feedActions.createThoughtThreadAction.mock.calls[0][0];
    expect(payload).toMatchObject({
      visibility: 'public',
      isDraft: false,
      scheduledAt: null,
      replyRestriction: 'everyone',
      parentId: null,
    });
    expect(payload.thoughts).toHaveLength(1);
    expect(payload.thoughts[0]).toMatchObject({
      content: 'Bonjour #design',
      tags: ['#design'],
      quotedArticleId: null,
      triggerWarning: null,
      poll: null,
    });

    await waitFor(() => expect(onPostCreated).toHaveBeenCalledTimes(1));
    expect(onPostCreated.mock.calls[0][0]).toMatchObject({ id: 'post_1', published: true });
    expect(textarea()).toHaveProperty('value', '');
    expect(localStorage.getItem('qoe_thought_draft')).toBeNull();
  });

  it('publication refusée : garde le texte et affiche l’erreur du serveur', async () => {
    feedActions.createThoughtThreadAction.mockResolvedValueOnce({
      ok: false,
      error: { message: 'Publication suspendue' },
    });
    renderComposer();

    type('Texte conservé');
    fireEvent.click(submitButton());

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('Publication suspendue'));
    expect(textarea()).toHaveProperty('value', 'Texte conservé');
    // Le brouillon local n'est pas effacé sur un échec.
    expect(localStorage.getItem('qoe_thought_draft')).toBe('Texte conservé');
  });

  it('ajoute un nœud de fil sans activer la publication à vide', () => {
    renderComposer();
    // Un simple focus déplie la barre d'outils : on peut ajouter un nœud vide.
    fireEvent.focus(textarea());
    fireEvent.click(screen.getByTitle('Ajouter une autre pensée à ce fil de discussion'));
    expect(textarea()).toHaveProperty('value', '');

    expect(screen.getByRole('button', { name: /Tout publier/ })).toBeDefined();
    // Deux nœuds vides : rien à publier, le bouton doit rester inactif.
    expect(submitButton()).toHaveProperty('disabled', true);

    type('Deuxième pensée');
    expect(submitButton()).toHaveProperty('disabled', false);
  });

  it('reste publiable quand le contenu vit dans le nœud précédent du fil', () => {
    renderComposer();
    type('Première pensée');
    fireEvent.click(screen.getByTitle('Ajouter une autre pensée à ce fil de discussion'));

    // Le nœud actif est vide, mais le fil contient déjà une pensée : on peut publier.
    expect(submitButton()).toHaveProperty('disabled', false);
  });
});
