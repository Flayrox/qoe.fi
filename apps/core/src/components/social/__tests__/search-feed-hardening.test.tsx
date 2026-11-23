// @vitest-environment jsdom
// =====================================================================
// L20c5 — flux et recherche : garanties écrites AVANT correctif
// =====================================================================
// 1. Un résultat d'article daté d'une valeur illisible ne doit pas casser
//    l'ouverture (même classe que F273 côté annotateur) : `toISOString()`
//    jette une RangeError, le clic ne fait alors plus rien.
// 2. L'état « aucun résultat » ne doit pas contredire la pagination : quand
//    la page courante est vide mais qu'un curseur reste, le serveur en a
//    d'autres (le composant affiche déjà « Parcourir tous les articles »).
// 3. Le compteur temps réel doit être annoncé (région `status`), pour qu'un
//    lecteur d'écran entende les nouvelles pensées.
// =====================================================================

import React from 'react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

const { hooks, openArticle } = vi.hoisted(() => ({
  hooks: {
    search: null as unknown,
    articles: null as unknown,
    thoughts: null as unknown,
    semantic: null as unknown,
  },
  openArticle: vi.fn(),
}));

const { tCalls } = vi.hoisted(() => ({ tCalls: [] as string[] }));

vi.mock('@lingui/core/macro', () => ({
  t: (strings: TemplateStringsArray | string, ...values: unknown[]) => {
    const message = Array.isArray(strings)
      ? strings.reduce((res, str, i) => res + str + (values[i] ?? ''), '')
      : String(strings);
    tCalls.push(message);
    return message;
  },
  // Le macro `plural` est transformé à la compilation ; le harnais reproduit la
  // seule chose qui compte pour l'assertion : la forme choisie et le nombre.
  plural: (count: number, forms: Record<string, string>) =>
    String(count === 1 ? forms.one : forms.other).replace('#', String(count)),
}));

vi.mock('@qoe/sdk', () => ({
  useSearchQuery: () => hooks.search,
  useInfiniteArticlesQuery: () => hooks.articles,
  useInfiniteThoughtsQuery: () => hooks.thoughts,
  useSemanticSearchQuery: () => hooks.semantic,
}));

vi.mock('../ThoughtCard', () => ({
  ThoughtCard: ({ post }: { post: { id: string } }) => <div data-testid="thought">{post.id}</div>,
}));

vi.mock('@qoe/ui/ui/AuthorAvatar', () => ({
  AuthorAvatar: () => <span data-testid="avatar" />,
}));

vi.mock('@qoe/ui/ui/CertifiedBadge', () => ({
  CertifiedBadge: () => <span data-testid="certified" />,
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@qoe/config/routes', () => ({
  routes: {
    feed: {
      profile: (handle: string) => `/u/${handle}`,
      thought: (handle: string, id: string) => `/u/${handle}/${id}`,
    },
  },
  getArticleUrl: (input: { slug: string }) => `/a/${input.slug}`,
}));

vi.mock('@/components/article-overlay/ArticleOverlayProvider', () => ({
  useArticleOverlay: () => ({ openArticle }),
}));

vi.mock('@/components/thought-overlay/context', () => ({
  useThoughtOverlay: () => null,
}));

import { SearchFeed } from '../SearchFeed';
import { RealtimeFeedPill } from '../../feed/RealtimeFeedPill';
import { fileURLToPath } from 'node:url';

// Ancrage indépendant du cwd : `pnpm test:coverage` tourne depuis la racine du
// monorepo et `turbo run test` depuis `apps/core` — `CORE_DIR` ne pointe
// donc pas toujours sur l'app. La racine est déduite du fichier de test.
const CORE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

const idle = { isLoading: false, isError: false };

function baseData(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      thoughts: [],
      users: [],
      articles: [],
      nextCursor: null,
      articlesNextCursor: null,
      ...overrides,
    },
    ...idle,
  };
}

beforeEach(() => {
  cleanup();
  tCalls.length = 0;
  openArticle.mockClear();
  hooks.search = baseData();
  hooks.articles = {
    data: { pages: [] },
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    ...idle,
  };
  hooks.thoughts = {
    data: { pages: [] },
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    ...idle,
  };
  hooks.semantic = { data: { items: [] }, ...idle };
});

describe('SearchFeed — date illisible d’un résultat', () => {
  it('ouvre l’article sans jeter quand `createdAt` est illisible', () => {
    hooks.search = baseData({
      articles: [
        {
          id: 'a1',
          title: 'Article daté n’importe comment',
          slug: 'article-date',
          content: '',
          createdAt: 'pas-une-date',
        },
      ],
    });

    render(<SearchFeed initialQuery="date" />);

    expect(() => fireEvent.click(screen.getByText('Article daté n’importe comment'))).not.toThrow();
    expect(openArticle).toHaveBeenCalledTimes(1);
    expect(openArticle.mock.calls[0][0]).toMatchObject({
      slug: 'article-date',
      createdAt: undefined,
    });
  });

  it('transmet une date lisible au format ISO', () => {
    hooks.search = baseData({
      articles: [
        {
          id: 'a2',
          title: 'Article daté correctement',
          slug: 'article-iso',
          content: '',
          createdAt: '2026-01-02T03:04:05.000Z',
        },
      ],
    });

    render(<SearchFeed initialQuery="date" />);
    fireEvent.click(screen.getByText('Article daté correctement'));

    expect(openArticle.mock.calls[0][0]).toMatchObject({
      createdAt: '2026-01-02T03:04:05.000Z',
    });
  });

  it('interdit la réapparition de la conversion directe (garde de source)', () => {
    const source = readFileSync(resolve(CORE_DIR, 'src/components/social/SearchFeed.tsx'), 'utf8');

    expect(source).not.toMatch(/new Date\(art\.createdAt\)/);
    expect(source).toContain('toIsoOrUndefined');
  });
});

