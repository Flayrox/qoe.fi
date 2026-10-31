// =====================================================================
// 📄 annotation-document — le document canonique du spécimen 17
// =====================================================================
// 📖 Un surlignage ne connaît pas sa position : il porte des OFFSETS dans
//    le texte canonique de l'article (`canonicalStart` / `canonicalEnd`),
//    et le SHA du document qu'il a ancré. C'est le serveur qui les calcule
//    à la création (à partir du texte cité + de son ordinal d'occurrence).
//
// 🎯 Ce fichier rejoue ce calcul en local pour le UI Lab : le spécimen monte
//    le VRAI moteur d'annotation (`TextHighlighter` en mode document), avec
//    de vrais callbacks — mais aucune base de données. Sans builder, il
//    faudrait écrire les offsets à la main : une faute d'un caractère et
//    le spécimen mentirait sur le comportement du produit.
// =====================================================================

import type { AnnotationItem, HighlightItem } from '@qoe/ui/annotations';
import type { CanonicalBlock, CanonicalDocument, CanonicalSegment } from '@qoe/sdk';

/** Ce qui sépare deux segments dans le texte canonique plat. */
const SEGMENT_SEPARATOR = '\n';

/**
 * Construit un document canonique depuis des blocs typographiques.
 * Les fenêtres (`segments`) sont dérivées du texte assemblé : les offsets
 * sont donc cohérents par construction, jamais saisis à la main.
 */
function buildDocument(sha: string, blocks: CanonicalBlock[]): CanonicalDocument {
  const segments: CanonicalSegment[] = [];
  let text = '';

  const push = (blockIdx: number, itemIdx: number, value: string) => {
    if (text.length > 0) text += SEGMENT_SEPARATOR;
    const start = text.length;
    text += value;
    segments.push({ blockIdx, itemIdx, text: value, start, end: text.length });
  };

  blocks.forEach((block, blockIdx) => {
    if (block.kind === 'list') {
      (block.items ?? []).forEach((item, itemIdx) => push(blockIdx, itemIdx, item.text));
      return;
    }
    // Une image ou un filet ne porte pas de texte : pas de segment.
    if (block.kind === 'img' || block.kind === 'hr' || block.text === undefined) return;
    push(blockIdx, 0, block.text);
  });

  return { blocks, segments, text, sha };
}

/**
 * Ancrage serveur : la n-ième occurrence du passage cité dans le texte
 * canonique. `null` si le passage n'y est plus (contenu ré-édité).
 */
export function anchor(
  doc: CanonicalDocument,
  quotedText: string,
  quoteOrdinal = 0
): { start: number; end: number } | null {
  const target = quotedText.trim();
  if (!target) return null;

  let from = 0;
  let seen = 0;
  for (;;) {
    const index = doc.text.indexOf(target, from);
    if (index === -1) return null;
    if (seen === Math.max(0, Math.floor(quoteOrdinal))) {
      return { start: index, end: index + target.length };
    }
    seen += 1;
    from = index + target.length;
  }
}

// ---------------------------------------------------------------------
// L'article du spécimen
// ---------------------------------------------------------------------

export const LAB_DOCUMENT_SHA = 'lab-canonical-v1';

/**
 * Le passage « ce qu’il relirait deux fois » apparaît DEUX fois (1er et
 * dernier paragraphe). C'est volontaire : c'est le cas qui se trompe de
 * position quand l'ordinal d'occurrence est perdu en chemin.
 */
const FIRST_PARAGRAPH =
  'Un écrivain ne devrait publier que ce qu’il relirait deux fois. Je l’ai cru longtemps, puis j’ai compté : je relis surtout les autres, et mes propres doutes restent dans un carnet que je n’ouvre jamais.';

/**
 * Le passage officiel du créateur vit dans le DOCUMENT
 * (`mark data-annotation-note` de l'éditeur → `CanonicalSpan`), pas dans la
 * liste des annotations : c'est ce que le moteur lit pour peindre la marque
 * de l'auteur même quand personne n'a encore voté dessus.
 */
const OFFICIAL_PHRASE = 'je relis surtout les autres';
const OFFICIAL_SPAN_START = FIRST_PARAGRAPH.indexOf(OFFICIAL_PHRASE);

const BLOCKS: CanonicalBlock[] = [
  { kind: 'h2', text: 'La lenteur comme méthode' },
  {
    kind: 'p',
    text: FIRST_PARAGRAPH,
    inline: [{ start: 0, end: 52, style: 'italic' }],
    spans: [{ start: OFFICIAL_SPAN_START, end: OFFICIAL_SPAN_START + OFFICIAL_PHRASE.length }],
  },
  {
    kind: 'p',
    text: 'Il y a une raison simple à cela. Le texte qu’on vient d’écrire est encore trop proche : on ne lit pas ce qui est sur la page, on lit ce qu’on avait en tête. Relire les autres demande moins d’effort, parce qu’on ne sait pas ce qu’ils voulaient dire.',
  },
  {
    kind: 'blockquote',
    text: 'On ne corrige bien que ce qu’on a oublié d’avoir écrit.',
  },
  {
    kind: 'p',
    text: 'Alors j’ai changé de méthode. J’écris le matin, je relis le lendemain, et je ne touche plus à rien entre les deux. Ce n’est pas de la discipline, c’est un délai : la mémoire retombe, et le passage redevient lisible.',
  },
  {
    kind: 'list',
    ordered: true,
    items: [
      { text: 'Écrire sans relire, même quand la phrase déplaît.' },
      { text: 'Laisser passer une nuit entière avant d’ouvrir le fichier.' },
      { text: 'Relire à voix haute ce qui résiste encore.' },
    ],
  },
  {
    kind: 'p',
    text: 'Ce que la lenteur change n’est pas la vitesse à laquelle on écrit, c’est le nombre de phrases qu’on accepte de jeter — et publier seulement ce qu’il relirait deux fois devient alors une contrainte tenable.',
  },
];

