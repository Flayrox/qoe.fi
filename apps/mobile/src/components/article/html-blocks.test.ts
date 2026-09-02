import { describe, expect, it } from 'vitest';

import {
  buildBlockIndex,
  computeHighlightTokenSets,
  findOccurrence,
  hitTestToken,
  htmlToBlocks,
  normalizeDisplay,
  ordinalAt,
  rangeToRawText,
  selectionToInfo,
  tokenizeDisplay,
  type RectsBundle,
} from './html-blocks-core';

describe('normalizeDisplay — blancs affichés en espace simple, projection raw exacte', () => {
  it('réduit les runs de blancs (espaces, tabs, sauts de ligne)', () => {
    const { text, toRaw } = normalizeDisplay('Un  deux\n\ttrois');
    expect(text).toBe('Un deux trois');
    // 'U'=0, 'n'=1, ' '=2 (consomme le 1er blanc du run "  "), 'd'=4…
    expect(toRaw).toEqual([0, 1, 2, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14]);
  });

  it('trim les blancs de tête et de queue', () => {
    const { text } = normalizeDisplay('  bonjour  ');
    expect(text).toBe('bonjour');
  });

  it('projette un slice affiché vers le texte brut d’origine', () => {
    const { text, toRaw } = normalizeDisplay('a  bb\nc');
    const slice = text.slice(1, 4);
    expect(slice).toBe(' bb');
    // Les blancs BRUTS sont préservés dans la projection inverse :
    // le ' ' affiché (toRaw[1]=1) remonte aux DEUX espaces du raw.
    const rawSlice = 'a  bb\nc'.slice(toRaw[1], toRaw[3] + 1);
    expect(rawSlice).toBe('  bb');
  });
});

describe('tokenizeDisplay — découpe en mots mesurables', () => {
  it('produit des tokens avec offsets dans le texte affiché', () => {
    const tokens = tokenizeDisplay('Le chat dort.', 2, 0);
    expect(tokens.map((t) => t.text)).toEqual(['Le', 'chat', 'dort.']);
    expect(tokens.map((t) => t.id)).toEqual(['2:0:0', '2:0:1', '2:0:2']);
    expect(tokens[1]).toMatchObject({ start: 3, end: 7 });
  });
});

describe('buildBlockIndex — segments par bloc, un par item de liste', () => {
  it('indexe paragraphes et items de liste', () => {
    const blocks = htmlToBlocks(
      '<p>Intro</p><p>Premier paragraphe.</p><ul><li>Item un</li><li>Item deux</li></ul>'
    );
    const index = buildBlockIndex(blocks);
    expect(index.map((s) => s.flowId)).toEqual(['0:0', '1:0', '2:0', '2:1']);
    expect(index[0].raw).toBe('Intro');
    expect(index[2].raw).toBe('Item un');
    expect(index[2].tokens.map((t) => t.text)).toEqual(['Item', 'un']);
  });
});

describe('rangeToRawText — extrait brut exact entre deux tokens', () => {
  const index = buildBlockIndex(
    htmlToBlocks('<p>Le chat  mange la souris.</p><p>Le chat dort.</p>')
  );
  const t = (flow: string, tok: number) =>
    index.find((s) => s.flowId === flow)!.tokens.find((x) => x.tokIdx === tok)!;

  it('mots successifs — préserve les doubles espaces bruts', () => {
    expect(rangeToRawText(index, t('0:0', 0), t('0:0', 2))).toBe('Le chat  mange');
  });

  it('un seul mot', () => {
    expect(rangeToRawText(index, t('0:0', 2), t('0:0', 2))).toBe('mange');
  });

  it('traverse les paragraphes — jointure \n\n identique à la base', () => {
    expect(rangeToRawText(index, t('0:0', 4), t('1:0', 2))).toBe('souris.\n\nLe chat dort.');
  });

  it('gère une sélection inversée (de → vers l’arrière)', () => {
    expect(rangeToRawText(index, t('1:0', 0), t('0:0', 1))).toBe('chat  mange la souris.\n\nLe');
  });
});

describe('ordinalAt — occurrence d’une citation dans la base', () => {
  const basis = 'Le chat mange.\n\nLe chat dort.';

  it('première occurrence → 0', () => {
    expect(ordinalAt(basis, 'chat', 3)).toBe(0);
  });

  it('occurrences STRICTEMENT avant la position → ordinal correct', () => {
    // « chat » du 2e paragraphe : position 19 — une occurrence avant.
    expect(ordinalAt(basis, 'chat', 19)).toBe(1);
  });

  it('pas d’occurrence avant → 0', () => {
    expect(ordinalAt(basis, 'dort.', 0)).toBe(0);
  });
});

describe('findOccurrence — même sémantique que le walker DOM web', () => {
  const index = buildBlockIndex(htmlToBlocks('<p>Le chat et le chat.</p>'));

  it('résout l’ordinal 1 → deuxième occurrence', () => {
    const occ = findOccurrence(index, 'chat', 1);
    expect(occ).not.toBeNull();
    expect(index[0].display.slice(occ!.start, occ!.end)).toBe('chat');
    expect(occ!.start).toBe(14);
  });

  it('repli sur la première occurrence si l’ordinal est trop grand', () => {
    const occ = findOccurrence(index, 'chat', 9);
    expect(index[0].display.slice(occ!.start, occ!.end)).toBe('chat');
    expect(occ!.start).toBe(3);
  });

  it('normalise les blancs (sélections du web rendues en espace simple)', () => {
    const occ = findOccurrence(index, 'le  chat', 0);
    expect(index[0].display.slice(occ!.start, occ!.end)).toBe('le chat');
  });
});

