// =====================================================================
// 🧪 ArticlesClient — actions qui échouent sans lever d'exception
// =====================================================================
// Les actions du SDK renvoient `{ ok: false }` plutôt que de rejeter. Un
// `await` sans vérifier `ok` traite donc un refus serveur comme un succès :
// la ligne disparaît de l'écran alors que la donnée est toujours là.
// =====================================================================

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const articleActions = vi.hoisted(() => ({
  getArticlesAction: vi.fn(),
  getCategoriesAction: vi.fn(),
  deleteArticleAction: vi.fn(),
  saveCategoryAction: vi.fn(),
  deleteCategoryAction: vi.fn(),
  reviewArticleAction: vi.fn(),
  moveCategoryAction: vi.fn(),
  getArticleByIdAction: vi.fn(),
  discardArticleDraftAction: vi.fn(),
}));
const dashboardActions = vi.hoisted(() => ({ updateCreatorProfileAction: vi.fn() }));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));

vi.mock('@qoe/sdk/actions/articles', () => articleActions);
vi.mock('@qoe/sdk/actions/dashboard', () => dashboardActions);
vi.mock('@qoe/ui/toast', () => ({ toast: toastMock }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('framer-motion', async () => {
  const react = await import('react');
  const clean = ({ children, ...rest }: Record<string, unknown>) => {
    const props: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rest)) {
      if (!['initial', 'animate', 'exit', 'transition', 'layout'].includes(key)) props[key] = value;
    }
    return react.createElement('div', props, children as React.ReactNode);
  };
  return {
    motion: { div: clean },
    AnimatePresence: ({ children }: { children?: React.ReactNode }) =>
      react.createElement(react.Fragment, null, children),
  };
});
vi.mock('@/features/editor/components/ArticleDiffModal', () => ({
  ArticleDiffModal: () => null,
}));
vi.mock('@/features/editor/components/RecoverArticleModal', () => ({
  RecoverArticleModal: () => null,
}));

import { ArticlesClient } from '../articles-client';
import type { ArticleWithCategory, CategoryWithCount } from '../components/article-list-types';

const category: CategoryWithCount = {
  id: 'cat_1',
  name: 'Essais',
  slug: 'essais',
  description: null,
  parentId: null,
  _count: { articles: 1 },
};

const article: ArticleWithCategory = {
  id: 'art_1',
  title: 'Manifeste pour une édition libre',
  slug: 'manifeste-edition-libre',
  content: '<p>corps</p>',
  published: true,
  status: 'PUBLISHED',
  isPremium: false,
  readingTime: 4,
  categoryId: 'cat_1',
  category: { id: 'cat_1', name: 'Essais', slug: 'essais' },
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-20T10:00:00.000Z',
};

function renderClient() {
  return render(
    <ArticlesClient
      initialArticles={[article]}
      initialCategories={[category]}
      canReview
      canPublish
      currentUserId="u_1"
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  articleActions.getArticlesAction.mockResolvedValue({ ok: true, data: [article] });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ArticlesClient — refus serveur', () => {
  it('garde la catégorie quand le serveur refuse sa suppression', async () => {
    articleActions.deleteCategoryAction.mockResolvedValue({
      ok: false,
      error: { message: 'Catégorie encore utilisée' },
    });

    renderClient();
    fireEvent.click(screen.getByRole('tab', { name: /Catégories/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Supprimer la catégorie' }));

    await waitFor(() => expect(articleActions.deleteCategoryAction).toHaveBeenCalledWith('cat_1'));
    // La catégorie est toujours en base : la retirer de l'arborescence fait
    // croire à une suppression qui n'a pas eu lieu.
    expect(screen.getByText('Essais')).toBeDefined();
  });

  it('garde les articles quand la suppression groupée échoue', async () => {
    articleActions.deleteArticleAction.mockResolvedValue({
      ok: false,
      error: { message: 'Suppression interdite' },
    });

    renderClient();
    fireEvent.click(screen.getByRole('checkbox', { name: /Tout sélectionner/ }));
    // La barre de sélection précède la liste dans le DOM.
    fireEvent.click(screen.getAllByRole('button', { name: 'Supprimer' })[0]);
    // Le dialogue de confirmation est porté en fin de document.
    fireEvent.click(screen.getAllByRole('button', { name: 'Supprimer' }).at(-1)!);

    await waitFor(() => expect(articleActions.deleteArticleAction).toHaveBeenCalledWith('art_1'));
    expect(screen.getByText('Manifeste pour une édition libre')).toBeDefined();
  });

  it('n’annonce pas une revue réussie quand le serveur la refuse', async () => {
    articleActions.reviewArticleAction.mockResolvedValue({
      ok: false,
      error: { message: 'Revue impossible' },
    });
    // La liste est rechargée au montage : c'est cette version qui est revue.
    const submitted = { ...article, published: false, status: 'SUBMITTED' };
    articleActions.getArticlesAction.mockResolvedValue({ ok: true, data: [submitted] });

    render(
      <ArticlesClient
        initialArticles={[submitted]}
        initialCategories={[category]}
        canReview
        canPublish
        currentUserId="u_1"
      />
    );

    const summary = screen.getByTitle("Plus d'actions");
    fireEvent.click(summary);
    // jsdom n'ouvre pas `<details>` au clic : on force l'état ouvert pour
    // atteindre l'action de revue, seul point testé ici.
    summary.closest('details')!.open = true;
    // Le menu d'une ligne fermée reste dans le DOM mais hors arbre a11y.
    fireEvent.click(
      (await screen.findAllByRole('button', { name: 'Approuver et publier', hidden: true }))[0]
    );
    fireEvent.click(
      (await screen.findAllByRole('button', { name: 'Approuver et publier' })).at(-1)!
    );

    await waitFor(() =>
      expect(articleActions.reviewArticleAction).toHaveBeenCalledWith({
        id: 'art_1',
        approve: true,
        comment: undefined,
      })
    );
    expect(toastMock.success).not.toHaveBeenCalledWith('Article approuvé et publié.');
  });
});
