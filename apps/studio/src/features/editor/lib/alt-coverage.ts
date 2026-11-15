import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

export interface ImageAltNode {
  node: ProseMirrorNode;
  pos: number;
}

export function isImageNode(node: ProseMirrorNode): boolean {
  return node.type.name === 'image' || node.type.name === 'galleryImage';
}

/**
 * Une image est muette quand son alt est absent ou ne contient que des
 * espaces. La règle est partagée par le badge, le compteur de la barre de
 * statut et l'action « corriger ».
 */
export function hasMissingAlt(node: ProseMirrorNode): boolean {
  return isImageNode(node) && !String(node.attrs.alt ?? '').trim();
}

/** Images du document (galeries comprises) dépourvues de description. */
export function collectImagesWithoutAlt(doc: ProseMirrorNode): ImageAltNode[] {
  const images: ImageAltNode[] = [];

  doc.descendants((node, pos) => {
    if (hasMissingAlt(node)) {
      images.push({ node, pos });
      return false;
    }
    return true;
  });

  return images;
}

export function missingAltPositions(doc: ProseMirrorNode): number[] {
  return collectImagesWithoutAlt(doc).map(({ pos }) => pos);
}
