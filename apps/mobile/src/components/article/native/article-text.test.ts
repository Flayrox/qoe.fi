import { describe, expect, it } from 'vitest';

import type { CanonicalDocument } from '@qoe/sdk/mobile';
import {
  buildArticleText,
  canonicalSlice,
  canonicalToDisplayCpRange,
  cpLength,
  cpToUtf16,
  displayRangeToCanonical,
  utf16ToCp,
} from './article-text';
import { buildNativeMarks, buildDisplayRanges } from './marks';
import { nativeSelectionToInfo, nativeSelectionToPopoverInfo } from './selection';

// ─────────────────────────────────────────────────────────────────────
// Fixtures (miroir du corpus Go : segments séparés par UN espace,
// offsets en code points ; runs inline sur le texte normalisé)
// ─────────────────────────────────────────────────────────────────────

/** Doc « <p>Le chat mange la souris.</p><p>Le chat dort.</p> ». */
const twoParasDoc: CanonicalDocument = {
  sha: 'abc123',
  text: 'Le chat mange la souris. Le chat dort.',
  blocks: [
    {
      kind: 'p',
      text: 'Le chat mange la souris.',
      inline: [{ start: 3, end: 7, style: 'bold' }], // « chat »
      spans: [{ start: 0, end: 2, note: 'Officiel' }], // « Le »
    },
    { kind: 'p', text: 'Le chat dort.' },
  ],
  segments: [
    { blockIdx: 0, itemIdx: 0, text: 'Le chat mange la souris.', start: 0, end: 24 },
    { blockIdx: 1, itemIdx: 0, text: 'Le chat dort.', start: 25, end: 38 },
  ],
};

/** Doc mixte : h1, img, liste ordonnée, émoticône inline. */
const richDoc: CanonicalDocument = {
  sha: 'rich-1',
  text: 'Titre Point A Point B',
  blocks: [
    { kind: 'h1', text: 'Titre' },
    { kind: 'img', src: 'https://x/y.jpg', alt: 'photo' },
    {
      kind: 'list',
      ordered: true,
      items: [
        { text: 'Point A', inline: [{ start: 0, end: 4, style: 'italic' }] },
        { text: 'Point B' },
      ],
    },
  ],
  segments: [
    { blockIdx: 0, itemIdx: 0, text: 'Titre', start: 0, end: 5 },
    { blockIdx: 2, itemIdx: 0, text: 'Point A', start: 6, end: 13 },
    { blockIdx: 2, itemIdx: 1, text: 'Point B', start: 14, end: 21 },
  ],
};

/** Doc avec émoticône (👋 = 1 code point, 2 unités UTF-16). */
const emojiDoc: CanonicalDocument = {
  sha: 'e',
  text: '👋 salut tout le monde',
  blocks: [
    {
      kind: 'p',
      text: '👋 salut tout le monde',
      inline: [{ start: 1, end: 6, style: 'bold' }], // « salut »
    },
  ],
  segments: [{ blockIdx: 0, itemIdx: 0, text: '👋 salut tout le monde', start: 0, end: 21 }],
};

