// =====================================================================
// 🧭 article-text.ts — Modèle de texte plat CONTINU d'un article (C1)
// =====================================================================
// Tranches 3/4 (sélection native iOS/Android) — décision premium actée :
// la sélection traverse TOUT le corps d'un seul geste natif. On construit
// donc UN texte plat continu (affichage) depuis le document canonique,
// avec une table de mapping position d'affichage ↔ offset canonique, et
// les blocs non-texte (img/hr) en MARQUEURS D'ATTACHEMENT inline.
//
// PUR (sans RN) : testable en node, partagé par le rendu iOS et Android.
//
// Sémantique (alignée html-blocks-core / serveur) :
//   - les offsets canoniques sont des CODE POINTS dans document.text ;
//   - le texte d'affichage est une chaîne JS (UTF-16) : les conversions
//     aux frontières natives (NSRange / selection Android = UTF-16) passent
//     par les helpers de ce fichier — jamais dans le stockage ;
//   - les caractères synthétiques (retour de paragraphe, puce/chiffre de
//     liste, marqueur d'attachement) portent le mapping -1 : ils ne font
//     jamais partie d'un texte cité ou d'une ancre.
// =====================================================================

import type { CanonicalDocument } from '@qoe/sdk/mobile';

// ─────────────────────────────────────────────────────────────────────
// Conversions code points ↔ UTF-16 (frontières natives uniquement)
// ─────────────────────────────────────────────────────────────────────

/** Index UTF-16 du code point n° `cp` dans `text` (borne, clampé).
 *  C'est la conversion à appliquer AUX FRONTIÈRES natives (NSRange/
 *  Spannable sont en UTF-16) — jamais ailleurs. */
export function cpToUtf16(text: string, cp: number): number {
  if (cp <= 0) return 0;
  let count = 0;
  for (let i = 0; i < text.length;) {
    if (count === cp) return i;
    count++;
    i += text.codePointAt(i)! > 0xffff ? 2 : 1;
  }
  return text.length;
}

/** Nombre de code points dans `text`. */
export function cpLength(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length;) {
    n++;
    i += text.codePointAt(i)! > 0xffff ? 2 : 1;
  }
  return n;
}

/**
 * Convertit un index UTF-16 `u` en index code point (le code point qui
 * CONTIENT l'unité UTF-16). Si `u` tombe sur une unité basse de surrogate,
 * on recule au début du code point.
 */
export function utf16ToCp(text: string, u: number): number {
  if (u <= 0) return 0;
  let count = 0;
  let i = 0;
  for (; i < text.length;) {
    if (i >= u) return count;
    const w = text.codePointAt(i)! > 0xffff ? 2 : 1;
    // Unité basse de surrogate isolée (u au milieu d'un code point) → on
    // appartient au code point commencé à i.
    if (u < i + w) return count;
    count++;
    i += w;
  }
  return count;
}

/** Aligne une plage UTF-16 [a,b) sur des bornes de code points. */
export function utf16RangeToCpRange(text: string, a: number, b: number): { a: number; b: number } {
  return { a: utf16ToCp(text, a), b: utf16ToCp(text, b) };
}

// ─────────────────────────────────────────────────────────────────────
// Types du modèle
// ─────────────────────────────────────────────────────────────────────

/** Style inline natif (décalqué de CanonicalInlineSpan, coordonnées CP). */
export type NativeInlineStyle =
  'bold' | 'italic' | 'underline' | 'code' | 'link' | 'bullet' | 'number';

export interface NativeInlineRun {
  /** [startCp, endCp) — offsets en CODE POINTS du texte d'affichage. */
  startCp: number;
  endCp: number;
  style: NativeInlineStyle;
  href?: string;
  /** Liste ordonnée : numéro affiché du marqueur (1-based). */
  number?: number;
}

