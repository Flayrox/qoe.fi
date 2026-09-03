import { describe, expect, it } from 'vitest';

import {
  buildBlockIndex,
  canonicalDocumentToBlocks,
  computeHighlightTokenSets,
  findOccurrence,
  hitTestToken,
  htmlToBlocks,
  mergeRectsToBands,
  normalizeDisplay,
  ordinalAt,
  rangeToRawText,
  selectionToInfo,
  tokenizeDisplay,
  type RectsBundle,
} from './html-blocks-core';
import type { CanonicalDocument } from '@qoe/sdk/mobile';

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

  it('fusionne les tokens d’une même ligne en une bande continue', () => {
    const bands = mergeRectsToBands([
      { x: 0, y: 0, width: 40, height: 24 },
      { x: 44, y: 0, width: 55, height: 24 },
      { x: 103, y: 0, width: 30, height: 24 },
      { x: 0, y: 28, width: 90, height: 24 },
      { x: 94, y: 28, width: 20, height: 24 },
    ]);
    expect(bands).toHaveLength(2);
    // Ligne 1 : de x=0 à x=133 (les 3 mots, espaces couverts).
    expect(bands[0]).toEqual({ x: 0, y: 0, width: 133, height: 24 });
    // Ligne 2 : de x=0 à x=114.
    expect(bands[1]).toEqual({ x: 0, y: 28, width: 114, height: 24 });
  });

  it('ne fusionne pas deux lignes différentes', () => {
    const bands = mergeRectsToBands([
      { x: 0, y: 0, width: 40, height: 24 },
      { x: 10, y: 30, width: 40, height: 24 },
    ]);
    expect(bands).toHaveLength(2);
  });

  it('fusionne les tokens d’une même ligne en une bande continue', () => {
    const bands = mergeRectsToBands([
      { x: 0, y: 0, width: 40, height: 24 },
      { x: 44, y: 0, width: 55, height: 24 },
      { x: 103, y: 0, width: 30, height: 24 },
      { x: 0, y: 28, width: 90, height: 24 },
      { x: 94, y: 28, width: 20, height: 24 },
    ]);
    expect(bands).toHaveLength(2);
    // Ligne 1 : de x=0 à x=133 (les 3 mots, espaces couverts).
    expect(bands[0]).toEqual({ x: 0, y: 0, width: 133, height: 24 });
    // Ligne 2 : de x=0 à x=114.
    expect(bands[1]).toEqual({ x: 0, y: 28, width: 114, height: 24 });
  });

  it('ne fusionne pas deux lignes différentes', () => {
    const bands = mergeRectsToBands([
      { x: 0, y: 0, width: 40, height: 24 },
      { x: 10, y: 30, width: 40, height: 24 },
    ]);
    expect(bands).toHaveLength(2);
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

// ─────────────────────────────────────────────────────────────────────
// Tranche 1-d — document canonique (blocs serveur + marques par offsets)
// ─────────────────────────────────────────────────────────────────────

/** Doc canonique de « <p>Le chat mange la souris.</p><p>Le chat dort.</p> »
 * (segments séparés par UN espace ; offsets en code points). */
const doc: CanonicalDocument = {
  sha: 'abc123',
  text: 'Le chat mange la souris. Le chat dort.',
  blocks: [
    { kind: 'p', text: 'Le chat mange la souris.' },
    { kind: 'p', text: 'Le chat dort.' },
  ],
  segments: [
    { blockIdx: 0, itemIdx: 0, text: 'Le chat mange la souris.', start: 0, end: 24 },
    { blockIdx: 1, itemIdx: 0, text: 'Le chat dort.', start: 25, end: 38 },
  ],
};

describe('canonicalDocumentToBlocks — blocs serveur → blocs du moteur', () => {
  it('mappe tous les kinds (p, titres, listes ordonnées/puces, img, hr, citation)', () => {
    const blocks = canonicalDocumentToBlocks({
      sha: 'x',
      text: '',
      blocks: [
        { kind: 'p', text: 'Intro' },
        { kind: 'h2', text: 'Titre' },
        { kind: 'list', ordered: true, items: [{ text: 'Un' }, { text: 'Deux' }] },
        { kind: 'list', items: [{ text: 'A' }] },
        { kind: 'img', src: 'https://x/y.jpg', alt: 'alt' },
        { kind: 'hr' },
        { kind: 'blockquote', text: 'Citation' },
        { kind: 'code', text: 'fn()' },
      ],
      segments: [],
    });
    expect(blocks).toEqual([
      { type: 'p', text: 'Intro' },
      { type: 'h2', text: 'Titre' },
      { type: 'ol', items: ['Un', 'Deux'] },
      { type: 'ul', items: ['A'] },
      { type: 'img', src: 'https://x/y.jpg', alt: 'alt' },
      { type: 'hr' },
      { type: 'blockquote', text: 'Citation' },
      { type: 'code', text: 'fn()' },
    ]);
  });

  it('construit un index identique à l’équivalent HTML (textes normalisés)', () => {
    const index = buildBlockIndex(canonicalDocumentToBlocks(doc));
    expect(index.map((s) => s.flowId)).toEqual(['0:0', '1:0']);
    expect(index[0].display).toBe('Le chat mange la souris.');
    expect(index[1].display).toBe('Le chat dort.');
  });
});

describe('computeHighlightTokenSets — peinture PAR OFFSETS (document canonique)', () => {
  const index = buildBlockIndex(canonicalDocumentToBlocks(doc));

  it('ancres > ordinal : [25,32) = « Le chat » du 2e paragraphe, même avec ordinal 0', () => {
    const set = computeHighlightTokenSets(
      index,
      [{ text: 'Le chat', quoteOrdinal: 0, canonicalStart: 25, canonicalEnd: 32 }],
      doc
    );
    expect([...set].sort()).toEqual(['1:0:0', '1:0:1']);
  });

  it('coupe exactement sur les bornes du segment (plage à cheval sur 2 blocs)', () => {
    // [20, 30) : « ouris. » fin du bloc 0 + « Le c » du bloc 1.
    const set = computeHighlightTokenSets(
      index,
      [{ text: 'x', quoteOrdinal: 0, canonicalStart: 20, canonicalEnd: 30 }],
      doc
    );
    expect([...set].sort()).toEqual(['0:0:4', '1:0:0', '1:0:1']);
  });

  it('plage vide (hors document) → aucun token', () => {
    const set = computeHighlightTokenSets(
      index,
      [{ text: 'x', quoteOrdinal: 0, canonicalStart: 500, canonicalEnd: 510 }],
      doc
    );
    expect(set.size).toBe(0);
  });

  it('sans ancres → repli recherche de texte (surlignages hérités)', () => {
    const set = computeHighlightTokenSets(index, [{ text: 'chat', quoteOrdinal: 1 }], doc);
    expect([...set].sort()).toEqual(['1:0:1']);
  });

  it('sans document → moteur hérité inchangé', () => {
    const set = computeHighlightTokenSets(index, [{ text: 'chat', quoteOrdinal: 1 }]);
    expect([...set].sort()).toEqual(['1:0:1']);
  });

  it('offsets CODE POINTS sûrs avec émoticône (sans conversion, 👋 peindrait à tort)', () => {
    const emojiDoc: CanonicalDocument = {
      sha: 'e',
      text: '👋 salut tout le monde',
      blocks: [{ kind: 'p', text: '👋 salut tout le monde' }],
      segments: [{ blockIdx: 0, itemIdx: 0, text: '👋 salut tout le monde', start: 0, end: 21 }],
    };
    const emojiIndex = buildBlockIndex(canonicalDocumentToBlocks(emojiDoc));
    // [1, 3) = « s » + espace… en code points : ne couvre PAS l'émoticône.
    const set = computeHighlightTokenSets(
      emojiIndex,
      [{ text: 'sa', quoteOrdinal: 0, canonicalStart: 1, canonicalEnd: 3 }],
      emojiDoc
    );
    expect([...set]).toEqual(['0:0:1']);
  });
});

describe('selectionToInfo — ordinal canonique + ancre (document fourni)', () => {
  const index = buildBlockIndex(canonicalDocumentToBlocks(doc));
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

  it('joint l’ancre canonique du passage (code points dans document.text)', () => {
    // « chat dort. » : début canonique = 25 (seg1) + 3 (« Le ») = 28 ; fin = 38.
    const info = selectionToInfo(index, '1:0:1', '1:0:2', rects, doc);
    expect(info?.text).toBe('chat dort.');
    expect(info?.canonicalStart).toBe(28);
    expect(info?.canonicalEnd).toBe(38);
  });

  it('calcule l’ordinal sur le texte canonique serveur (dupliqué → 1)', () => {
    const info = selectionToInfo(index, '1:0:1', '1:0:1', rects, doc);
    expect(info?.text).toBe('chat');
    expect(info?.index).toBe(1);
  });

  it('sélection multi-paragraphes → ordinal 0 + ancre couvrant les 2 blocs', () => {
    const info = selectionToInfo(index, '0:0:4', '1:0:2', rects, doc);
    expect(info?.text).toBe('souris.\n\nLe chat dort.');
    expect(info?.index).toBe(0);
    expect(info?.canonicalStart).toBe(17); // « souris. » commence à 17
    expect(info?.canonicalEnd).toBe(38);
  });

  it('sans document → comportement hérité (pas d’ancre)', () => {
    const info = selectionToInfo(index, '0:0:1', '0:0:1', rects);
    expect(info?.text).toBe('chat');
    expect(info?.canonicalStart).toBeUndefined();
  });

  it('ancre en CODE POINTS avec émoticône (👋 = 1, pas 2)', () => {
    const emojiDoc: CanonicalDocument = {
      sha: 'e',
      text: '👋 salut',
      blocks: [{ kind: 'p', text: '👋 salut' }],
      segments: [{ blockIdx: 0, itemIdx: 0, text: '👋 salut', start: 0, end: 7 }],
    };
    const emojiIndex = buildBlockIndex(canonicalDocumentToBlocks(emojiDoc));
    const emojiRects: RectsBundle = {
      blockRects: new Map([[0, { x: 0, y: 0, width: 300, height: 24 }]]),
      rowRects: new Map(),
      flowRects: new Map([['0:0', { x: 0, y: 0, width: 300, height: 24 }]]),
      tokenRects: new Map(
        emojiIndex[0].tokens.map((t, i) => [t.id, { x: i * 70, y: 0, width: 60, height: 24 }])
      ),
    };
    const info = selectionToInfo(emojiIndex, '0:0:0', '0:0:0', emojiRects, emojiDoc);
    expect(info?.text).toBe('👋');
    expect(info?.canonicalStart).toBe(0);
    expect(info?.canonicalEnd).toBe(1); // 1 code point, pas 2 unités UTF-16
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
