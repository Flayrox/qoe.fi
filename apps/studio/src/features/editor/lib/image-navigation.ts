import type { Node as ProseMirrorNode, ResolvedPos } from '@tiptap/pm/model';

export type ImageDirection = 'before' | 'after';

interface BlockAtBoundary {
  node: ProseMirrorNode;
  pos: number;
}

/**
 * Bloc de premier niveau qui se termine (`end`) ou commence (`start`) à la
 * position donnée. ProseMirror résout une position de frontière tantôt au
 * niveau du document, tantôt dans le bloc voisin : raisonner sur les enfants
 * de `doc` évite cette asymétrie.
 */
function blockAtBoundary(
  doc: ProseMirrorNode,
  boundary: number,
  side: 'start' | 'end'
): BlockAtBoundary | null {
  let offset = 0;

  for (let index = 0; index < doc.childCount; index += 1) {
    const node = doc.child(index);
    if (side === 'start' && offset === boundary) return { node, pos: offset };
    if (side === 'end' && offset + node.nodeSize === boundary) return { node, pos: offset };
    offset += node.nodeSize;
  }

  return null;
}

/**
 * Position du nœud image voisin d'un curseur posé au début (`before`) ou à la
 * fin (`after`) d'un bloc de texte.
 *
 * Pour une galerie, on renvoie la première image : c'est elle que la barre
 * d'outils sait décrire, et la sélection suivante se déplace dans la grille.
 * Retourne `null` si le voisin n'est pas une image.
 */
export function adjacentImagePosition($pos: ResolvedPos, direction: ImageDirection): number | null {
  const boundary =
    direction === 'before'
      ? $pos.depth > 0
        ? $pos.before()
        : $pos.pos
      : $pos.depth > 0
        ? $pos.after()
        : $pos.pos;

  const block = blockAtBoundary($pos.doc, boundary, direction === 'before' ? 'end' : 'start');
  if (!block) return null;

  if (block.node.type.name === 'image') return block.pos;
  if (block.node.type.name === 'imageGallery') return block.pos + 1;

  return null;
}
