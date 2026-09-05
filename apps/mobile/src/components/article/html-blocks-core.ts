// =====================================================================
// 🧬 html-blocks-core.ts — Moteur de sélection mot-à-mot (PUR, sans RN)
// =====================================================================
// Logique pure du rendu/sélection d'article : parsing HTML → blocs →
// tokens mesurables, mapping display↔raw (blancs réduits à l'affichage,
// préservés pour l'ancrage), calcul de `quoteOrdinal`, localisation des
// occurrences pour le <mark> inline. Aucune dépendance React Native :
// testable en `node` (vitest), réutilisable.
//
// Le composant (html-blocks.tsx) mesure les tokens via onLayout et
// consomme ce module pour le reste.
//
// Tranche 1-d : quand le DOCUMENT CANONIQUE (GET /v1/articles/{id}/document)
// est fourni, les blocs viennent du serveur (canonicalDocumentToBlocks) et
// les surlignages sont peints PAR OFFSETS (canonicalStart/canonicalEnd dans
// document.text, fenêtres par segment) — plus aucune recherche de texte.
// =====================================================================

import type { CanonicalDocument } from '@qoe/sdk/mobile';

/** Bloc typographique (sortie du mini-parseur HTML ou du doc canonique). */
export type Block =
  | { type: 'p'; text: string }
  | { type: 'h1' | 'h2' | 'h3' | 'h4'; text: string }
  | { type: 'ul' | 'ol'; items: string[] }
  | { type: 'blockquote'; text: string }
  | { type: 'img'; src: string; alt?: string }
  | { type: 'hr' }
  | { type: 'code'; text: string };

/** Passage sélectionné (long-press + drag) → popover. */
export interface SelectionInfo {
  /** Occurrence (0-based) du passage dans l'article — `quoteOrdinal` API. */
  index: number;
  /** Texte BRUT du passage (blancs originaux préservés). */
  text: string;
  /** Position Y du début du passage (relative au conteneur d'article). */
  y: number;
  /** Position X (horizontale) du centre du passage pour aligner la flèche (caret). */
  x?: number;
  /** Bornes token de la sélection (peinture inline pendant le popover). */
  from: string;
  to: string;
  /**
   * Ancre canonique du passage (tranche 1-d) : offsets [start,end) en code
   * points dans document.text — seulement quand le document canonique est
   * chargé. Base des deep-links au passage exact (tranche 6).
   */
  canonicalStart?: number;
  canonicalEnd?: number;
}