describe('SearchFeed — état « aucun résultat »', () => {
  it('ne dit pas « aucun résultat » quand un curseur promet d’autres pages', () => {
    hooks.search = baseData({ articlesNextCursor: 'curseur-articles' });

    render(<SearchFeed initialQuery="vide" />);

    expect(screen.queryByText(/Aucun résultat trouvé/)).toBeNull();
    expect(screen.getByText('Parcourir tous les articles')).toBeTruthy();
  });

  it('dit « aucun résultat » quand il n’y a ni résultat ni curseur', () => {
    render(<SearchFeed initialQuery="vide" />);

    expect(screen.getByText(/Aucun résultat trouvé/)).toBeTruthy();
  });
});

describe('RealtimeFeedPill — annonce du compteur', () => {
  it('annonce le nombre de nouvelles pensées dans une région `status`', () => {
    render(<RealtimeFeedPill unreadCount={3} onFlush={vi.fn()} />);

    const status = screen.getByRole('status');
    expect(status.textContent).toContain('3');
    expect(status.textContent).toContain('nouvelles pensées');
  });

  it('accorde au singulier et ne rend rien à zéro', () => {
    render(<RealtimeFeedPill unreadCount={1} onFlush={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toContain('1 nouvelle pensée');

    cleanup();
    const { container } = render(<RealtimeFeedPill unreadCount={0} onFlush={vi.fn()} />);
    expect(container.textContent).toBe('');
  });

  it('déclenche `onFlush` au clic', () => {
    const onFlush = vi.fn();
    render(<RealtimeFeedPill unreadCount={2} onFlush={onFlush} />);

    fireEvent.click(screen.getByRole('button'));
    expect(onFlush).toHaveBeenCalledTimes(1);
  });
});

describe('SearchFeed — i18n : aucun libellé ne contourne `t`', () => {
  it('passe les onglets et leurs compteurs par `t`', () => {
    hooks.search = baseData({
      users: [{ id: 'u1', name: 'Alice' }],
      thoughts: [{ id: 't1' }],
      articles: [{ id: 'a1', title: 'Titre', slug: 's', content: '' }],
    });

    render(<SearchFeed initialQuery="mot" />);

    expect(tCalls).toContain('Tous les résultats');
    expect(tCalls).toContain('Profils (1)');
    expect(tCalls).toContain('Pensées (1)');
    expect(tCalls).toContain('Articles (1)');
  });

  it('borne le compteur d’articles quand un curseur reste (`1+`)', () => {
    hooks.search = baseData({
      articles: [{ id: 'a1', title: 'Titre', slug: 's', content: '' }],
      articlesNextCursor: 'curseur',
    });

    render(<SearchFeed initialQuery="mot" />);

    expect(tCalls).toContain('Articles (1+)');
  });

  it('passe le placeholder, la description et les deux erreurs par `t`', () => {
    render(<SearchFeed initialQuery="mot" />);
    expect(tCalls).toContain('Rechercher une pensée, un profil ou une thématique...');

    cleanup();
    tCalls.length = 0;
    hooks.search = { data: undefined, isLoading: false, isError: true };
    render(<SearchFeed initialQuery="mot" />);
    expect(tCalls).toContain('Une erreur est survenue lors de la recherche.');
  });

  it('passe l’état vide interpolé par `t`', () => {
    render(<SearchFeed initialQuery="zzz" />);

    expect(tCalls).toContain('Aucun résultat trouvé pour');
    expect(screen.getByText('"zzz"')).toBeTruthy();
  });

  it('passe les deux boutons de pagination par `t`', () => {
    hooks.search = baseData({ articlesNextCursor: 'curseur', nextCursor: 'curseur-pensees' });

    render(<SearchFeed initialQuery="mot" />);

    expect(tCalls).toContain('Parcourir tous les articles');
    expect(tCalls).toContain('Parcourir toutes les pensées');
  });

  it('interdit la réapparition d’un libellé en dur (garde de source)', () => {
    const labels = [
      'Tous les résultats',
      'Charger plus d’articles'.replace('’', "'"),
      'Parcourir tous les articles',
      'Aucun résultat trouvé pour',
      'Une erreur est survenue lors de la recherche.',
      'Rechercher une pensée, un profil ou une thématique',
      'nouvelle pensée',
    ];
    for (const file of ['SearchFeed.tsx', '../feed/RealtimeFeedPill.tsx']) {
      const source = readFileSync(resolve(CORE_DIR, 'src/components/social', file), 'utf8');
      const offenders = source.split('\n').filter((line) => {
        const trimmed = line.trim();
        // Un commentaire peut citer un libellé sans le rendre.
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
          return false;
        }
        // Une branche de pluriel ICU appartient au macro `t` qui l'englobe.
        if (/^(zero|one|two|few|many|other):/.test(trimmed)) {
          return false;
        }
        return labels.some((label) => line.includes(label)) && !line.includes('t`');
      });
      expect(offenders, file).toEqual([]);
    }
  });
});

describe('RealtimeFeedPill — i18n du pluriel', () => {
  it('choisit la forme au singulier pour 1 et au pluriel au-delà', () => {
    render(<RealtimeFeedPill unreadCount={1} onFlush={vi.fn()} />);
    expect(tCalls).toContain('1 nouvelle pensée');

    cleanup();
    tCalls.length = 0;

    render(<RealtimeFeedPill unreadCount={3} onFlush={vi.fn()} />);
    expect(tCalls).toContain('3 nouvelles pensées');
  });
});
