import { describe, expect, it } from 'vitest';

import type { CanonicalDocument, CanonicalInlineSpan } from '../canonical/types';
import { computeLocalAnchors, normalizeCanonical } from '../canonical/anchors';
import { buildArticleText } from '../continuous/projection';
import { buildPaintSpans } from '../continuous/attributed';
import { cleanArticleExcerpt } from '../excerpt/clean-excerpt';
import { decodeHtmlEntities } from '../excerpt/html-entities';
import { calculateReadingTimeMinutes } from '../paywall/metrics';

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

function docWithInline(style: string): CanonicalDocument {
  const inline: CanonicalInlineSpan[] = [{ start: 0, end: 2, style }];
  return {
    sha: 'sha-inline',
    text: 'ab',
    blocks: [{ kind: 'p', text: 'ab', inline }],
    segments: [{ blockIdx: 0, itemIdx: 0, text: 'ab', start: 0, end: 2 }],
  };
}

describe('⚓ normalizeCanonical — parité avec canon.Normalize (Go)', () => {
  it('traite U+0085 (NEL) comme un blanc, comme unicode.IsSpace', () => {
    // F150 — `String.prototype.replace`/\s ne connaît pas NEL : le serveur
    // réduisait « a\u0085b » à « a b », le client le laissait intact, donc les
    // offsets d'ancrage divergeaient pour un passage collé depuis un terminal.
    expect(normalizeCanonical('a\u0085b')).toBe('a b');
  });

  it('conserve U+FEFF (BOM), que Go ne considère pas comme un blanc', () => {
    // F150 — `\s` inclut U+FEFF : le client supprimait le BOM d'un passage
    // collé depuis un fichier, le serveur le gardait → ancres décalées.
    expect(normalizeCanonical('a\ufeffb')).toBe('a\ufeffb');
    expect(normalizeCanonical('\ufefftexte')).toBe('\ufefftexte');
  });

  it('continue de réduire les blancs Unicode usuels', () => {
    expect(normalizeCanonical('a\u00a0\u2003b')).toBe('a b');
  });

  it('produit les mêmes ancres que le serveur sur un texte contenant un BOM', () => {
    const doc = { text: 'Début \ufeffmot clé fin' };
    const anchors = computeLocalAnchors(doc, 'mot clé');
    expect(anchors).toEqual({ start: 7, end: 14 });
  });
});

describe('📝 cleanArticleExcerpt — intégrité Unicode', () => {
  it('ne coupe jamais une paire de substitution', () => {
    // F151 — `slice(0, maxLength)` tombait au milieu d’un emoji : le résumé
    // partait en base avec un surrogate isolé (JSON/UTF-8 invalides).
    const excerpt = cleanArticleExcerpt('😀'.repeat(200), 11);
    expect(excerpt).not.toMatch(LONE_SURROGATE);
    expect(excerpt).toBe('😀😀😀😀😀…');
  });
});

describe('🔤 decodeHtmlEntities — entités numériques invalides', () => {
  it('n’injecte pas de NUL pour &#0;', () => {
    // F152 — `String.fromCodePoint(0)` produisait un caractère NUL dans le
    // résumé ; il tronque la chaîne côté Postgres/JSON.
    expect(decodeHtmlEntities('a&#0;b')).toBe('a&#0;b');
    expect(decodeHtmlEntities('&#x0;')).toBe('&#x0;');
  });

  it('refuse les demi-paires de substitution', () => {
    // F152 — `&#xD800;` créait un surrogate isolé, chaîne UTF-16 illégale.
    const decoded = decodeHtmlEntities('&#xD800; et &#xDFFF;');
    expect(decoded).not.toMatch(LONE_SURROGATE);
    expect(decoded).toBe('&#xD800; et &#xDFFF;');
  });
});

describe('🎨 styles inline continus', () => {
  it('peint le barré déclaré par le document canonique', () => {
    // F154 — `strike` traversait un cast `as NativeInlineStyle` et
    // `PaintSpan` n'avait aucun drapeau : le barré disparaissait au rendu.
    const model = buildArticleText(docWithInline('strike'));
    expect(model.runs.map((r) => r.style)).toEqual(['strike']);
    expect(buildPaintSpans(model).some((s) => s.strike)).toBe(true);
  });

  it('traduit l’alias HTML `s` en `strike`', () => {
    const model = buildArticleText(docWithInline('s'));
    expect(model.runs.map((r) => r.style)).toEqual(['strike']);
    expect(buildPaintSpans(model).some((s) => s.strike)).toBe(true);
  });

  it('ignore un style inconnu au lieu de le propager hors du type', () => {
    const model = buildArticleText(docWithInline('sparkles'));
    expect(model.runs).toEqual([]);
  });
});

describe('⏱️ calculateReadingTimeMinutes — option CJK', () => {
  it('honore cjkCpm pour les scripts sans espaces', () => {
    // F153 — l’option documentée (`cjkCpm`, 350 par défaut) était ignorée :
    // 700 idéogrammes comptaient 700 « mots » à 200 wpm, soit le double du
    // temps annoncé par le produit.
    const cjk = '人'.repeat(700);
    expect(calculateReadingTimeMinutes(cjk, { cjkCpm: 350 })).toBe(2);
    expect(calculateReadingTimeMinutes(cjk)).toBe(2);
  });

  it('additionne les portions latine et CJK d’un texte mixte', () => {
    const text = `${Array.from({ length: 200 }, () => 'mot').join(' ')} ${'人'.repeat(350)}`;
    // 200 mots / 200 wpm + 350 idéogrammes / 350 cpm = 2 minutes.
    expect(calculateReadingTimeMinutes(text)).toBe(2);
  });

  it('garde le minimum d’une minute et le zéro sur texte vide', () => {
    expect(calculateReadingTimeMinutes('')).toBe(0);
    expect(calculateReadingTimeMinutes('人工知能')).toBe(1);
  });
});