// Décodage des entités HTML courantes.
function decodeEntities(input: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&nbsp;': ' ',
    '&apos;': "'",
    '&eacute;': 'é',
    '&egrave;': 'è',
    '&agrave;': 'à',
    '&ccedil;': 'ç',
    '&ucirc;': 'û',
    '&ocirc;': 'ô',
    '&ecirc;': 'ê',
    '&icirc;': 'î',
    '&acirc;': 'â',
    '&laquo;': '«',
    '&raquo;': '»',
    '&mdash;': '—',
    '&rsquo;': '’',
    '&lsquo;': '‘',
    '&ldquo;': '“',
    '&rdquo;': '”',
  };
  return input.replace(/&[a-zA-Z0-9#]+;/g, (m) => entities[m] ?? m);
}

// Retire les balises mais préserve le texte (et les sauts pour <br>).
function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

/**
 * Convertit un fragment HTML en blocs typographiques.
 * Approche pragmatique : on découpe par balises de bloc connues, puis on
 * traite les listes et le contenu restant ligne par ligne.
 */

/**
 * Tranche 1-d — blocs depuis le DOCUMENT CANONIQUE serveur : le rendu ne
 * re-parse plus le HTML côté client. Les textes sont déjà normalisés
 * (blancs réduits, entités décodées) → `normalizeDisplay` devient l'identité
 * et les offsets canoniques des segments tombent sur les tokens.
 */
export function canonicalDocumentToBlocks(doc: CanonicalDocument): Block[] {
  return doc.blocks.map((b) => {
    switch (b.kind) {
      case 'p':
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
        return { type: b.kind, text: b.text ?? '' };
      case 'blockquote':
        return { type: 'blockquote', text: b.text ?? '' };
      case 'code':
        return { type: 'code', text: b.text ?? '' };
      case 'list':
        return {
          type: b.ordered ? 'ol' : 'ul',
          items: (b.items ?? []).map((i) => i.text),
        };
      case 'img':
        return { type: 'img', src: b.src ?? '', alt: b.alt };
      case 'hr':
        return { type: 'hr' };
      default:
        return { type: 'p', text: b.text ?? '' };
    }
  });
}
export function htmlToBlocks(html: string): Block[] {
  const blocks: Block[] = [];

  // Extraction des <img> d'abord (avec leur alt).
  const imgRegex = /<img[^>]*src=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  const images: { src: string; alt?: string }[] = [];
  while ((match = imgRegex.exec(html)) !== null) {
    const altMatch = /alt=["']([^"']*)["']/i.exec(match[0]);
    images.push({ src: match[1], alt: altMatch?.[1] });
  }

  // Découpe en segments de niveau bloc.
  // ⚠️ Groupe NON capturant : sinon `split` renverrait les noms de balises
  //    eux-mêmes comme segments (junk « p », « ul » rendus en paragraphes).
  const segments = html.split(/<(?:p|h[1-6]|ul|ol|blockquote|hr|pre|div)[^>]*>/i);

  for (const segment of segments) {
    const s = segment.trim();
    if (!s) continue;

    // Liste : chaque <li> devient un item.
    if (/^<li[\s>]/i.test(s)) {
      const items = Array.from(s.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)).map((m) =>
        stripTags(m[1])
      );
      const ordered = /^<ol[\s>]/i.test(s);
      if (items.length) blocks.push({ type: ordered ? 'ol' : 'ul', items });
      continue;
    }
    // Séparateur horizontal.
    if (/^<hr[\s>]/i.test(s)) {
      blocks.push({ type: 'hr' });
      continue;
    }
    // Code préformaté.
    if (/^<pre[\s>]/i.test(s)) {
      blocks.push({ type: 'code', text: stripTags(s) });
      continue;
    }
    // Bloc de citation.
    if (/^<blockquote[\s>]/i.test(s)) {
      blocks.push({ type: 'blockquote', text: stripTags(s) });
      continue;
    }
    // Titres.
    const heading = /^<h([1-6])[\s>]/i.exec(s);
    if (heading) {
      const level = Math.min(4, Math.max(1, Number(heading[1]))) as 1 | 2 | 3 | 4;
      const blockType = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4';
      blocks.push({ type: blockType, text: stripTags(s) });
      continue;
    }

    // Paragraphe / div : on découpe les lignes vides.
    const text = stripTags(s);
    if (!text) continue;
    for (const paragraph of text.split(/\n{2,}/)) {
      if (paragraph.trim()) blocks.push({ type: 'p', text: paragraph.trim() });
    }
  }

  // Fallback : si aucun bloc (HTML sans balises de bloc), on ajoute les images
  // extraites + le texte brut restant.
  if (blocks.length === 0) {
    for (const img of images) blocks.push({ type: 'img', ...img });
    const plain = stripTags(html);
    if (plain) blocks.push({ type: 'p', text: plain });
  }
  return blocks;
}

