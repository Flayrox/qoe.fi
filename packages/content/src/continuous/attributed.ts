// =====================================================================
// 🎨 continuous/attributed.ts — Attributs de peinture & layout de paragraphes
// =====================================================================
// Découpe le flux continu C1 en spans de peinture homogènes (bold, italic,
// underline, mono, link + couleur de fond ARGB) et en structures de layout
// de paragraphe prêtes pour le rendu natif et web.
// =====================================================================

import { cpLength, cpToUtf16 } from '../canonical/unicode';
import { canonicalAt } from './projection';
import type { ArticleTextModel, NativeInlineStyle, NativeParagraph } from './types';

export interface ColoredMark {
  startCp: number;
  endCp: number;
  color: number;
}

export interface PaintSpan {
  start: number;
  end: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  mono: boolean;
  link: boolean;
  bg: number | null;
}

export interface ParagraphLayout {
  start: number;
  end: number;
  kind: NativeParagraph['kind'];
  listItem?: boolean;
  orderedIndex?: number;
  markerText?: string;
}

export const DEFAULT_MARK_ARGB: Record<string, number> = {
  official: 0x66facc15,
  public: 0x4d3b82f6,
  private: 0x40f59e0b,
  spotlight: 0x6610b981,
};

/**
 * Découpe le texte plat en runs de style homogènes (styles inline + fond coloré).
 */
export function buildPaintSpans(model: ArticleTextModel, marks: ColoredMark[] = []): PaintSpan[] {
  const n = cpLength(model.text);
  type Attr = Pick<PaintSpan, 'bold' | 'italic' | 'underline' | 'mono' | 'link'> & {
    bg: number | null;
  };
  const attrs: Attr[] = Array.from({ length: n }, () => ({
    bold: false,
    italic: false,
    underline: false,
    mono: false,
    link: false,
    bg: null,
  }));

  const paintAttr = (
    style: NativeInlineStyle,
    attr: 'bold' | 'italic' | 'underline' | 'mono' | 'link'
  ) => {
    for (const r of model.runs) {
      if (r.style !== style) continue;
      for (let cp = r.startCp; cp < r.endCp && cp < n; cp++) {
        attrs[cp][attr] = true;
      }
    }
  };

  paintAttr('bold', 'bold');
  paintAttr('italic', 'italic');
  paintAttr('underline', 'underline');
  paintAttr('code', 'mono');
  paintAttr('link', 'link');

  for (const m of marks) {
    for (let cp = m.startCp; cp < m.endCp && cp < n; cp++) {
      attrs[cp].bg = m.color;
    }
  }

  const same = (a: Attr, b: Attr) =>
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.mono === b.mono &&
    a.link === b.link &&
    a.bg === b.bg;

  const out: PaintSpan[] = [];
  for (let cp = 0; cp < n;) {
    const a = attrs[cp];
    let j = cp + 1;
    while (j < n && same(attrs[j], a)) j++;
    out.push({
      start: cpToUtf16(model.text, cp),
      end: cpToUtf16(model.text, j),
      bold: a.bold,
      italic: a.italic,
      underline: a.underline,
      mono: a.mono,
      link: a.link,
      bg: a.bg,
    });
    cp = j;
  }
  return out;
}

/**
 * Construit la liste des layouts de paragraphes en coordonnées UTF-16,
 * avec type de bloc et marqueur de liste.
 */
export function buildParagraphLayouts(model: ArticleTextModel): ParagraphLayout[] {
  const out: ParagraphLayout[] = [];
  for (const p of model.paragraphs) {
    let realStart = p.startCp;
    while (realStart < p.endCp && canonicalAt(model, realStart) === -1) {
      realStart++;
    }

    let end = p.endCp;
    while (end < model.canonicalCp.length && canonicalAt(model, end) === -1) {
      end++;
    }

    const layout: ParagraphLayout = {
      start: cpToUtf16(model.text, p.startCp),
      end: cpToUtf16(model.text, end),
      kind: p.kind,
    };
    if (p.listItem) {
      layout.listItem = true;
      if (p.orderedIndex !== undefined) layout.orderedIndex = p.orderedIndex;
      layout.markerText = model.text.slice(
        cpToUtf16(model.text, p.startCp),
        cpToUtf16(model.text, realStart)
      );
    }
    out.push(layout);
  }
  return out;
}