describe('computeHighlightTokenSets — peinture inline des <mark>', () => {
  const index = buildBlockIndex(
    htmlToBlocks('<p>Le chat mange la souris.</p><p>Le chat dort.</p>')
  );

  it('surligne les bons tokens (2e occurrence)', () => {
    const set = computeHighlightTokenSets(index, [{ text: 'Le chat', quoteOrdinal: 1 }]);
    expect([...set].sort()).toEqual(['1:0:0', '1:0:1']);
  });

  it('surligne un mot dans le 1er paragraphe', () => {
    const set = computeHighlightTokenSets(index, [{ text: 'souris.', quoteOrdinal: 0 }]);
    expect([...set]).toEqual(['0:0:4']);
  });

  it('ignore les entrées vides', () => {
    const set = computeHighlightTokenSets(index, [null, { text: '  ' }, { quoteOrdinal: 0 }]);
    expect(set.size).toBe(0);
  });

  it('repli sur le texte brut exact (sélection mobile à blancs d’origine)', () => {
    // Le web stockerait « chat  mange » ? Non — le web normalise. Mais une
    // sélection mobile sur « chat  mange » (2 espaces) doit quand même
    // ancrer : repli sur la passe brute.
    const rawIndex = buildBlockIndex(htmlToBlocks('<p>Le chat  mange.</p>'));
    const set = computeHighlightTokenSets(rawIndex, [{ text: 'chat  mange', quoteOrdinal: 0 }]);
    expect([...set].sort()).toEqual(['0:0:1', '0:0:2']);
  });
});

describe('selectionToInfo — popover prêt à l’emploi (texte + quoteOrdinal)', () => {
  const index = buildBlockIndex(
    htmlToBlocks('<p>Le chat mange la souris.</p><p>Le chat dort.</p>')
  );
  const seg0 = index.find((s) => s.flowId === '0:0')!;
  const seg1 = index.find((s) => s.flowId === '1:0')!;

  const rects: RectsBundle = {
    blockRects: new Map([
      [0, { x: 0, y: 0, width: 300, height: 24 }],
      [1, { x: 0, y: 40, width: 300, height: 24 }],
    ]),
    rowRects: new Map(),
    flowRects: new Map([
      ['0:0', { x: 0, y: 0, width: 300, height: 24 }],
      ['1:0', { x: 0, y: 0, width: 300, height: 24 }],
    ]),
    tokenRects: new Map(
      [...seg0.tokens, ...seg1.tokens].map((t, i) => [
        t.id,
        { x: (i % 4) * 70, y: 0, width: 60, height: 24 },
      ])
    ),
  };

  it('sélection simple → texte brut + ordinal 0', () => {
    const info = selectionToInfo(index, '0:0:1', '0:0:1', rects);
    expect(info).toMatchObject({ text: 'chat', index: 0, from: '0:0:1', to: '0:0:1' });
  });

  it('2e occurrence de « chat » → quoteOrdinal 1', () => {
    const info = selectionToInfo(index, '1:0:1', '1:0:1', rects);
    expect(info?.text).toBe('chat');
    expect(info?.index).toBe(1);
  });

  it('multi-paragraphes → jointure \n\n + ordinal 0', () => {
    const info = selectionToInfo(index, '0:0:4', '1:0:2', rects);
    expect(info?.text).toBe('souris.\n\nLe chat dort.');
    expect(info?.index).toBe(0);
  });

  it('sélection inversée → bornes normalisées', () => {
    const info = selectionToInfo(index, '1:0:1', '0:0:1', rects);
    expect(info?.text).toBe('chat mange la souris.\n\nLe chat');
    expect(info?.from).toBe('0:0:1');
    expect(info?.to).toBe('1:0:1');
  });

  it('token inconnu → null', () => {
    expect(selectionToInfo(index, '0:0:1', '99:9:9', rects)).toBeNull();
  });

  it('y = début du passage (le plus haut des deux bornes)', () => {
    const info = selectionToInfo(index, '1:0:0', '1:0:2', rects);
    expect(info?.y).toBe(40 + 12); // centre du 2e paragraphe
  });
});

describe('hitTestToken — le mot sous le doigt', () => {
  const rects = new Map<string, { x: number; y: number; width: number; height: number }>([
    ['0:0:0', { x: 10, y: 20, width: 40, height: 20 }],
    ['0:0:1', { x: 60, y: 20, width: 50, height: 20 }],
  ]);

  it('trouve le token contenant le point', () => {
    expect(hitTestToken(rects, 30, 25)).toBe('0:0:0');
    expect(hitTestToken(rects, 85, 30)).toBe('0:0:1');
  });

  it('hors de tout token → null', () => {
    expect(hitTestToken(rects, 200, 25)).toBeNull();
  });
});