/** Région de paragraphe d'un bloc texte (styles de bloc au rendu natif). */
export interface NativeParagraph {
  blockIdx: number;
  kind: 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'blockquote' | 'code' | 'list';
  /** [startCp, endCp) de l'ITEM (liste : un paragraphe par item). */
  startCp: number;
  endCp: number;
  /** Vrai si item de liste — le rendu applique l'indentation. */
  listItem?: boolean;
  /** Liste ordonnée : index 1-based du marqueur. */
  orderedIndex?: number;
}

/** Bloc non-texte rendu en attachment inline dans le flux texte. */
export interface NativeAttachment {
  blockIdx: number;
  kind: 'img' | 'hr';
  /** Code point du marqueur U+FFFC dans le texte d'affichage. */
  cp: number;
  src?: string;
  alt?: string;
}

/** Marque à peindre (classe sémantique web + éventuel spotlight). */
export interface NativeMark {
  kind: 'private' | 'public' | 'official' | 'spotlight';
  /** [startCp, endCp) — offsets en CODE POINTS du texte d'affichage. */
  startCp: number;
  endCp: number;
}

export interface ArticleTextModel {
  doc: CanonicalDocument;
  /** Texte d'affichage continu (chaîne JS = UTF-16). */
  text: string;
  /**
   * Mapping par CODE POINT du texte d'affichage : offset canonique
   * (code point dans doc.text) du caractère, ou -1 si synthétique.
   */
  canonicalCp: number[];
  paragraphs: NativeParagraph[];
  runs: NativeInlineRun[];
  attachments: NativeAttachment[];
  /** Marques officielles du document (spans du créateur), déjà converties. */
  officialMarks: NativeMark[];
}

// ─────────────────────────────────────────────────────────────────────
// Construction
// ─────────────────────────────────────────────────────────────────────

const ATTACHMENT_CHAR = '\uFFFC'; // objet replacement — marqueur d'attachement

function codePointsOf(text: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length;) {
    const w = text.codePointAt(i)! > 0xffff ? 2 : 1;
    out.push(text.slice(i, i + w));
    i += w;
  }
  return out;
}

/**
 * Construit le modèle continu d'un article.
 *
 * Règles d'émission :
 *  1. Les segments texte (doc.segments, ordre canonique) sont émis dans
 *     l'ordre, séparés par '\n' entre items/blocs ;
 *  2. img/hr sont émis comme marqueurs U+FFFC entre les paragraphes voisins
 *     (un '\n' de part et d'autre) ;
 *  3. les items de liste reçoivent un préfixe « puce/chiffre + espace »
 *     (synthétique, mapping -1) ;
 *  4. les runs inline (bold/italic/…) sont convertis en coordonnées CP du
 *     texte d'affichage via la base du bloc/item.
 */
