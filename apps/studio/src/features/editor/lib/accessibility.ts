export interface ImageAltReport {
  total: number;
  missing: number;
}

const IMG_TAG = /<img\b[^>]*>/gi;
const ALT_ATTRIBUTE = /\balt\s*=\s*(?:"([^"]*)"|'([^']*)')/i;

/**
 * Compte les images du corps d'article dépourvues de description
 * alternative. Le HTML vient de l'éditeur (Tiptap), donc les balises sont
 * bien formées : un scan des `<img>` suffit et évite un DOMParser côté serveur.
 */
export function countImagesWithoutAlt(html: string): ImageAltReport {
  const tags = html.match(IMG_TAG) ?? [];
  let missing = 0;

  for (const tag of tags) {
    const alt = ALT_ATTRIBUTE.exec(tag);
    const value = alt ? (alt[1] ?? alt[2] ?? '') : '';
    if (!value.trim()) missing += 1;
  }

  return { total: tags.length, missing };
}
