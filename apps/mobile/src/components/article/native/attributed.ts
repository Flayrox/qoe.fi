// =====================================================================
// 🎨 attributed.ts — Attributs de peinture partagés iOS ↔ Android (4-b)
// =====================================================================
// À partir du modèle continu C1 (article-text.ts), construit les DEUX
// formes que les moteurs natifs consomment, calculées par le MÊME code
// pur (parité iOS ↔ Android par construction, tests sans device) :
//
//   1. buildPaintSpans — découpe le texte plat en runs homogènes
//      (gras/italique/souligné/mono/lien + fond ARGB unique), en offsets
//      UTF-16 prêts pour NSAttributedString / Spannable. Les marques sont
//      fondues DANS le run (un seul fond par caractère — priorité = ordre
//      de la liste fournie) : aucun « trou » ni double-peinture, et une
//      marque qui recouvre du gras/italique reste une bande continue.
//      C'est la généralisation du découpage ad-hoc du spike iOS (C2),
//      étendue à code/lien et aux marques colorées.
//
//   2. buildParagraphLayouts — décrit chaque paragraphe du texte plat en
//      offsets UTF-16, avec son type de bloc (h1..h4, blockquote, code,
//      liste…) et le texte du marqueur pour les items de liste. Le rendu
//      natif applique les styles de bloc (taille de titre, filet de
//      citation, fond monospace, retrait suspendu de liste) à ces plages —
//      étendues à travers les synthétiques de fin (le '\n') pour que les
//      spans de paragraphe Android couvrent la ligne entière.
// =====================================================================

import {
  canonicalAt,
  cpToUtf16,
  cpLength,
  type ArticleTextModel,
  type NativeInlineStyle,
  type NativeParagraph,
} from './article-text';

// ─────────────────────────────────────────────────────────────────────
// 1. Runs de peinture homogènes (attributs + fond par caractère)
// ─────────────────────────────────────────────────────────────────────

/** Marque déjà résolue en couleur ARGB (sortie de buildNativeMarks + map). */
export interface ColoredMark {
  startCp: number;
  endCp: number;
  color: number;
}

/** Un run homogène du texte plat, en offsets UTF-16. */
export interface PaintSpan {
  start: number;
  end: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  mono: boolean;
  link: boolean;
  /** Couleur ARGB du fond, ou null si pas de marque. */
  bg: number | null;
}

/**
 * Découpe le texte plat en runs homogènes (styles inline + marques).
 * `marks` doit être ordonné par priorité (en cas de chevauchement, la
 * dernière marque couvre). Retourne les plages en UTF-16.
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
      for (let cp = r.startCp; cp < r.endCp && cp < n; cp++) attrs[cp][attr] = true;
    }
  };
  paintAttr('bold', 'bold');
  paintAttr('italic', 'italic');
  paintAttr('underline', 'underline');
  paintAttr('code', 'mono');
  paintAttr('link', 'link');
  // bullet/number : rendus par le layout de paragraphe (marqueur).

  for (const m of marks) {
    for (let cp = m.startCp; cp < m.endCp && cp < n; cp++) attrs[cp].bg = m.color;
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

// ─────────────────────────────────────────────────────────────────────
// 2. Layout des paragraphes (styles de bloc), en UTF-16
// ─────────────────────────────────────────────────────────────────────

export interface ParagraphLayout {
  /** [start,end) UTF-16 — end étendu à travers les synthétiques de fin. */
  start: number;
  end: number;
  kind: NativeParagraph['kind'];
  listItem?: boolean;
  orderedIndex?: number;
  /** Item de liste : texte du marqueur (« •  », « 3. ») — pour la mesure
   *  du retrait suspendu côté natif. */
  markerText?: string;
}

/**
 * Décrit chaque paragraphe du texte plat. La fin est étendue à travers les
 * caractères synthétiques qui suivent le dernier caractère réel (le '\n'
 * de séparation) : les spans de paragraphe Android (quote/indent/mono)
 * doivent couvrir la ligne entière jusqu'au saut inclus.
 */
export function buildParagraphLayouts(model: ArticleTextModel): ParagraphLayout[] {
  const out: ParagraphLayout[] = [];
  for (const p of model.paragraphs) {
    // Début du premier caractère réel (après le marqueur de liste).
    let realStart = p.startCp;
    while (realStart < p.endCp && canonicalAt(model, realStart) === -1) realStart++;

    // Fin étendue à travers les synthétiques de fin.
    let end = p.endCp;
    while (end < model.canonicalCp.length && canonicalAt(model, end) === -1) end++;

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

/** Couleurs ARGB des classes de marques (défaut spike — le rendu réel
 *  branchera la palette du thème en 3-c/4-c). */
export const MARK_ARGB: Record<string, number> = {
  official: 0x66facc15, // ambre (0x66 ≈ 40 %)
  public: 0x4d3b82f6, // bleu (0x4D ≈ 30 %)
  private: 0x40f59e0b, // ambre doux (0x40 ≈ 25 %)
  spotlight: 0x6610b981, // émeraude (0x66 ≈ 40 %)
};
