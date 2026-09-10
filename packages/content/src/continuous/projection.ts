// =====================================================================
// 🧭 continuous/projection.ts — Modèle de texte plat CONTINU d'un article (C1)
// =====================================================================
// Moteur haute performance de projection d'un CanonicalDocument en flux
// continu d'affichage avec table de correspondance bidirectionnelle O(1)
// entre offsets d'affichage et offsets canoniques (code points Unicode).
// =====================================================================

import type { CanonicalDocument } from '../canonical/types';
import { cpLength, cpToUtf16, utf16ToCp } from '../canonical/unicode';
import type {
  ArticleTextModel,
  NativeAttachment,
  NativeInlineRun,
  NativeInlineStyle,
  NativeMark,
  NativeParagraph,
} from './types';

export const ATTACHMENT_CHAR = '\uFFFC'; // Object replacement character

function codePointsOf(text: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length;) {
    const w = (text.codePointAt(i) ?? 0) > 0xffff ? 2 : 1;
    out.push(text.slice(i, i + w));
    i += w;
  }
  return out;
}

/** Aligne une plage UTF-16 [a,b) sur des bornes de code points. */
export function utf16RangeToCpRange(text: string, a: number, b: number): { a: number; b: number } {
  return { a: utf16ToCp(text, a), b: utf16ToCp(text, b) };
}

/**
 * Construit le modèle de texte continu d'un article depuis son document canonique.
 */
export function buildArticleText(doc: CanonicalDocument): ArticleTextModel {
  const textParts: string[] = [];
  const canonicalCp: number[] = [];
  const paragraphs: NativeParagraph[] = [];
  const runs: NativeInlineRun[] = [];
  const attachments: NativeAttachment[] = [];
  const officialMarks: NativeMark[] = [];

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

    if (!textKind && !isList) continue;

    const inlineByItem = (itemIdx: number) => {
      if (isList) return block.items?.[itemIdx]?.inline;
      return block.inline;
    };

    segs.forEach((seg, segIdx) => {
      const itemIdx = seg.itemIdx;
      const segChars = codePointsOf(seg.text);
      if (!segChars.length) return;
      if (segIdx > 0 || textParts.length > 0) pushSynthetic(['\n']);

      const paraStartCp = textParts.length;

      // Préfixe de liste (puce ou numéro)
      if (isList) {
        const ordered = !!block.ordered;
        const markerText = ordered ? `${seg.itemIdx + 1}. ` : '\u2022  ';
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

      // Runs inline
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

      // Spans officiels
      const spans = isList ? [] : (block.spans ?? []);
      for (const sp of spans) {
        if (typeof sp.start !== 'number' || typeof sp.end !== 'number') continue;
        const s = Math.max(0, sp.start);
        const e = Math.min(cpLength(seg.text), sp.end);
        if (e <= s) continue;
        officialMarks.push({
          kind: 'official',
          startCp: textStartCp + s,
          endCp: textStartCp + e,
        });
      }

      closeParagraph(blockIdx, textKind ? block.kind : 'list', paraStartCp, {
        listItem: isList,
        orderedIndex: isList && block.ordered ? seg.itemIdx + 1 : undefined,
      });
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

/**
 * Offset canonique (code point dans doc.text) d'un code point d'affichage `dcp`,
 * ou -1 s'il s'agit d'un caractère synthétique.
 */
export function canonicalAt(model: ArticleTextModel, dcp: number): number {
  if (dcp < 0 || dcp >= model.canonicalCp.length) return -1;
  return model.canonicalCp[dcp];
}

/**
 * Convertit une plage canonique [cs, ce) en plage d'affichage continue [startCp, endCp).
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
  while (last + 1 < model.canonicalCp.length && model.canonicalCp[last + 1] === -1) {
    last++;
  }
  return { startCp: first, endCp: last + 1 };
}

/**
 * Convertit une plage native [a,b) UTF-16 (ex: NSRange iOS ou selection Android)
 * en plage canonique de code points réels couverts.
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

  const docText = model.doc.text;
  const wsAtCp = (cp: number): boolean =>
    /\s/.test(docText.slice(cpToUtf16(docText, cp), cpToUtf16(docText, cp + 1)));

  while (first < last && wsAtCp(first)) first++;
  while (last > first && wsAtCp(last)) last--;
  if (last < first) return null;

  return { start: first, end: last + 1 };
}

/**
 * Découpe sécurisée du texte canonique entre [cs, ce) code points.
 */
export function canonicalSlice(model: ArticleTextModel, cs: number, ce: number): string {
  const t = model.doc.text;
  return t.slice(cpToUtf16(t, cs), cpToUtf16(t, ce));
}
