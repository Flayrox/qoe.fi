// @vitest-environment jsdom
// =====================================================================
// 🧪 LibraryClient — rendu et onglets vides
// =====================================================================
// Ce composant était le second angle mort de la couverture : rolldown ne
// parvenait pas à le remapper, faute de pouvoir le charger dans un test (import
// `@qoe/sdk/actions/highlights` non déclaré dans les `exports`). Le sous-chemin
// est déclaré et ce test l'instrumente. Les cas métier (filtres, export
// Markdown) sont couverts par `library-helpers`, déjà testé.
// =====================================================================

import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { LibraryClient } from '../LibraryClient';

vi.mock('next/link', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@qoe/sdk/actions/feed', () => ({ toggleBookmarkArticleHomeAction: vi.fn() }));
vi.mock('@qoe/sdk/actions/highlights', () => ({
  deleteHighlightAction: vi.fn(),
  updateHighlightNoteAction: vi.fn(),
}));
vi.mock('@lingui/core/macro', () => ({
  t: (strings: TemplateStringsArray | string, ...values: unknown[]) => {
    if (Array.isArray(strings)) {
      return strings.reduce(
        (res, str, i) => res + str + (values[i] !== undefined ? String(values[i]) : ''),
        ''
      );
    }
    return String(strings || '');
  },
}));

// `apps/core` n'active pas le cleanup automatique de Testing Library : sans
// ça, le DOM des tests précédents s'accumule et les `getByRole` deviennent
// ambigus dès que la suite complète tourne.
afterEach(cleanup);

describe('LibraryClient', () => {
  it('affiche un état vide explicite pour les signets', () => {
    render(<LibraryClient bookmarks={[]} highlights={[]} />);

    expect(screen.getByText('Aucun signet sauvegardé')).toBeDefined();
  });

  it('bascule sur l’onglet surlignages sans casser le rendu', () => {
    render(<LibraryClient bookmarks={[]} highlights={[]} initialTab="highlights" />);

    expect(screen.getByText('Aucun surlignage')).toBeDefined();
    // Deux barres d'onglets (desktop + mobile) : on prend la première.
    fireEvent.click(screen.getAllByRole('tab', { name: /Signets/ })[0]);
    expect(screen.getByText('Aucun signet sauvegardé')).toBeDefined();
  });

  it('rend un signet fourni par le serveur', () => {
    render(
      <LibraryClient
        bookmarks={[
          {
            id: 'bm_1',
            createdAt: '2026-11-01T10:00:00.000Z',
            article: {
              id: 'art_1',
              slug: 'manifeste-edition-libre',
              title: 'Manifeste pour une édition libre',
              content: '<p>Un extrait.</p>',
              readingTime: 4,
              author: {
                name: 'Qoe',
                username: 'qoe',
                subdomain: null,
                customDomain: null,
                logoUrl: null,
              },
              category: null,
            },
          },
        ]}
        highlights={[]}
      />
    );

    expect(screen.getByText('Manifeste pour une édition libre')).toBeDefined();
  });
});
