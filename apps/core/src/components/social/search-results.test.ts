import { describe, expect, it } from 'vitest';
import type { SearchArticleHit, SearchThoughtData } from '@qoe/sdk';
import {
  hasResultsForTab,
  mergeArticlePages,
  mergeThoughtPages,
  toIsoOrUndefined,
} from './search-results';

function article(id: string, slug = id): SearchArticleHit {
  return {
    id,
    title: `Titre ${id}`,
    slug,
    content: '',
    authorId: 'author-1',
    categoryId: null,
    published: true,
    isPremium: false,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('toIsoOrUndefined', () => {
  it('rend l’ISO d’une date lisible (chaîne ou secondes epoch)', () => {
    expect(toIsoOrUndefined('2026-01-02T03:04:05.000Z')).toBe('2026-01-02T03:04:05.000Z');
    expect(toIsoOrUndefined(0)).toBe('1970-01-01T00:00:00.000Z');
  });

  it('rend `undefined` sur une valeur illisible, sans jeter', () => {
    // `new Date('pas-une-date').toISOString()` jetait une RangeError dans le
    // handler de clic : l'article ne s'ouvrait plus du tout.
    expect(toIsoOrUndefined('pas-une-date')).toBeUndefined();
    expect(toIsoOrUndefined(Number.NaN)).toBeUndefined();
  });

  it('traite `null`, `undefined` et la chaîne vide comme absents', () => {
    expect(toIsoOrUndefined(null)).toBeUndefined();
    expect(toIsoOrUndefined(undefined)).toBeUndefined();
    expect(toIsoOrUndefined('')).toBeUndefined();
  });
});

describe('mergeArticlePages', () => {
  it('fusionne les pages dans l’ordre et déduplique par id', () => {
    const merged = mergeArticlePages([
      { articles: [article('a'), article('b')] },
      { articles: [article('b'), article('c')] },
    ]);

    expect(merged.map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('retombe sur slug + publisher quand l’id manque', () => {
    const withoutId = { ...article(''), id: '', slug: 'meme-slug', publisherId: 'pub-1' };
    const merged = mergeArticlePages([{ articles: [withoutId] }, { articles: [{ ...withoutId }] }]);

    expect(merged).toHaveLength(1);
  });

  it('accepte une liste de pages absente ou vide', () => {
    expect(mergeArticlePages(undefined)).toEqual([]);
    expect(mergeArticlePages([])).toEqual([]);
  });
});

function thought(id: string): SearchThoughtData {
  return {
    id,
    content: `Pensée ${id}`,
    authorId: 'author-1',
    author: { id: 'author-1', username: 'auteur', name: 'Auteur', subdomain: null },
    createdAt: '2026-01-01T00:00:00Z',
    likeCount: 0,
    repostCount: 0,
    replyCount: 0,
  };
}

describe('mergeThoughtPages', () => {
  it('fusionne les pages dans l’ordre et déduplique par id', () => {
    const merged = mergeThoughtPages([
      { thoughts: [thought('a'), thought('b')] },
      { thoughts: [thought('b'), thought('c')] },
    ]);

    expect(merged.map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('accepte une liste de pages absente ou vide', () => {
    expect(mergeThoughtPages(undefined)).toEqual([]);
    expect(mergeThoughtPages([])).toEqual([]);
  });
});

describe('hasResultsForTab', () => {
  const counts = { thoughts: 0, users: 0, articles: 2, semantic: 0 };

  it('décide par onglet et non sur la somme', () => {
    expect(hasResultsForTab('articles', counts)).toBe(true);
    expect(hasResultsForTab('thoughts', counts)).toBe(false);
    expect(hasResultsForTab('semantic', counts)).toBe(false);
    expect(hasResultsForTab('all', counts)).toBe(true);
  });

  it('un onglet vide avec d’autres résultats ne déclenche pas « aucun résultat »', () => {
    expect(hasResultsForTab('users', { ...counts, users: 0, thoughts: 3 })).toBe(false);
  });

  it('tout vide → aucun résultat même en mode « tous »', () => {
    expect(hasResultsForTab('all', { thoughts: 0, users: 0, articles: 0, semantic: 0 })).toBe(
      false
    );
  });
});
