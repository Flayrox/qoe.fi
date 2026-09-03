// @vitest-environment jsdom
// Tests des helpers PURS du document canonique (aucun DOM requis).
import { describe, it, expect } from 'vitest';
import {
  segmentWindow,
  toLocalRange,
  runBoundaries,
  marksCovering,
  styleSegments,
  type CanonicalDocument,
} from '../canonical-document';

// Même fixture que le corpus Go : <p>Bonjour <strong>le monde</strong> !</p>
// → texte canonique « Bonjour le monde ! » (18 code points).
const doc: CanonicalDocument = {
  blocks: [
    { kind: 'p', text: 'Bonjour le monde !' },
    { kind: 'p', text: 'Deuxième partie ici' },
    {
      kind: 'list',
      ordered: true,
      items: [{ text: 'Premier' }, { text: 'Second point' }],
    },
  ],
  segments: [
    { blockIdx: 0, itemIdx: 0, text: 'Bonjour le monde !', start: 0, end: 18 },
    { blockIdx: 1, itemIdx: 0, text: 'Deuxième partie ici', start: 19, end: 37 },
    { blockIdx: 2, itemIdx: 0, text: 'Premier', start: 38, end: 45 },
    { blockIdx: 2, itemIdx: 1, text: 'Second point', start: 46, end: 58 },
  ],
  text: 'Bonjour le monde ! Deuxième partie ici Premier Second point',
  sha: 'sha-1',
};

describe('segmentWindow', () => {
  it('retrouve la fenêtre globale d’un bloc', () => {
    expect(segmentWindow(doc, 1, 0)).toEqual({ start: 19, end: 37 });
  });
  it('retrouve la fenêtre d’un item de liste', () => {
    expect(segmentWindow(doc, 2, 1)).toEqual({ start: 46, end: 58 });
  });
  it('retourne null pour un segment inconnu', () => {
    expect(segmentWindow(doc, 5, 0)).toBeNull();
  });
});

describe('toLocalRange', () => {
  it('convertit une plage globale en plage locale', () => {
    expect(toLocalRange(19, 37, 25, 31)).toEqual({ start: 6, end: 12 });
  });
  it('retourne null quand la plage ne touche pas la fenêtre', () => {
    expect(toLocalRange(0, 18, 30, 40)).toBeNull();
  });
  it('clamp une plage qui déborde', () => {
    expect(toLocalRange(0, 18, 10, 99)).toEqual({ start: 10, end: 18 });
  });
});

describe('runBoundaries', () => {
  it('découpe aux bornes des marques', () => {
    const marks = [
      { start: 2, end: 5, id: 'a' },
      { start: 8, end: 12, id: 'b' },
    ] as never[];
    expect(runBoundaries(15, marks)).toEqual([0, 2, 5, 8, 12, 15]);
  });
  it('ignore les marques vides ou hors bornes', () => {
    const marks = [
      { start: 5, end: 5, id: 'vide' },
      { start: 20, end: 25, id: 'hors' },
    ] as never[];
    expect(runBoundaries(10, marks)).toEqual([0, 10]);
  });
});

describe('marksCovering', () => {
  it('ne garde que les marques couvrant entièrement le run', () => {
    const marks = [
      { start: 1, end: 9, id: 'couverture' },
      { start: 2, end: 4, id: 'partiel' },
    ] as never[];
    const covering = marksCovering(marks, 3, 6);
    expect(covering.map((m) => (m as { id: string }).id)).toEqual(['couverture']);
  });
});

describe('styleSegments', () => {
  it('découpe aux bornes des spans inline et accumule les styles', () => {
    const segs = styleSegments(8, 16, [
      { start: 8, end: 16, style: 'bold' },
      { start: 11, end: 16, style: 'italic' },
    ]);
    expect(segs).toEqual([
      { start: 8, end: 11, styles: ['bold'] },
      { start: 11, end: 16, styles: ['bold', 'italic'] },
    ]);
  });
  it('porte le href sur les liens', () => {
    const segs = styleSegments(0, 4, [{ start: 0, end: 4, style: 'link', href: 'https://qoe.fi' }]);
    expect(segs[0]).toEqual({ start: 0, end: 4, styles: ['link'], href: 'https://qoe.fi' });
  });
  it('aucun span → un seul segment brut', () => {
    expect(styleSegments(0, 5, undefined)).toEqual([{ start: 0, end: 5, styles: [] }]);
  });
});