describe('buildArticleText — texte plat continu', () => {
  it('joint les paragraphes par un retour, sans blanc parasite en tête/queue', () => {
    const m = buildArticleText(twoParasDoc);
    expect(m.text).toBe('Le chat mange la souris.\nLe chat dort.');
    expect(m.text.startsWith(' ') || m.text.endsWith(' ')).toBe(false);
    expect(m.paragraphs.map((p) => p.kind)).toEqual(['p', 'p']);
    expect(m.paragraphs[0].startCp).toBe(0);
    expect(m.paragraphs[0].endCp).toBe(24);
  });

  it('mappe chaque caractère réel à son offset canonique, les retours à -1', () => {
    const m = buildArticleText(twoParasDoc);
    expect(m.canonicalCp.length).toBe(cpLength(m.text));
    // « Le chat mange la souris. » = display [0,24) → canonique [0,24)
    expect(m.canonicalCp.slice(0, 24)).toEqual([...Array(24).keys()]);
    // Le '\n' inter-paragraphe (display 24) est synthétique.
    expect(m.canonicalCp[24]).toBe(-1);
    // Second paragraphe → canonique [25,38)
    expect(m.canonicalCp[25]).toBe(25);
    expect(m.canonicalCp[m.canonicalCp.length - 1]).toBe(37);
  });

  it('convertit les runs inline et spans officiels en coordonnées d’affichage', () => {
    const m = buildArticleText(twoParasDoc);
    const bold = m.runs.find((r) => r.style === 'bold')!;
    expect(bold.startCp).toBe(3); // « chat »
    expect(bold.endCp).toBe(7);
    expect(m.officialMarks).toEqual([{ kind: 'official', startCp: 0, endCp: 2 }]);
  });

  it('liste ordonnée : puces numériques synthétiques + un paragraphe par item', () => {
    const m = buildArticleText(richDoc);
    expect(m.text).toContain('\uFFFC'); // marqueur d'attachement
    expect(m.text).toContain('1. Point A');
    expect(m.text).toContain('2. Point B');
    expect(m.attachments).toHaveLength(1);
    expect(m.attachments[0]).toMatchObject({ kind: 'img', src: 'https://x/y.jpg' });
    const items = m.paragraphs.filter((p) => p.listItem);
    expect(items).toHaveLength(2);
    expect(items.map((p) => p.orderedIndex)).toEqual([1, 2]);
    // Les chiffres « 1. »/« 2. » sont synthétiques (jamais cités).
    const numCp = m.text.indexOf('1.');
    expect(m.canonicalCp[numCp]).toBe(-1);
    // Le texte réel des items garde son offset canonique (6 → « Point A »).
    const aStart = m.text.indexOf('Point A');
    expect(m.canonicalCp[aStart]).toBe(6);
  });

  it('émoticône : longueur CP et UTF-16 cohérentes', () => {
    const m = buildArticleText(emojiDoc);
    expect(m.text).toBe('👋 salut tout le monde');
    expect(cpLength(m.text)).toBe(21);
    expect(m.text.length).toBe(22); // 👋 = 2 unités UTF-16
    expect(cpToUtf16(m.text, 1)).toBe(2);
    expect(utf16ToCp(m.text, 2)).toBe(1);
    // Run inline « salut » = display [1,6) (code points) → UTF-16 [2,7).
    const bold = m.runs.find((r) => r.style === 'bold')!;
    expect(bold.startCp).toBe(1);
    expect(bold.endCp).toBe(6);
  });
});

describe('canonicalToDisplayCpRange — marques continues', () => {
  it('plage intra-bloc exacte', () => {
    const m = buildArticleText(twoParasDoc);
    const r = canonicalToDisplayCpRange(m, 3, 7); // « chat »
    expect(r).toEqual({ startCp: 3, endCp: 7 });
  });

  it('plage multi-paragraphes → bande continue incluant le retour', () => {
    const m = buildArticleText(twoParasDoc);
    // [17,38) : « souris. » → fin du 2e paragraphe. Le retour (24) est inclus.
    const r = canonicalToDisplayCpRange(m, 17, 38)!;
    expect(r.startCp).toBe(17);
    expect(r.endCp).toBe(38); // 38 = après « dort. » — aucun synthétique à étendre
    expect(m.text.slice(cpToUtf16(m.text, r.startCp), cpToUtf16(m.text, r.endCp))).toContain('\n');
  });

  it('hors document → null', () => {
    const m = buildArticleText(twoParasDoc);
    expect(canonicalToDisplayCpRange(m, 500, 510)).toBeNull();
  });
});

