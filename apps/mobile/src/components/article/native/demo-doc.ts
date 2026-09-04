// =====================================================================
// 📄 demo-doc.ts — « Article témoin » partagé iOS ↔ Android (tranches 3/4)
// =====================================================================
// Un document canonique réaliste (multi-blocs, styles inline, spans
// officiels) utilisé par les écrans spike iOS et Android comme référence
// de parité visuelle, et par les tests purs du pipeline natif.
//
// Construction assistée : le texte canonique plat (doc.text = fenêtres
// jointes par UN espace, règle du corpus Go) et les offsets de segments
// sont CALCULÉS ici (jamais écrits à la main) — aucune désynchronisation
// possible entre doc.text, doc.blocks et doc.segments. Les spans inline
// sont ancrés par indexOf sur le texte normalisé de leur bloc (les
// caractères français utilisés sont BMP : index UTF-16 == offset code
// point, sûr).
// =====================================================================

import type {
  CanonicalBlock,
  CanonicalDocument,
  CanonicalInlineSpan,
  CanonicalSpan,
} from '@qoe/sdk/mobile';

const cpLen = (s: string) => [...s].length;

/** Span inline [needle] dans `text` (style C1). nth = occurrence (0-based). */
function spanOf(
  text: string,
  needle: string,
  style: CanonicalInlineSpan['style'],
  nth = 0,
  href?: string
): CanonicalInlineSpan {
  let from = 0;
  let at = -1;
  for (let i = 0; i <= nth; i++) {
    at = text.indexOf(needle, from);
    if (at === -1) throw new Error(`[demo-doc] « ${needle} » introuvable dans « ${text} »`);
    from = at + needle.length;
  }
  return { start: at, end: at + cpLen(needle), style, ...(href ? { href } : {}) };
}

/** Marque officielle (CanonicalSpan) sur [needle] de `text`. */
function noteOf(text: string, needle: string, note: string): CanonicalSpan {
  const sp = spanOf(text, needle, 'bold'); // index seulement
  return { start: sp.start, end: sp.end, note };
}

// ── Contenu (fenêtres canoniques — un bloc texte / un item par fenêtre) ─
const P1 =
  'À midi, la place grouillait déjà. Le marché battait son plein et les cris des marchands couvraient le bourdon de la cathédrale.';
const QUOTE =
  '« La ville se réveille quand le soleil se couche », dit le vieux cafetier en essuyant un verre.';
const UL_ITEMS = ['Une place en pente douce', 'Des ruelles qui sentent le pain chaud'];
const OL_ITEMS = [
  'Monter jusqu’à la fontaine',
  'Tourner à gauche sous la treille',
  'Frapper trois coups à la porte bleue',
];
const P5 =
  'Le gardien connaît la formule par cœur : const ouvrir = () => clé; et personne ne s’en étonne plus.';
const CODE = 'const cléDuSoir = "midi" + "soir";';
const P7 = 'Personne ne sait pourquoi la clé ouvre la porte du grenier, et c’est tant mieux.';

const BLOCKS: CanonicalBlock[] = [
  { kind: 'h2', text: 'Le tour de clé du soir' },
  {
    kind: 'p',
    text: P1,
    inline: [
      spanOf(P1, 'cris des marchands', 'bold'),
      spanOf(P1, 'cathédrale', 'link', 0, 'https://qoe.fi/lexique/cathedrale'),
      spanOf(P1, 'marché battait son plein', 'italic'),
    ],
    spans: [noteOf(P1, 'marchands couvraient', 'Note de l’éditeur — le passage du marché.')],
  },
  { kind: 'blockquote', text: QUOTE },
  {
    kind: 'list',
    ordered: false,
    items: [
      { text: UL_ITEMS[0] },
      { text: UL_ITEMS[1], inline: [spanOf(UL_ITEMS[1], 'pain chaud', 'italic')] },
    ],
  },
  {
    kind: 'list',
    ordered: true,
    items: [
      { text: OL_ITEMS[0] },
      { text: OL_ITEMS[1] },
      { text: OL_ITEMS[2], inline: [spanOf(OL_ITEMS[2], 'trois coups', 'bold')] },
    ],
  },
  {
    kind: 'p',
    text: P5,
    inline: [spanOf(P5, 'const ouvrir = () => clé;', 'code'), spanOf(P5, 'personne', 'italic')],
  },
  { kind: 'code', text: CODE },
  {
    kind: 'p',
    text: P7,
    inline: [spanOf(P7, 'clé ouvre la porte du grenier', 'bold')],
    spans: [noteOf(P7, 'porte du grenier', 'Mystère central.')],
  },
];

/** Assemble doc.text (fenêtres jointes par un espace) + offsets segments. */
function assemble(blocks: CanonicalBlock[]): {
  blocks: CanonicalBlock[];
  segments: CanonicalDocument['segments'];
  text: string;
} {
  const windows: { blockIdx: number; itemIdx: number; text: string }[] = [];
  blocks.forEach((b, blockIdx) => {
    if (b.kind === 'list') {
      (b.items ?? []).forEach((it, itemIdx) => windows.push({ blockIdx, itemIdx, text: it.text }));
    } else if (b.kind !== 'img' && b.kind !== 'hr') {
      windows.push({ blockIdx, itemIdx: 0, text: b.text ?? '' });
    }
  });

  let text = '';
  const segments: CanonicalDocument['segments'] = [];
  for (const w of windows) {
    if (text) text += ' '; // séparateur inter-fenêtres AVANT la fenêtre
    const start = cpLen(text);
    text += w.text;
    segments.push({
      blockIdx: w.blockIdx,
      itemIdx: w.itemIdx,
      text: w.text,
      start,
      end: start + cpLen(w.text),
    });
  }
  return { blocks, segments, text };
}

const { segments, text } = assemble(BLOCKS);

/** Document canonique « article témoin » (sha stable pour les ancres). */
export const DEMO_DOC: CanonicalDocument = {
  sha: 'demo-temoin-1',
  blocks: BLOCKS,
  segments,
  text,
};

/** Phrase surlignée « public » dans le 1er paragraphe (ancre canonique). */
export const DEMO_PUBLIC_HIGHLIGHT = {
  text: 'la place grouillait déjà',
  canonicalStart: text.indexOf('la place grouillait déjà'),
  canonicalEnd: text.indexOf('la place grouillait déjà') + cpLen('la place grouillait déjà'),
  isPublic: true,
  contentSha: DEMO_DOC.sha,
};

/** Phrase surlignée « private » dans le dernier paragraphe. */
export const DEMO_PRIVATE_HIGHLIGHT = {
  text: 'porte du grenier',
  canonicalStart: text.indexOf('porte du grenier'),
  canonicalEnd: text.indexOf('porte du grenier') + cpLen('porte du grenier'),
  isPrivate: true,
  contentSha: DEMO_DOC.sha,
};

/** Passage « deep-link » (spotlight, 4-d) : tout le 5e paragraphe — un
 *  passage du MILIEU du témoin, sans marque existante (bande émeraude
 *  propre), assez bas pour qu'un scroll réel soit nécessaire. */
export const DEMO_SPOTLIGHT = {
  text: P5,
  canonicalStart: text.indexOf(P5),
  canonicalEnd: text.indexOf(P5) + cpLen(P5),
  sha: DEMO_DOC.sha,
};
