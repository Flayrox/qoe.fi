// @vitest-environment jsdom
// =====================================================================
// 🧪 ThoughtComposer — données de brouillon non fiables
// =====================================================================
// Deux entrées du compositeur viennent de l'extérieur de React : le
// brouillon de fil stocké en `localStorage` (schéma d'une version
// précédente, ou entrée abîmée) et le `imageUrl` d'un brouillon servi par
// l'API (JSON sérialisé). Aucune des deux ne doit pouvoir casser le rendu.
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

const textarea = () => screen.getByRole('textbox') as HTMLTextAreaElement;

async function openDraftsSheet() {
  vi.stubGlobal('localStorage', localStorage);
  // Pas de frappe ici : le compositeur autosauvegarde le fil dans le même
  // store que celui qu'on teste, et ce `setTimeout` (1000 ms) se déclenche
  // pendant les attentes sous charge — l'entrée du test disparaîtrait avant
  // le clic. Le focus suffit à déplier le compositeur et sa barre d'outils.
  fireEvent.focus(textarea());
  fireEvent.click(screen.getByRole('button', { name: 'Brouillons' }));
  const seeAll = await screen.findByRole('button', { name: 'Voir tous les brouillons' });
  fireEvent.click(seeAll);
  // La feuille charge les brouillons serveur APRÈS l'ouverture : un `click` armé
  // sur le nœud trouvé pendant le rendu de chargement peut viser un nœud que le
  // rendu suivant a détaché, et l'événement se perd sans erreur (flake observé
  // en `turbo run test`, 25 paquets en parallèle). On attend donc la fin du
  // chargement, c'est-à-dire un état de l'UI, pas une durée.
  await waitFor(() => expect(screen.queryByText('Chargement des brouillons...')).toBeNull());
}

describe('ThoughtComposer — brouillons non fiables (L20b2b2b)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.stubGlobal('localStorage', memoryStorage());
    feedActions.getUserDraftsAction.mockResolvedValue({ ok: true, data: { drafts: [] } });
    feedActions.deletePostAction.mockResolvedValue({ ok: true });
  });

  it('survit à un brouillon de fil local dont les images ne sont pas un tableau', async () => {
    // Schéma d'une version antérieure (ou entrée abîmée) : `images` est une
    // chaîne, pas un tableau de pièces jointes.
    const corrupted = JSON.stringify([{ id: 'n1', text: 'Ancien fil', images: 'oops' }]);
    localStorage.setItem('qoe_multi_thought_drafts', corrupted);
    render(<ThoughtComposer dbUser={dbUser} tagsList={[]} />);

    await openDraftsSheet();
    // Le store change après l'ouverture (autre onglet, autosauvegarde d'une
    // version valide…) : « Restaurer le fil » doit appliquer ce que la feuille
    // affichait, donc l'instantané pris à l'ouverture — et échouer ici.
    localStorage.setItem(
      'qoe_multi_thought_drafts',
      JSON.stringify([{ id: 'n2', text: 'Fil valide', images: [] }])
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Restaurer le fil' }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(toastMock.success).not.toHaveBeenCalled();
    // Le compositeur reste utilisable : le champ est toujours là.
    expect(screen.getByRole('textbox')).toBeDefined();
  });

  it('ne réécrit pas le store local pendant que la feuille de brouillons est ouverte', async () => {
    vi.stubGlobal('localStorage', localStorage);
    render(<ThoughtComposer dbUser={dbUser} tagsList={[]} />);

    // Frappe puis ouverture dans le même tick : l'autosauvegarde (debounce
    // 1000 ms) est encore en attente quand la feuille s'ouvre, et elle doit
    // être annulée — sinon elle écrase le brouillon que la feuille affiche.
    fireEvent.focus(textarea());
    fireEvent.change(textarea(), { target: { value: 'brouillon en cours' } });
    fireEvent.click(screen.getByRole('button', { name: 'Brouillons' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Voir tous les brouillons' }));

    const corrupted = JSON.stringify([{ id: 'n1', text: 'Ancien fil', images: 'oops' }]);
    localStorage.setItem('qoe_multi_thought_drafts', corrupted);

    // Au-delà du debounce : la laisser écrire ici rendrait la prévisualisation
    // de la feuille et « Restaurer le fil » incohérents.
    await new Promise((resolve) => setTimeout(resolve, 1_300));
    expect(localStorage.getItem('qoe_multi_thought_drafts')).toBe(corrupted);
  });

  it('ne charge que les URLs valides d’un imageUrl sérialisé', async () => {
    feedActions.getUserDraftsAction.mockResolvedValue({
      ok: true,
      data: {
        drafts: [
          {
            id: 'd1',
            content: 'Brouillon serveur',
            // Tableau JSON dont une entrée n'est pas une URL (schéma mélangé).
            imageUrl: JSON.stringify(['https://cdn.test/a.jpg', { legacy: true }]),
            visibility: 'public',
          },
        ],
      },
    });
    render(<ThoughtComposer dbUser={dbUser} tagsList={[]} />);

    await openDraftsSheet();
    fireEvent.click(await screen.findByRole('button', { name: 'Charger' }));

    await waitFor(() => expect(textarea()).toHaveProperty('value', 'Brouillon serveur'));
    // Une entrée non textuelle ne doit pas devenir une image « [object Object] ».
    const sources = Array.from(document.querySelectorAll('img'))
      .map((img) => img.getAttribute('src'))
      .filter((src): src is string => Boolean(src && src.startsWith('http')));
    expect(sources).toEqual(['https://cdn.test/a.jpg']);
  });
});
