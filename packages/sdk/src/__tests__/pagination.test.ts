import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  normalizePage,
  pageQuery,
} from '../actions/utils/pagination';

describe('normalizePage', () => {
  it('applique les valeurs par défaut', () => {
    expect(normalizePage()).toEqual({ limit: DEFAULT_PAGE_SIZE, offset: 0 });
    expect(normalizePage({})).toEqual({ limit: DEFAULT_PAGE_SIZE, offset: 0 });
  });

  it('borne un limit trop grand ou nul', () => {
    expect(normalizePage({ limit: 100_000 }).limit).toBe(MAX_PAGE_SIZE);
    expect(normalizePage({ limit: 0 }).limit).toBe(1);
    expect(normalizePage({ limit: -5 }).limit).toBe(1);
  });

  it('rejette NaN, Infinity et les fractions vers le bas', () => {
    expect(normalizePage({ limit: Number.NaN }).limit).toBe(DEFAULT_PAGE_SIZE);
    expect(normalizePage({ limit: Number.POSITIVE_INFINITY }).limit).toBe(DEFAULT_PAGE_SIZE);
    expect(normalizePage({ limit: 12.9 }).limit).toBe(12);
  });

  it('ramène un offset négatif ou invalide à 0', () => {
    expect(normalizePage({ offset: -10 }).offset).toBe(0);
    expect(normalizePage({ offset: Number.NaN }).offset).toBe(0);
    expect(normalizePage({ offset: 40.7 }).offset).toBe(40);
  });
});

describe('pageQuery', () => {
  it('produit une query string sûre', () => {
    expect(pageQuery({ limit: 9_999, offset: -1 })).toBe('?limit=100&offset=0');
    expect(pageQuery({ limit: Number.NaN })).toBe(`?limit=${DEFAULT_PAGE_SIZE}&offset=0`);
  });
});