/** Texte brut d'un bloc si c'est un bloc de texte (sinon null). */
export function blockText(block: Block): string | null {
  switch (block.type) {
    case 'p':
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'blockquote':
    case 'code':
      return block.text || null;
    case 'ul':
    case 'ol':
      return block.items.filter(Boolean).join(' ') || null;
    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────────────
// ✍️ Index de sélection — tokens (mots) + mapping display↔raw
// ─────────────────────────────────────────────────────────────────────

/** Réctangle (coordonnées du conteneur d'article). */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Un « mot » mesurable du texte affiché. */
export interface Token {
  id: string; // `${blockIdx}:${itemIdx}:${tokIdx}`
  blockIdx: number;
  itemIdx: number;
  tokIdx: number;
  /** Texte affiché du mot (sans blancs). */
  text: string;
  /** Offsets [start, end) dans `display` du segment. */
  start: number;
  end: number;
}

/**
 * Segment de texte : une unité rendue comme un seul flux de mots.
 * (paragraphe/titre/citation/code = 1 segment ; chaque <li> = 1 segment)
 */
export interface SegmentInfo {
  blockIdx: number;
  itemIdx: number;
  flowId: string; // `${blockIdx}:${itemIdx}`
  /** Texte BRUT (blancs nouveaux/espaces multiples préservés). */
  raw: string;
  /** Texte affiché : blancs réduits à un espace simple, bordures trimées. */
  display: string;
  /** display[i] → index du premier caractère brut consommé. */
  toRaw: number[];
  tokens: Token[];
}

/**
 * Normalise un texte brut pour l'affichage : les runs de blancs
 * (espaces, tabulations, sauts de ligne) deviennent un espace simple,
 * les bordures sont trimées. `toRaw` permet de re-projeter n'importe
 * quelle position affichée vers le texte brut d'origine (ancrage exact).
 */
export function normalizeDisplay(raw: string): { text: string; toRaw: number[] } {
  const chars: string[] = [];
  const toRaw: number[] = [];
  let prevSpace = true; // → trim des blancs de tête
  for (let i = 0; i < raw.length; i++) {
    if (/\s/.test(raw[i])) {
      if (prevSpace) continue;
      prevSpace = true;
      chars.push(' ');
      toRaw.push(i);
    } else {
      prevSpace = false;
      chars.push(raw[i]);
      toRaw.push(i);
    }
  }
  if (chars[chars.length - 1] === ' ') {
    // → trim du blanc de queue
    chars.pop();
    toRaw.pop();
  }
  return { text: chars.join(''), toRaw };
}

/** Découpe le texte affiché en tokens (mots). */
export function tokenizeDisplay(display: string, blockIdx: number, itemIdx: number): Token[] {
  const tokens: Token[] = [];
  const re = /[^\s]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(display))) {
    tokens.push({
      id: `${blockIdx}:${itemIdx}:${tokens.length}`,
      blockIdx,
      itemIdx,
      tokIdx: tokens.length,
      text: m[0],
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  return tokens;
}

/** Construit l'index de sélection de tous les segments de texte d'un article. */
export function buildBlockIndex(blocks: Block[]): SegmentInfo[] {
  const index: SegmentInfo[] = [];
  blocks.forEach((block, blockIdx) => {
    let sources: string[] = [];
    switch (block.type) {
      case 'ul':
      case 'ol':
        sources = block.items;
        break;
      case 'img':
      case 'hr':
        break;
      default:
        sources = [block.text];
    }
    sources.forEach((raw, itemIdx) => {
      const { text, toRaw } = normalizeDisplay(raw);
      if (!text) return;
      index.push({
        blockIdx,
        itemIdx,
        flowId: `${blockIdx}:${itemIdx}`,
        raw,
        display: text,
        toRaw,
        tokens: tokenizeDisplay(text, blockIdx, itemIdx),
      });
    });
  });
  return index;
}

/** Position d'un token (ordre document, comparable par tuple). */
function tokenPos(t: Token) {
  return [t.blockIdx, t.itemIdx, t.tokIdx];
}

function posLess(a: Token, b: Token): boolean {
  const pa = tokenPos(a);
  const pb = tokenPos(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i];
  }
  return false;
}

/** Occurrence trouvée d'un texte cité dans l'index (offsets AFFICHAGE). */
export interface Occurrence {
  segment: SegmentInfo;
  start: number;
  end: number;
}

/**
 * Localise l'occurrence n° `ordinal` (0-based) de `target` parmi tous les
 * segments, dans l'ordre du document (même sémantique que le walker DOM du
 * web, mais sur le texte NORMALISÉ — les blancs HTML se réduisent pareil).
 *
 * Deux passes : d'abord le texte affiché (blancs → espace simple, comme le
 * web ; c'est lui que le moteur web stocke), puis repli sur le texte brut
 * exact (les sélections faites sur mobile préservent les blancs d'origine).
 * Repli sur la première occurrence si l'ordinal dépasse le nombre trouvé
 * (contenu édité entre-temps).
 */
export function findOccurrence(
  index: SegmentInfo[],
  target: string,
  ordinal = 0
): Occurrence | null {
  const normalized = target.replace(/\s+/g, ' ').trim();
  if (!normalized || index.length === 0) return null;
  const wanted = Math.max(0, Math.floor(ordinal));

  const scan = (needle: string): Occurrence | null => {
    let remain = wanted;
    let first: Occurrence | null = null;
    for (const segment of index) {
      let from = 0;
      for (;;) {
        const i = segment.display.indexOf(needle, from);
        if (i === -1) break;
        if (!first) first = { segment, start: i, end: i + needle.length };
        if (remain === 0) return { segment, start: i, end: i + needle.length };
        remain--;
        from = i + needle.length;
      }
    }
    return first;
  };

  const displayHit = scan(normalized);
  if (displayHit) return displayHit;
  const raw = target.trim();
  if (raw !== normalized) return scanInRaw(index, raw, wanted);
  return null;
}

/** Variante de scan sur le texte brut (blancs d'origine exacts), convertie
 * en offsets AFFICHAGE (le <mark> est peint sur les tokens). */
function scanInRaw(index: SegmentInfo[], needle: string, wanted: number): Occurrence | null {
  let remain = wanted;
  let first: Occurrence | null = null;
  for (const segment of index) {
    const { toRaw } = segment;
    const toDisplay = (rawPos: number): number => {
      for (let j = 0; j < toRaw.length; j++) {
        if (toRaw[j] === rawPos) return j;
      }
      return -1;
    };
    let from = 0;
    for (;;) {
      const i = segment.raw.indexOf(needle, from);
      if (i === -1) break;
      const ds = toDisplay(i);
      const de = toDisplay(i + needle.length - 1);
      if (ds !== -1 && de !== -1) {
        const occ = { segment, start: ds, end: de + 1 };
        if (!first) first = occ;
        if (remain === 0) return occ;
        remain--;
      }
      from = i + needle.length;
    }
  }
  return first;
}

/** Texte brut de base de l'article (segments joints à l'identique des slices). */
export function basisRaw(index: SegmentInfo[]): string {
  return index.map((s) => s.raw).join('\n\n');
}

/** Nombre d'occurrences de `needle` entièrement avant `needleStart` (ordre document). */
export function ordinalAt(basis: string, needle: string, needleStart: number): number {
  if (!needle) return 0;
  let count = 0;
  let from = 0;
  for (;;) {
    const i = basis.indexOf(needle, from);
    if (i === -1 || i >= needleStart) break;
    count++;
    from = i + needle.length;
  }
  return count;
}

/** Texte brut du passage entre deux tokens (bornes incluses, blancs d'origine). */
export function rangeToRawText(index: SegmentInfo[], a: Token, b: Token): string {
  if (posLess(b, a)) [a, b] = [b, a];
  const parts: string[] = [];
  for (const segment of index) {
    const covered = segment.tokens.filter((t) => !posLess(t, a) && !posLess(b, t));
    if (covered.length === 0) continue;
    const first = covered[0];
    const last = covered[covered.length - 1];
    parts.push(segment.raw.slice(segment.toRaw[first.start], segment.toRaw[last.end - 1] + 1));
  }
  return parts.join('\n\n');
}

/** Token le plus proche sous le doigt (rects en coordonnées du conteneur). */
export function hitTestToken(rects: Map<string, Rect>, x: number, y: number): string | null {
  // Les cartes sont itérées dans l'ordre d'insertion ≈ ordre d'affichage :
  // le premier token contenant le point gagne.
  for (const [id, r] of rects) {
    if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) {
      return id;
    }
  }
  return null;
}

/** Regroupe les réctangles mesurés (refs, aucun rendu déclenché). */
export interface RectsBundle {
  blockRects: Map<number, Rect>;
  rowRects: Map<string, Rect>;
  flowRects: Map<string, Rect>;
  tokenRects: Map<string, Rect>;
}

/**
 * Fusionne des rects de tokens en BANDES CONTINUES par ligne : tous les
 * tokens d'une même ligne (même y/hauteur à 2 px près) deviennent un seul
 * rectangle qui couvre l'espace entre le premier et le dernier mot — rendu
 * « sélection native » (point A → point B), au lieu de pastilles disjointes.
 */
export function mergeRectsToBands(rects: Rect[]): Rect[] {
  const bands: Rect[] = [];
  for (const r of rects) {
    const line = bands.find((b) => Math.abs(b.y - r.y) < 2 && Math.abs(b.height - r.height) < 2);
    if (line) {
      const right = Math.max(line.x + line.width, r.x + r.width);
      line.x = Math.min(line.x, r.x);
      line.width = right - line.x;
    } else {
      bands.push({ ...r });
    }
  }
  return bands.sort((a, b) => a.y - b.y || a.x - b.x);
}

/** Réctangle absolu (conteneur d'article) d'un token, si mesuré. */
export function absoluteTokenRect(rects: RectsBundle, id: string): Rect | null {
  const parts = id.split(':').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [b, i] = parts;
  const tr = rects.tokenRects.get(id);
  const fr = rects.flowRects.get(`${b}:${i}`);
  const rr = rects.rowRects.get(`${b}:${i}`);
  const br = rects.blockRects.get(b);
  if (!tr || !fr || !br) return null;
  return {
    x: fr.x + tr.x,
    y: br.y + (rr ? rr.y : 0) + fr.y + tr.y,
    width: tr.width,
    height: tr.height,
  };
}

/**
 * Construit le SelectionInfo complet d'une sélection exprimée en tokens.
 * Avec le document canonique (`document`), l'ordinal est calculé sur le
 * texte canonique du SERVEUR (même sémantique que `CountBefore` Go — la
 * création est alors ancrée exactement) et l'ancre canonique du passage
 * est jointe au résultat (deep-link futur).
 */
export function selectionToInfo(
  index: SegmentInfo[],
  fromId: string,
  toId: string,
  rects: RectsBundle,
  document?: CanonicalDocument | null
): SelectionInfo | null {
  const findToken = (id: string): Token | null => {
    for (const segment of index) {
      for (const t of segment.tokens) {
        if (t.id === id) return t;
      }
    }
    return null;
  };
  const a = findToken(fromId);
  const b = findToken(toId);
  if (!a || !b) return null;

  const [lo, hi] = posLess(b, a) ? [b, a] : [a, b];
  const text = rangeToRawText(index, lo, hi);
  if (!text) return null;

  const ordinal = document
    ? canonicalOrdinal(document, text, lo)
    : ordinalAt(basisRaw(index), text, rawStartOffset(index, lo));

  const ra = absoluteTokenRect(rects, lo.id);
  const rb = absoluteTokenRect(rects, hi.id);
  if (!ra) return null;
  const yCenter =
    Math.min(ra.y, rb ? rb.y : ra.y) + Math.min(ra.height, rb ? rb.height : ra.height) / 2;

  const info: SelectionInfo = { index: ordinal, text, y: yCenter, from: lo.id, to: hi.id };
  if (document) {
    const cs = canonicalTokenOffset(document, lo);
    const ce = canonicalTokenOffset(document, hi, true);
    if (cs !== null && ce !== null && ce > cs) {
      info.canonicalStart = cs;
      info.canonicalEnd = ce;
    }
  }
  return info;
}

/**
 * Ordinal canonique du passage débutant au token `lo` : nombre
 * d'occurrences du texte (normalisé) entièrement avant l'offset canonique
 * du token dans document.text — même sémantique que `CountBefore` Go.
 */
function canonicalOrdinal(doc: CanonicalDocument, text: string, lo: Token): number {
  const start = canonicalTokenOffset(doc, lo);
  if (start === null) return 0;
  const needle = text.replace(/\s+/g, ' ').trim();
  if (!needle) return 0;
  return ordinalAt(doc.text, needle, start);
}

/**
 * Offset canonique (code points dans document.text) d'un token. Les
 * offsets d'affichage des tokens sont UTF-16 ; l'ancre canonique compte
 * les CODE POINTS (sémantique Go RuneLen) — reconversion via le préfixe
 * (sûr pour emoji/surrogates).
 */
function canonicalTokenOffset(doc: CanonicalDocument, t: Token, atEnd = false): number | null {
  const seg = doc.segments.find((s) => s.blockIdx === t.blockIdx && s.itemIdx === t.itemIdx);
  if (!seg) return null;
  const local = atEnd ? t.end : t.start;
  return seg.start + [...seg.text.slice(0, local)].length;
}

/** Offset brut (dans basisRaw) du début du token `a`. */
function rawStartOffset(index: SegmentInfo[], a: Token): number {
  let pos = 0;
  for (const segment of index) {
    if (segment.blockIdx === a.blockIdx && segment.itemIdx === a.itemIdx) {
      return pos + segment.toRaw[a.start];
    }
    pos += segment.raw.length + 2;
  }
  return pos;
}

/** Tokens couverts par une occurrence (offsets AFFICHAGE — pour le <mark>). */
function occurrenceTokenIds(occurrence: Occurrence, inSet: Set<string>): void {
  const { segment, start, end } = occurrence;
  for (const t of segment.tokens) {
    if (t.start < end && t.end > start) inSet.add(t.id);
  }
}

/**
 * Tranche 1-d — tokens couverts par une plage d'offsets CANONIQUES
 * [gs,ge) (code points dans document.text), via les fenêtres par segment
 * du serveur. Aucune recherche de texte : la fenêtre [start,end) de chaque
 * segment intersecte la plage → offsets locaux → tokens (les offsets
 * d'affichage == offsets canoniques, texte déjà normalisé).
 */

/** Index UTF-16 du caractère n° `cp` (code points) dans `text`. */
function utf16IndexAt(text: string, cp: number): number {
  let count = 0;
  for (let i = 0; i < text.length;) {
    if (count === cp) return i;
    count++;
    i += text.codePointAt(i)! > 0xffff ? 2 : 1;
  }
  return text.length;
}
function occurrenceTokenIdsByOffsets(
  index: SegmentInfo[],
  doc: CanonicalDocument,
  gs: number,
  ge: number,
  inSet: Set<string>
): void {
  for (const seg of doc.segments) {
    const start = Math.max(gs, seg.start);
    const end = Math.min(ge, seg.end);
    if (end <= start) continue;
    const target = index.find((s) => s.blockIdx === seg.blockIdx && s.itemIdx === seg.itemIdx);
    if (!target) continue;
    // Les bornes canoniques locales sont en code points ; les tokens sont
    // en UTF-16 (émoticônes) — conversion avant comparaison.
    const ls = utf16IndexAt(seg.text, start - seg.start);
    const le = utf16IndexAt(seg.text, end - seg.start);
    for (const t of target.tokens) {
      if (t.start < le && t.end > ls) inSet.add(t.id);
    }
  }
}

/**
 * Ensemble des tokens à surligner (rendu inline des highlights).
 * Avec le document canonique : peinture PAR OFFSETS (canonicalStart/End)
 * quand les ancres existent — sinon repli sur la recherche de texte
 * (surlignages hérités sans ancres, ou moteur HTML non canonique).
 */
export function computeHighlightTokenSets(
  index: SegmentInfo[],
  highlights: (
    | {
        text?: string | null;
        quoteOrdinal?: number;
        canonicalStart?: number;
        canonicalEnd?: number;
      }
    | null
    | undefined
  )[],
  document?: CanonicalDocument | null
): Set<string> {
  const out = new Set<string>();
  for (const h of highlights ?? []) {
    if (!h) continue;
    if (document && typeof h.canonicalStart === 'number' && typeof h.canonicalEnd === 'number') {
      occurrenceTokenIdsByOffsets(index, document, h.canonicalStart, h.canonicalEnd, out);
      continue;
    }
    if (!h.text) continue;
    const occ = findOccurrence(index, h.text, h.quoteOrdinal ?? 0);
    if (occ) occurrenceTokenIds(occ, out);
  }
  return out;
}

/**
 * Tranche 6-d — tokens du passage à mettre en avant (deep-link citation →
 * article). Peinture PAR OFFSETS, uniquement si l'empreinte du document
 * chargé correspond au passage demandé (un contenu ré-édité ne produit
 * jamais de faux surlignage). Set vide sinon.
 */
export function computeSpotlightTokenSet(
  index: SegmentInfo[],
  document: CanonicalDocument | null | undefined,
  spotlight: { start: number; end: number; sha: string } | null | undefined
): Set<string> {
  const out = new Set<string>();
  if (!document || !spotlight) return out;
  if (spotlight.sha !== document.sha) return out;
  occurrenceTokenIdsByOffsets(index, document, spotlight.start, spotlight.end, out);
  return out;
}
