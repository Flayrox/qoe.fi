import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ArticleListRow } from '../article-list-row';
import type { ArticleWithCategory } from '../article-list-types';

// Les macros Lingui sont compilées au build : en test on rend le message brut
// (avec ses interpolations) plutôt que d'exiger un catalogue chargé.
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

function makeArticle(overrides: Partial<ArticleWithCategory> = {}): ArticleWithCategory {
  return {
    id: 'art_1',
    title: 'Manifeste pour une édition libre',
    slug: 'manifeste-edition-libre',
    content: '<p>corps</p>',
    published: false,
    status: 'DRAFT',
    isPremium: false,
    readingTime: 4,
    categoryId: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-20T10:00:00.000Z',
    category: null,
    ...overrides,
  };
}

const noop = () => {};

function renderRow(article: ArticleWithCategory) {
  return render(
    <ArticleListRow
      article={article}
      columns={{
        category: true,
        status: true,
        premium: true,
        updatedAt: true,
        views: true,
        comments: true,
      }}
      density="comfortable"
      selected={false}
      pinned={false}
      about={false}
      canReview={false}
      onToggleSelect={noop}
      onOpenAnalytics={noop}
      onTogglePin={noop}
      onOpenSettings={noop}
      onToggleAbout={noop}
      onReview={noop}
      onDelete={noop}
    />
  );
}

describe('ArticleListRow — badge de statut', () => {
  it('affiche un brouillon comme brouillon', () => {
    renderRow(makeArticle());

    expect(screen.getByText('Brouillon')).toBeDefined();
    expect(screen.queryByText(/Programmé/)).toBeNull();
  });

  it('affiche un article programmé avec sa date, jamais comme un brouillon', () => {
    renderRow(
      makeArticle({
        status: 'SCHEDULED',
        published: false,
        scheduledAt: '2026-11-02T08:30:00.000Z',
      })
    );

    // Le libellé et la date sont rendus dans la même pastille.
    expect(screen.getByText(/Programmé/)).toBeDefined();
    expect(screen.queryByText('Brouillon')).toBeNull();
    // La date de programmation apparaît (format local court, ex. « 2 nov. 09:30 »).
    expect(screen.getByTitle('Publication automatique programmée').textContent).toMatch(/\d/);
  });

  it('reste lisible quand la date de programmation manque', () => {
    renderRow(makeArticle({ status: 'SCHEDULED', published: false, scheduledAt: null }));

    const pill = screen.getByTitle('Publication automatique programmée');
    expect(pill.textContent).toBe('Programmé');
  });

  it('affiche un article publié comme publié', () => {
    renderRow(makeArticle({ status: 'PUBLISHED', published: true }));

    expect(screen.getByText('Publié')).toBeDefined();
    expect(screen.queryByText('Brouillon')).toBeNull();
  });
});
