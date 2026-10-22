import { describe, expect, it } from 'vitest';
import { buildArticlePath, buildCategoryPath, resolveCategoryPath } from '../article-url';

const categories = [
  { id: 'cat-tech', slug: 'tech', parentId: null },
  { id: 'cat-ia', slug: 'ia', parentId: 'cat-tech' },
];

describe('article-url', () => {
  it('résout une catégorie racine', () => {
    expect(resolveCategoryPath(categories[0], categories)).toBe('tech');
  });

  it('résout une sous-catégorie via parentId', () => {
    expect(resolveCategoryPath(categories[1], categories)).toBe('tech/ia');
  });

  it('privilégie parentSlug fourni par l’API publique', () => {
    expect(resolveCategoryPath({ slug: 'ia', parentSlug: 'tech' })).toBe('tech/ia');
  });

  it('utilise uncategorized par défaut', () => {
    expect(resolveCategoryPath(null)).toBe('uncategorized');
    expect(buildArticlePath({ slug: 'mon-article' })).toBe('/uncategorized/mon-article');
  });

  it('construit les chemins catégorie et article', () => {
    expect(buildCategoryPath(categories[1], categories)).toBe('/tech/ia');
    expect(buildArticlePath({ slug: 'mon-article', category: categories[1] }, categories)).toBe(
      '/tech/ia/mon-article'
    );
  });
});
