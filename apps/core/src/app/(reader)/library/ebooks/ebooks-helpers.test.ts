import { describe, it, expect } from 'vitest';
import {
  FREE_EBOOK_QUOTA,
  clampChapter,
  clampPct,
  describeEbookError,
  describeEbookProgress,
  describeEbookQuota,
  describeEbookSizeLimit,
  ebookCoverUrl,
  ebookReadUrl,
  isEbookQuotaReached,
  isEpubFileName,
  type EbookSummaryLike,
} from './ebooks-helpers';

function book(overrides: Partial<EbookSummaryLike> = {}): EbookSummaryLike {
  return {
    id: 'b1',
    title: 'Livre',
    author: 'Auteur',
    language: 'fr',
    chapterCount: 12,
    hasCover: false,
    progressChapter: 0,
    progressPct: 0,
    createdAt: '2026-09-29T00:00:00Z',
    ...overrides,
  };
}

describe('describeEbookQuota', () => {
  it('annonce le décompte exact en gratuit', () => {
    expect(describeEbookQuota(0, false)).toBe(`0 / ${FREE_EBOOK_QUOTA} livres gratuits`);
    expect(describeEbookQuota(4, false)).toBe(`4 / ${FREE_EBOOK_QUOTA} livres gratuits`);
  });
  it('annonce l’illimité en Plus', () => {
    expect(describeEbookQuota(12, true)).toBe('Plus — imports illimités');
  });
});

describe('isEbookQuotaReached', () => {
  it('ne se déclenche qu’au quota, et jamais en Plus', () => {
    expect(isEbookQuotaReached(FREE_EBOOK_QUOTA - 1, false)).toBe(false);
    expect(isEbookQuotaReached(FREE_EBOOK_QUOTA, false)).toBe(true);
    expect(isEbookQuotaReached(FREE_EBOOK_QUOTA + 3, false)).toBe(true);
    expect(isEbookQuotaReached(999, true)).toBe(false);
  });
});

describe('describeEbookProgress', () => {
  it('rien à 0 % (un livre jamais ouvert n’a pas de progression)', () => {
    expect(describeEbookProgress(book())).toBeNull();
  });
  it('chapitre affiché en base 1 et borné', () => {
    expect(describeEbookProgress(book({ progressChapter: 2, progressPct: 25 }))).toBe(
      'Chapitre 3/12 · 25 %'
    );
    // Index hors bornes (livre modifié après coup) : ramené dans le livre.
    expect(describeEbookProgress(book({ progressChapter: 99, progressPct: 100 }))).toBe(
      'Chapitre 12/12 · 100 %'
    );
  });
  it('sans chapitre compté, n’affiche que le pourcentage', () => {
    expect(describeEbookProgress(book({ chapterCount: 0, progressPct: 40 }))).toBe('40 %');
  });
  it('pourcentage non fini ou hors bornes ramené à [0,100]', () => {
    expect(describeEbookProgress(book({ progressPct: Number.NaN }))).toBeNull();
    expect(describeEbookProgress(book({ progressPct: 180 }))).toBe('Chapitre 1/12 · 100 %');
  });
});

describe('clampPct / clampChapter', () => {
  it('borne les pourcentages', () => {
    expect(clampPct(-10)).toBe(0);
    expect(clampPct(101)).toBe(100);
    expect(clampPct(42.4)).toBe(42);
    expect(clampPct(Number.POSITIVE_INFINITY)).toBe(0);
  });
  it('borne les index de chapitre (livre vide = 0)', () => {
    expect(clampChapter(-3, 5)).toBe(0);
    expect(clampChapter(9, 5)).toBe(4);
    expect(clampChapter(3, 0)).toBe(0);
    expect(clampChapter(Number.NaN, 5)).toBe(0);
  });
});

describe('describeEbookError', () => {
  it('branche sur le CODE, jamais sur le libellé', () => {
    expect(describeEbookError('EBOOK_QUOTA_EXCEEDED')).toContain('Quota de 5 livres gratuits');
    expect(describeEbookError('EBOOK_QUOTA_EXCEEDED')).toContain('restent accessibles');
    expect(describeEbookError('EBOOK_DUPLICATE')).toBe(
      'Ce livre est déjà dans votre bibliothèque.'
    );
    expect(describeEbookError('NOT_FOUND')).toBe('Livre introuvable.');
    expect(describeEbookError('UNAUTHORIZED')).toContain('Connectez-vous');
  });
  it('retombe sur le message serveur puis sur un générique', () => {
    expect(describeEbookError('WHATEVER', 'EPUB invalide : zip illisible')).toBe(
      'EPUB invalide : zip illisible'
    );
    expect(describeEbookError(undefined, undefined)).toBe('Import impossible pour le moment.');
  });
});

describe('chemins et fichiers', () => {
  it('encode les identifiants dans les URL', () => {
    expect(ebookCoverUrl('a/b c')).toBe('/api/ebooks/a%2Fb%20c/cover');
    expect(ebookReadUrl('a/b c')).toBe('/library/ebooks/a%2Fb%20c');
  });
  it('n’accepte que l’extension .epub (le serveur re-vérifie le contenu)', () => {
    expect(isEpubFileName('livre.epub')).toBe(true);
    expect(isEpubFileName('LIVRE.EPUB')).toBe(true);
    expect(isEpubFileName(' livre.epub ')).toBe(true);
    expect(isEpubFileName('livre.pdf')).toBe(false);
    expect(isEpubFileName('epub')).toBe(false);
  });
  it('affiche la borne d’import en Mo', () => {
    expect(describeEbookSizeLimit(20 * 1024 * 1024)).toBe('20 Mo max');
  });
});
