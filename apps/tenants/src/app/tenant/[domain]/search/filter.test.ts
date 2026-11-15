import { describe, expect, it } from 'vitest';
import type { SearchArticleItem } from './TenantSearchClient';
import { filterTenantArticles } from './filter';

function article(overrides: Partial<SearchArticleItem> & { id: string }): SearchArticleItem {
  return {
    title: `Titre ${overrides.id}`,
    slug: overrides.id,
    excerpt: '',
    categoryName: null,
    categorySlug: null,
    ...overrides,
  };
}

const articles: SearchArticleItem[] = [
  article({
    id: 'climat',
    title: 'Le climat en 2050',
    excerpt: 'Une analyse des trajectoires',
    categoryName: 'Écologie',
    categorySlug: 'ecologie',
  }),
  article({
    id: 'machine',
    title: 'Machine learning et presse',
    excerpt: 'Les modèles génératifs',
    categoryName: 'Technologie',
    categorySlug: 'technologie',
  }),
  article({
    id: 'politique',
    title: 'La politique étrangère',
    excerpt: 'Climat diplomatique tendu',
    categoryName: 'Politique',
    categorySlug: 'politique',
  }),
];

describe('filterTenantArticles', () => {
  it('sans requête ni filtre, retourne tout', () => {
    expect(filterTenantArticles(articles, '', 'all')).toHaveLength(3);
  });

  it('exige tous les mots (titre, extrait ou rubrique), insensible à la casse', () => {
    const result = filterTenantArticles(articles, 'CLIMAT 2050', 'all');
    expect(result.map((item) => item.id)).toEqual(['climat']);
  });

  it('cherche aussi dans l’extrait et la rubrique', () => {
    expect(filterTenantArticles(articles, 'génératifs', 'all').map((item) => item.id)).toEqual([
      'machine',
    ]);
    expect(filterTenantArticles(articles, 'écologie', 'all').map((item) => item.id)).toEqual([
      'climat',
    ]);
  });

  it('applique le filtre de rubrique en plus de la requête', () => {
    expect(filterTenantArticles(articles, 'climat', 'politique').map((item) => item.id)).toEqual([
      'politique',
    ]);
    expect(filterTenantArticles(articles, 'climat', 'technologie')).toEqual([]);
  });

  it('une rubrique seule (sans requête) filtre quand même', () => {
    expect(filterTenantArticles(articles, '', 'ecologie').map((item) => item.id)).toEqual([
      'climat',
    ]);
  });
});