export const LAB_DOCUMENT = buildDocument(LAB_DOCUMENT_SHA, BLOCKS);

/** Le passage répété, ancré sur sa 1ʳᵉ occurrence (paragraphe 1). */
export const REPEATED_PASSAGE = 'ce qu’il relirait deux fois';

/** L'ordinal de la seconde occurrence — celui que la barre du produit oubliait. */
const REPEATED_PASSAGE_SECOND = 1;

export const LAB_AUTHOR_ID = 'author-fay';
const LAB_READER_ID = 'reader-lila';

const LAB_AUTHOR = {
  id: LAB_AUTHOR_ID,
  name: 'Fay Moreau',
  username: 'fay',
  logoUrl: null,
  subdomain: 'la-lenteur',
};

export const LAB_READER = {
  id: LAB_READER_ID,
  name: 'Lila',
  username: 'lila',
  logoUrl: null,
  subdomain: null,
};

// Camille tient un média : sa photo est CARRÉE à bords arrondis, pas ronde.
// Le tiroir doit lire `type` — sinon il applique la forme d'une personne
// physique à un compte média (et l'avatar par défaut est le même fichier).
export const LAB_OTHER_READER = {
  id: 'reader-camille',
  name: 'Camille',
  username: 'camille',
  logoUrl: '/avatars/media-camille.svg',
  subdomain: 'camille',
  type: 'MEDIA' as const,
};

/** Le lecteur courant (celui qui voit les boutons modifier / supprimer). */
export const LAB_CURRENT_USER = {
  id: LAB_READER_ID,
  name: 'Lila',
  username: 'lila',
  logoUrl: null,
};

const OFFICIAL_TEXT = OFFICIAL_PHRASE;
const PRIVATE_TEXT = 'On ne corrige bien que ce qu’on a oublié d’avoir écrit.';
/** Un passage marqué SANS note : le cas « surlignage seul », distinct d'une
 *  annotation même quand les deux vivent dans la liste du lecteur. */
const PLAIN_TEXT = 'Le texte qu’on vient d’écrire est encore trop proche';

export const INITIAL_PUBLIC_ANNOTATIONS = (): AnnotationItem[] => {
  const official = anchor(LAB_DOCUMENT, OFFICIAL_TEXT);
  const repeated = anchor(LAB_DOCUMENT, REPEATED_PASSAGE, REPEATED_PASSAGE_SECOND);

  const list: AnnotationItem[] = [];
  if (official) {
    list.push({
      id: 'lab-official-1',
      text: OFFICIAL_TEXT,
      note: 'La phrase que je n’arrive pas à contredire.',
      isPublic: true,
      isOfficial: true,
      upvotesCount: 12,
      createdAt: '2026-09-02T08:15:00.000Z',
      reader: LAB_AUTHOR,
    });
  }
  if (repeated) {
    list.push({
      id: 'lab-public-1',
      text: REPEATED_PASSAGE,
      quoteOrdinal: REPEATED_PASSAGE_SECOND,
      canonicalStart: repeated.start,
      canonicalEnd: repeated.end,
      contentSha: LAB_DOCUMENT_SHA,
      note: 'Ici, la formule revient comme une conclusion — ce n’est pas la même chose que la première fois.',
      isPublic: true,
      isOfficial: false,
      upvotesCount: 4,
      createdAt: '2026-09-04T18:40:00.000Z',
      reader: LAB_OTHER_READER,
      comments: [
        {
          id: 'lab-comment-1',
          content: 'Le décalage entre les deux occurrences est tout l’article.',
          createdAt: '2026-09-05T09:02:00.000Z',
          author: {
            id: 'reader-camille',
            name: 'Camille',
            username: 'camille',
            logoUrl: '/avatars/media-camille.svg',
            type: 'MEDIA',
          },
        },
      ],
    });
  }
  return list;
};

export const INITIAL_READER_HIGHLIGHTS = (): HighlightItem[] => {
  const priv = anchor(LAB_DOCUMENT, PRIVATE_TEXT);
  const plain = anchor(LAB_DOCUMENT, PLAIN_TEXT);
  const list: HighlightItem[] = [];

  if (priv) {
    list.push({
      id: 'lab-private-1',
      text: PRIVATE_TEXT,
      canonicalStart: priv.start,
      canonicalEnd: priv.end,
      contentSha: LAB_DOCUMENT_SHA,
      note: 'À reprendre en ouverture du prochain billet.',
      isPublic: false,
      isOfficial: false,
      upvotesCount: 0,
      createdAt: '2026-09-06T07:10:00.000Z',
      reader: LAB_READER,
    });
  }

  if (plain) {
    list.push({
      id: 'lab-highlight-1',
      text: PLAIN_TEXT,
      canonicalStart: plain.start,
      canonicalEnd: plain.end,
      contentSha: LAB_DOCUMENT_SHA,
      note: null,
      isPublic: false,
      isOfficial: false,
      upvotesCount: 0,
      createdAt: '2026-09-06T07:12:00.000Z',
      reader: LAB_READER,
    });
  }

  return list;
};