describe('displayRangeToCanonical — sélection native vers ancres', () => {
  it('sélection mot simple (UTF-16) → ancre canonique exacte', () => {
    const m = buildArticleText(twoParasDoc);
    // « souris. » = canonique [17,24) — display identique (UTF-16 1:1 ici).
    const r = displayRangeToCanonical(m, 17, 24);
    expect(r).toEqual({ start: 17, end: 24 });
  });

  it('sélection multi-paragraphes → texte canonique + ancre couvrant les 2 blocs', () => {
    const m = buildArticleText(twoParasDoc);
    // Display cp [17,38) = « souris.\nLe chat dort. » → canonique [17,38).
    const utf16Start = cpToUtf16(m.text, 17);
    const utf16End = cpToUtf16(m.text, 38);
    const r = displayRangeToCanonical(m, utf16Start, utf16End)!;
    expect(r.start).toBe(17);
    expect(r.end).toBe(38);
    expect(canonicalSlice(m, r.start, r.end)).toBe('souris. Le chat dort.');
  });

  it('ignore les débordements d’espace aux extrémités', () => {
    const m = buildArticleText(twoParasDoc);
    // Sélection native qui déborde : démarre sur l'espace canonique (24) et
    // s'arrête après « dort. » + un espace fantôme.
    const r = displayRangeToCanonical(m, 24, 39);
    expect(r).toEqual({ start: 25, end: 38 });
  });

  it('sélection d’un simple retour (synthétique) → null', () => {
    const m = buildArticleText(twoParasDoc);
    const nl = m.text.indexOf('\n');
    expect(displayRangeToCanonical(m, nl, nl + 1)).toBeNull();
  });

  it('émoticône : ancre en code points, pas en UTF-16', () => {
    const m = buildArticleText(emojiDoc);
    // Sélection native de « salut » : UTF-16 [3,8) (👋 occupe 0–1, ' ' 2).
    const r = displayRangeToCanonical(m, 3, 8)!;
    expect(r.start).toBe(2); // 2 = code point de « s »
    expect(r.end).toBe(7);
  });
});

describe('nativeSelectionToInfo — contrat SelectionInfo (popover/API)', () => {
  it('produit texte + ordinal + ancre d’une sélection mot', () => {
    const m = buildArticleText(twoParasDoc);
    const info = nativeSelectionToInfo(m, 25, 32); // « Le chat » (2e par.)
    expect(info).toEqual({
      text: 'Le chat',
      index: 1, // 2e occurrence (la 1re est dans le 1er paragraphe)
      canonicalStart: 25,
      canonicalEnd: 32,
    });
  });

  it('sélection multi-paragraphes → texte canonique, ordinal 0', () => {
    const m = buildArticleText(twoParasDoc);
    const info = nativeSelectionToInfo(m, cpToUtf16(m.text, 17), cpToUtf16(m.text, 38))!;
    expect(info.text).toBe('souris. Le chat dort.');
    expect(info.index).toBe(0);
    expect(info.canonicalStart).toBe(17);
    expect(info.canonicalEnd).toBe(38);
  });

  it('texte dupliqué → ordinal correct (sémantique CountBefore)', () => {
    const m = buildArticleText(twoParasDoc);
    // « Le chat » 2e occurrence : 1 occurrence strictement avant → index 1.
    const dup = nativeSelectionToInfo(m, 25, 32)!;
    expect(dup.text).toBe('Le chat');
    expect(dup.index).toBe(1);
  });

  it('désélection (start === end) → null', () => {
    const m = buildArticleText(twoParasDoc);
    expect(nativeSelectionToInfo(m, 5, 5)).toBeNull();
  });
});

