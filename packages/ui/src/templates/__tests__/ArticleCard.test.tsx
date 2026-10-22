import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ArticleCard } from '../blocks/ArticleCard';
import type { TemplateArticleItem } from '../schema';

const mockArticle: TemplateArticleItem = {
  id: 'art_card_test_1',
  title: "L'art de l'attention et des récits profonds",
  slug: 'art-de-attention',
  excerpt: 'Pourquoi la lecture lente reconquiert les esprits.',
  imageUrl: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c',
  readingTime: 5,
  publishedAt: '2026-09-03T10:00:00.000Z',
  isPremium: true,
  category: { name: 'Essais' },
  author: { name: 'Rose Florence' },
  likesCount: 134,
  commentsCount: 20,
  repostsCount: 7,
};

describe('ArticleCard', () => {
  it('affiche la variante hero-center avec alignement centré et métadonnées complètes', () => {
    const html = renderToStaticMarkup(
      <ArticleCard
        article={mockArticle}
        variant="hero-center"
        isPinned={true}
        testId="test-hero-center"
      />
    );

    expect(html).toContain('data-testid="test-hero-center"');
    expect(html).toContain('L&#x27;art de l&#x27;attention et des récits profonds');
    expect(html).toContain('text-center');
    expect(html).toContain('justify-center');
    expect(html).toContain('Rose Florence');
    expect(html).toContain('Essais');
    expect(html).toContain('Payant');
    expect(html).toContain('rounded-[6px]');
  });

  it('affiche la variante secondary avec structure compacte pour colonnes latérales', () => {
    const html = renderToStaticMarkup(
      <ArticleCard article={mockArticle} variant="secondary" testId="test-secondary" />
    );

    expect(html).toContain('data-testid="test-secondary"');
    expect(html).toContain('line-clamp-2');
    expect(html).toContain('rounded-[6px]');
    expect(html).toContain('5 min');
  });

  it('affiche la variante row avec vignette à droite pour flux chronologique', () => {
    const html = renderToStaticMarkup(
      <ArticleCard article={mockArticle} variant="row" testId="test-row" />
    );

    expect(html).toContain('data-testid="test-row"');
    expect(html).toContain('sm:flex-row');
    expect(html).toContain('rounded-[6px]');
  });
});
