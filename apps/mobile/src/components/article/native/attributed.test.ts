import { describe, expect, it } from 'vitest';

import { buildArticleText, cpLength } from './article-text';
import { buildParagraphLayouts, buildPaintSpans, MARK_ARGB } from './attributed';
import { DEMO_DOC, DEMO_PRIVATE_HIGHLIGHT, DEMO_PUBLIC_HIGHLIGHT } from './demo-doc';
import { buildNativeMarks } from './marks';

// ─────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────

const model = buildArticleText(DEMO_DOC);

/** Marques du témoin (officielles du doc + public + private) → ARGB. */
function marksOf(extra: Parameters<typeof buildNativeMarks>[1] = {}) {
  return buildNativeMarks(model, {
    highlights: [DEMO_PUBLIC_HIGHLIGHT, DEMO_PRIVATE_HIGHLIGHT],
    ...extra,
  }).map((m) => ({ startCp: m.startCp, endCp: m.endCp, color: MARK_ARGB[m.kind] ?? 0 }));
}

describe('DEMO_DOC — intégrité de la fixture témoin', () => {
  it('texte canonique = fenêtres jointes par un espace, offsets cohérents', () => {
    // 8 blocs dont 2 listes (2 + 3 items) = 6 blocs texte + 5 items = 11 fenêtres.
    expect(DEMO_DOC.segments).toHaveLength(11);
    let from = 0;
    for (const s of DEMO_DOC.segments) {
      expect(s.text).toBe(DEMO_DOC.text.slice(from, from + cpLength(s.text)));
      expect(s.start).toBe(from);
      expect(s.end).toBe(from + cpLength(s.text));
      from = s.end + 1; // + l'espace inter-fenêtre
    }
    // Les ancres de démo tombent dans le texte canonique.
    expect(
      DEMO_DOC.text.slice(DEMO_PUBLIC_HIGHLIGHT.canonicalStart, DEMO_PUBLIC_HIGHLIGHT.canonicalEnd)
    ).toBe(DEMO_PUBLIC_HIGHLIGHT.text);
  });

  it('buildArticleText : ordre des paragraphes = ordre des blocs texte', () => {
    const m = buildArticleText(DEMO_DOC);
    expect(m.paragraphs.map((p) => p.kind)).toEqual([
      'h2',
      'p',
      'blockquote',
      'list',
      'list',
      'list',
      'list',
      'list',
      'p',
      'code',
      'p',
    ]);
    const lists = m.paragraphs.filter((p) => p.kind === 'list');
    expect(lists.map((p) => p.orderedIndex)).toEqual([undefined, undefined, 1, 2, 3]);
    expect(m.officialMarks).toHaveLength(2); // p1 + dernier p
  });
});

describe('buildPaintSpans — découpe homogène en UTF-16', () => {
  it('couvre tout le texte plat, sans trou ni chevauchement', () => {
    const spans = buildPaintSpans(model, marksOf());
    const joined = spans.map((s) => model.text.slice(s.start, s.end)).join('');
    expect(joined).toBe(model.text);
    for (let i = 1; i < spans.length; i++) {
      expect(spans[i].start).toBe(spans[i - 1].end);
    }
  });

  it('applique gras/italique/lien/code aux bons mots', () => {
    const spans = buildPaintSpans(model);
    const bold = spans.filter((s) => s.bold).map((s) => model.text.slice(s.start, s.end));
    // « cris des marchands » (p1) + « trois coups » (item 3 de l'ol).
    expect(bold).toContain('cris des marchands');
    expect(bold).toContain('trois coups');
    expect(bold).toContain('clé ouvre la porte du grenier');
    const link = spans.filter((s) => s.link).map((s) => model.text.slice(s.start, s.end));
    expect(link).toEqual(['cathédrale']);
    const mono = spans.filter((s) => s.mono).map((s) => model.text.slice(s.start, s.end));
    expect(mono).toEqual(['const ouvrir = () => clé;']);
  });

  it('les marques (officiel + public + private) deviennent des fonds continus', () => {
    const spans = buildPaintSpans(model, marksOf());
    const bg = spans.filter((s) => s.bg !== null);
    // Officielles : « marchands couvraient » (p1) + « porte du grenier » (p7).
    // Public : « la place grouillait déjà » (p1). Private : p7 chevauche
    // l'officielle — la dernière couleur l'emporte, un seul fond par char.
    const painted = bg.map((s) => model.text.slice(s.start, s.end)).join('');
    expect(painted).toContain('la place grouillait déjà');
    expect(painted).toContain('marchands couvraient');
    expect(painted).toContain('porte du grenier');
    // Aucun double fond sur un même caractère : les runs bg sont disjoints.
    for (let i = 1; i < bg.length; i++) {
      expect(bg[i].start).toBeGreaterThanOrEqual(bg[i - 1].end);
    }
  });

  it('une marque qui traverse gras → reste une bande continue sans trou', () => {
    // « cris des marchands » est en gras ET porte la marque officielle
    // « marchands couvraient » : le run gras∩marque porte les deux.
    const spans = buildPaintSpans(model, marksOf());
    const boldBg = spans.filter((s) => s.bold && s.bg !== null);
    expect(boldBg.length).toBeGreaterThan(0);
    // Au moins un run gras∩marque porte « marchands » (officiel p1) ; les
    // autres portent le gras du dernier paragraphe sous sa marque.
    expect(boldBg.some((s) => model.text.slice(s.start, s.end).includes('marchands'))).toBe(true);
  });
});

describe('buildParagraphLayouts — styles de bloc en UTF-16', () => {
  it('étend la fin de chaque paragraphe à travers le \\n synthétique', () => {
    const layouts = buildParagraphLayouts(model);
    expect(layouts).toHaveLength(11);
    expect(layouts.map((l) => l.kind)).toEqual([
      'h2',
      'p',
      'blockquote',
      'list',
      'list',
      'list',
      'list',
      'list',
      'p',
      'code',
      'p',
    ]);
    // Le h2 est suivi d'un '\n' : son end tombe après ce saut.
    expect(model.text[layouts[0].end - 1]).toBe('\n');
    // Le dernier paragraphe (index 10) n'a pas de synthétique de fin → end = texte.
    expect(layouts[10].end).toBe(model.text.length);
  });

  it('donne le marqueur exact des items de liste (retrait suspendu)', () => {
    const layouts = buildParagraphLayouts(model);
    const lists = layouts.filter((l) => l.listItem);
    expect(lists).toHaveLength(5);
    expect(lists.map((l) => l.markerText)).toEqual(['•  ', '•  ', '1. ', '2. ', '3. ']);
    expect(lists.map((l) => l.orderedIndex)).toEqual([undefined, undefined, 1, 2, 3]);
  });

  it('plages UTF-16 sûres pour les caractères BMP du témoin', () => {
    const layouts = buildParagraphLayouts(model);
    for (const l of layouts) {
      expect(l.start).toBeGreaterThanOrEqual(0);
      expect(l.end).toBeLessThanOrEqual(model.text.length);
      expect(l.end).toBeGreaterThan(l.start);
    }
  });
});