export function buildArticleText(doc: CanonicalDocument): ArticleTextModel {
  const textParts: string[] = [];
  const canonicalCp: number[] = [];
  const paragraphs: NativeParagraph[] = [];
  const runs: NativeInlineRun[] = [];
  const attachments: NativeAttachment[] = [];
  const officialMarks: NativeMark[] = [];

  /** Ajoute un caractère réel à l'affichage (baseCanonicalCp = offset
   *  canonique code point du premier caractère, dans doc.text). */
  const pushReal = (chars: string[], baseCanonicalCp: number) => {
    for (let i = 0; i < chars.length; i++) {
      textParts.push(chars[i]);
      canonicalCp.push(baseCanonicalCp + i);
    }
  };
  const pushSynthetic = (chars: string[]) => {
    for (const c of chars) {
      textParts.push(c);
      canonicalCp.push(-1);
    }
  };
  const closeParagraph = (
    blockIdx: number,
    kind: NativeParagraph['kind'],
    startCp: number,
    opts?: { listItem?: boolean; orderedIndex?: number }
  ) => {
    if (textParts.length - startCp <= 0) return;
    paragraphs.push({
      blockIdx,
      kind,
      startCp,
      endCp: textParts.length,
      ...(opts?.listItem ? { listItem: true } : {}),
      ...(opts?.orderedIndex !== undefined ? { orderedIndex: opts.orderedIndex } : {}),
    });
  };

  // Fenêtre canonique [segEnd) du dernier segment texte émis — pour mapper
  // les '\n' vers les espaces canoniques restants (un seul par défaut).
  for (let blockIdx = 0; blockIdx < doc.blocks.length; blockIdx++) {
    const block = doc.blocks[blockIdx];
    const segs = doc.segments.filter((s) => s.blockIdx === blockIdx);
    const textKind =
      block.kind === 'p' ||
      block.kind === 'h1' ||
      block.kind === 'h2' ||
      block.kind === 'h3' ||
      block.kind === 'h4' ||
      block.kind === 'blockquote' ||
      block.kind === 'code';
    const isList = block.kind === 'list';

    if (block.kind === 'img' || block.kind === 'hr') {
      // Marqueur d'attachement : séparé des paragraphes voisins.
      pushSynthetic(['\n']);
      const markerCp = textParts.length;
      pushSynthetic([ATTACHMENT_CHAR]);
      attachments.push({
        blockIdx,
        kind: block.kind,
        cp: markerCp,
        src: block.src,
        alt: block.alt,
      });
      pushSynthetic(['\n']);
      continue;
    }

    if (!textKind && !isList) continue; // kind inconnu → ignoré

    // Segments texte de CE bloc (p/h : 1 segment itemIdx 0 ; liste : 1 par item).
    const inlineByItem = (itemIdx: number): CanonicalDocument['blocks'][number]['inline'] => {
      if (isList) return block.items?.[itemIdx]?.inline;
      return block.inline;
    };

    segs.forEach((seg, segIdx) => {
      const itemIdx = seg.itemIdx;
      const segChars = codePointsOf(seg.text);
      if (!segChars.length) return;
      if (segIdx > 0 || textParts.length > 0) pushSynthetic(['\n']);

      const paraStartCp = textParts.length;

      // Préfixe de liste (puce/chiffre) — synthétique (jamais cité).
      if (isList) {
        const ordered = !!block.ordered;
        const markerText = ordered ? `${seg.itemIdx + 1}. ` : '\u2022  '; // "1. " / "• "
        const markerChars = codePointsOf(markerText);
        const markerStartCp = textParts.length;
        pushSynthetic(markerChars);
        runs.push({
          startCp: markerStartCp,
          endCp: textParts.length,
          style: ordered ? 'number' : 'bullet',
          ...(ordered ? { number: seg.itemIdx + 1 } : {}),
        });
      }

      const textStartCp = textParts.length;
      pushReal(segChars, seg.start);

      // Runs inline du bloc/item — coordonnées du texte local (code points)
      // → coordonnées CP de l'affichage via la base textStartCp.
      const inline = inlineByItem(itemIdx);
      for (const sp of inline ?? []) {
        if (typeof sp.start !== 'number' || typeof sp.end !== 'number') continue;
        const s = Math.max(0, sp.start);
        const e = Math.min(cpLength(seg.text), sp.end);
        if (e <= s) continue;
        runs.push({
          startCp: textStartCp + s,
          endCp: textStartCp + e,
          style: (sp.style as NativeInlineStyle) ?? 'bold',
          href: sp.href,
        });
      }

      // Spans officiels du créateur (block.spans) — marques du document,
      // converties en coordonnées d'affichage.
      const spans = isList ? [] : (block.spans ?? []);
      for (const sp of spans) {
        if (typeof sp.start !== 'number' || typeof sp.end !== 'number') continue;
        const s = Math.max(0, sp.start);
        const e = Math.min(cpLength(seg.text), sp.end);
        if (e <= s) continue;
        officialMarks.push({ kind: 'official', startCp: textStartCp + s, endCp: textStartCp + e });
      }

      closeParagraph(
        blockIdx,
        textKind ? (block.kind as NativeParagraph['kind']) : 'list',
        paraStartCp,
        {
          listItem: isList,
          orderedIndex: isList && block.ordered ? seg.itemIdx + 1 : undefined,
        }
      );
    });
  }

  return {
    doc,
    text: textParts.join(''),
    canonicalCp,
    paragraphs,
    runs,
    attachments,
    officialMarks,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Helpers de mapping (frontière native = UTF-16)
// ─────────────────────────────────────────────────────────────────────

/**
 * Offset canonique (code point dans doc.text) du code point d'affichage
 * `dcp`, ou -1 si synthétique (retour paragraphe, puce, attachement).
 */
export function canonicalAt(model: ArticleTextModel, dcp: number): number {
  if (dcp < 0 || dcp >= model.canonicalCp.length) return -1;
  return model.canonicalCp[dcp];
}

/**
 * Convertit une plage canonique [cs, ce) (code points dans doc.text) en
 * plage d'affichage CONTINUE en code points du texte plat : tous les
 * caractères réels couverts + les synthétiques situés entre le premier et
 * le dernier (la marque traverse les retours de paragraphe, comme le
 * <mark> web). Étend aussi le dernier synthétique adjacent (espace de fin
 * de paragraphe) pour une bande nette. null si aucun caractère réel couvert.
 */
export function canonicalToDisplayCpRange(
  model: ArticleTextModel,
  cs: number,
  ce: number
): { startCp: number; endCp: number } | null {
  let first = -1;
  let last = -1;
  for (let dcp = 0; dcp < model.canonicalCp.length; dcp++) {
    const c = model.canonicalCp[dcp];
    if (c >= cs && c < ce) {
      if (first === -1) first = dcp;
      last = dcp;
    }
  }
  if (first === -1 || last === -1) return null;
  while (last + 1 < model.canonicalCp.length && model.canonicalCp[last + 1] === -1) last++;
  return { startCp: first, endCp: last + 1 };
}

/**
 * Convertit une plage native [a,b) UTF-16 (NSRange / selection Android) en
 * plage canonique bornant les caractères RÉELS couverts. Retourne null si
 * la plage ne couvre aucun caractère réel (sélection d'un simple retour à
 * la ligne, tap de désélection…).
 */
export function displayRangeToCanonical(
  model: ArticleTextModel,
  a: number,
  b: number
): { start: number; end: number } | null {
  const { a: acp, b: bcp } = utf16RangeToCpRange(model.text, a, b);
  let first = -1;
  let last = -1;
  for (let dcp = acp; dcp < bcp; dcp++) {
    const c = canonicalAt(model, dcp);
    if (c >= 0) {
      if (first === -1) first = c;
      last = c;
    }
  }
  if (first === -1 || last === -1) return null;
  // Même sémantique que la sélection de mots (web/moteur actuel) : les
  // blancs aux extrémités ne font pas partie du passage cité — une
  // sélection native qui déborde d'un espace ne pollue ni le texte ni
  // l'ordinal. (Slice par code point — jamais text[i] en UTF-16, sûr
  // pour les emojis aux bornes.)
  const docText = model.doc.text;
  const wsAtCp = (cp: number): boolean =>
    /\s/.test(docText.slice(cpToUtf16(docText, cp), cpToUtf16(docText, cp + 1)));
  while (first < last && wsAtCp(first)) first++;
  while (last > first && wsAtCp(last)) last--;
  if (last < first) return null;
  return { start: first, end: last + 1 };
}

/** Texte canonique d'une plage canonique (slice sûr code points → UTF-16). */
export function canonicalSlice(model: ArticleTextModel, cs: number, ce: number): string {
  const t = model.doc.text;
  return t.slice(cpToUtf16(t, cs), cpToUtf16(t, ce));
}