describe('nativeSelectionToPopoverInfo — adapter surface morphée (4-c)', () => {
  it('produit le même SelectionInfo que selectionToInfo (from/to vides en natif)', () => {
    const m = buildArticleText(twoParasDoc);
    const info = nativeSelectionToPopoverInfo(m, 25, 32, 123.5)!;
    expect(info).toEqual({
      index: 1,
      text: 'Le chat',
      y: 123.5, // géométrie native (centre de la 1re ligne, dp)
      from: '',
      to: '',
      canonicalStart: 25,
      canonicalEnd: 32,
    });
  });

  it('passe la géométrie native (y) telle quelle — ancrage de la pill', () => {
    const m = buildArticleText(twoParasDoc);
    const info = nativeSelectionToPopoverInfo(m, 3, 7, 42)!;
    expect(info!.y).toBe(42);
    expect(info!.text).toBe('chat');
  });

  it('passe la géométrie horizontale (x) pour l alignement du caret', () => {
    const m = buildArticleText(twoParasDoc);
    const info = nativeSelectionToPopoverInfo(m, 3, 7, 42, 185.5)!;
    expect(info!.y).toBe(42);
    expect(info!.x).toBe(185.5);
    expect(info!.text).toBe('chat');
  });

  it('désélection / sélection synthétique → null (pas de pill)', () => {
    const m = buildArticleText(twoParasDoc);
    expect(nativeSelectionToPopoverInfo(m, 5, 5, 0)).toBeNull();
  });
});

describe('buildNativeMarks / buildDisplayRanges — plages à peindre', () => {
  it('réunit officielles du doc + surlignage ancré + spotlight', () => {
    const m = buildArticleText(twoParasDoc);
    const marks = buildNativeMarks(m, {
      highlights: [
        { text: 'chat', canonicalStart: 3, canonicalEnd: 7, isPublic: true, contentSha: 'abc123' },
      ],
      spotlight: { start: 25, end: 32, sha: 'abc123' },
    });
    expect(marks.map((x) => x.kind).sort()).toEqual(['official', 'public', 'spotlight']);
    const pub = marks.find((x) => x.kind === 'public')!;
    expect(pub).toEqual({ kind: 'public', startCp: 3, endCp: 7 });
  });

  it('ignore les ancres à sha périmé (contenu ré-édité)', () => {
    const m = buildArticleText(twoParasDoc);
    const marks = buildNativeMarks(m, {
      highlights: [{ text: 'chat', canonicalStart: 3, canonicalEnd: 7, contentSha: 'sha-ancien' }],
      spotlight: { start: 25, end: 32, sha: 'sha-ancien' },
    });
    // Seule l'officielle du document (sans sha) reste.
    expect(marks.map((x) => x.kind)).toEqual(['official']);
  });

  it('ignore les surlignages sans ancres (repli hérité — pas peint par offsets)', () => {
    const m = buildArticleText(twoParasDoc);
    const marks = buildNativeMarks(m, { highlights: [{ text: 'chat', quoteOrdinal: 0 }] });
    expect(marks.map((x) => x.kind)).toEqual(['official']);
  });

  it('marque multi-paragraphes → plage UTF-16 continue', () => {
    const m = buildArticleText(twoParasDoc);
    const ranges = buildDisplayRanges(m, {
      highlights: [{ canonicalStart: 17, canonicalEnd: 38, isPublic: true, contentSha: 'abc123' }],
    });
    const r = ranges.find((x) => x.kind === 'public')!;
    expect(m.text.slice(r.start, r.end)).toBe('souris. Le chat dort.'.replace(' ', '\n'));
    expect(r.start).toBe(17);
    expect(r.end).toBe(38);
  });

  it('émoticône : plage UTF-16 correcte pour une marque après 👋', () => {
    const m = buildArticleText(emojiDoc);
    // « salut » = canonique [2,7) — l'espace après 👋 n'est pas couvert.
    const ranges = buildDisplayRanges(m, {
      highlights: [{ canonicalStart: 2, canonicalEnd: 7, isOfficial: true, contentSha: 'e' }],
    });
    const r = ranges.find((x) => x.kind === 'official')!;
    expect(r.start).toBe(3); // après 👋 (0–1) + espace (2)
    expect(r.end).toBe(8);
    expect(m.text.slice(r.start, r.end)).toBe('salut');
  });
});
