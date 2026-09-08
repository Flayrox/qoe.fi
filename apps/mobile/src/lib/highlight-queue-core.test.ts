import { describe, expect, it } from 'vitest';

import {
  computeLocalAnchors,
  normalizeCanonical,
  toLocalHighlight,
  type PendingHighlightCreate,
} from './highlight-queue-core';

const doc = { text: 'Bonjour le monde. Bonjour le monde.' };

const pending: PendingHighlightCreate = {
  localId: 'local-abc',
  articleId: 'a1',
  text: 'Bonjour le monde',
  note: null,
  isPublic: false,
  quoteOrdinal: 0,
  createdAt: '2026-09-08T12:00:00.000Z',
};

describe('normalizeCanonical', () => {
  it('réduit les runs de blancs et trim', () => {
    expect(normalizeCanonical('  Bonjour   le\nmonde\t!  ')).toBe('Bonjour le monde !');
  });
  it('gère le NBSP comme un espace', () => {
    expect(normalizeCanonical('Bonjour\u00a0le monde')).toBe('Bonjour le monde');
  });
});

describe('computeLocalAnchors', () => {
  it('localise la première occurrence', () => {
    expect(computeLocalAnchors(doc, 'Bonjour le monde', 0)).toEqual({ start: 0, end: 16 });
  });

  it('localise la deuxième occurrence (ordinal 1)', () => {
    // « Bonjour le monde. » fait 17 code points → 2e occurrence à 18.
    expect(computeLocalAnchors(doc, 'Bonjour le monde', 1)).toEqual({ start: 18, end: 34 });
  });

  it('normalise les blancs du passage avant recherche', () => {
    expect(computeLocalAnchors(doc, 'Bonjour   le\nmonde', 0)).toEqual({ start: 0, end: 16 });
  });

  it('retombe sur la première occurrence si l ordinal dépasse le compte', () => {
    expect(computeLocalAnchors(doc, 'Bonjour le monde', 5)).toEqual({ start: 0, end: 16 });
  });

  it('retourne null si introuvable', () => {
    expect(computeLocalAnchors(doc, 'Ce texte n existe pas', 0)).toBeNull();
  });

  it('retourne null si le passage est vide', () => {
    expect(computeLocalAnchors(doc, '   ', 0)).toBeNull();
  });

  it('compte en code points (emoji)', () => {
    expect(computeLocalAnchors({ text: '😀😀😀' }, '😀', 1)).toEqual({ start: 1, end: 2 });
  });

  it('traite les occurrences comme non chevauchantes (comme indexOf/Go)', () => {
    // « aa » dans « aaa » : une seule occurrence (pas de chevauchement) →
    // l'ordinal 1 retombe sur la première, comme canon.Find côté Go.
    expect(computeLocalAnchors({ text: 'aaa' }, 'aa', 1)).toEqual({ start: 0, end: 2 });
  });
});

describe('toLocalHighlight', () => {
  it('construit un Highlight optimiste avec ancres quand le doc est fourni', () => {
    const hl = toLocalHighlight(pending, 'me', doc);
    expect(hl.id).toBe('local-abc');
    expect(hl.pending).toBe(true);
    expect(hl.localId).toBe('local-abc');
    expect(hl.readerId).toBe('me');
    expect(hl.canonicalStart).toBe(0);
    expect(hl.canonicalEnd).toBe(16);
    expect(hl.contentSha).toBeUndefined(); // doc sans sha
  });

  it('ancre le document avec sha', () => {
    const hl = toLocalHighlight(pending, 'me', { text: doc.text, sha: 'abc123' });
    expect(hl.contentSha).toBe('abc123');
  });

  it('reste sans ancres si pas de document (repli text+quoteOrdinal)', () => {
    const hl = toLocalHighlight(pending, 'me', null);
    expect(hl.canonicalStart).toBeUndefined();
    expect(hl.canonicalEnd).toBeUndefined();
  });
});
