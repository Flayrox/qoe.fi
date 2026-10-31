// =====================================================================
// 📎 citation — publier une annotation comme citation, pas comme un post
// =====================================================================
// 📖 Une annotation n'est pas un commentaire libre : c'est un TEXTE attaché
//    à un PASSAGE précis. La citer, c'est donc citer les deux — la note et
//    le passage qu'elle commente — en nommant la personne qui a annoté.
//
// 🎯 Le payload porte les ancres canoniques (offsets + empreinte) quand
//    elles existent : le feed peut alors ouvrir l'article sur l'occurrence
//    EXACTE (un passage répété n'est pas le premier venu), pas sur une
//    recherche de texte approximative.
//
// 🔒 Deux règles, dans une seule fonction (`citationFromAnnotation`) :
//    - un surlignage nu n'a pas de texte à citer → rien à publier ;
//    - une annotation privée n'est pas partagée → rien à publier non plus.
//    L'interface et le serveur appliquent la MÊME règle ; aucune des deux
//    ne peut publier ce que l'autre refuse.
// =====================================================================

/** Identité de la personne qui a annoté (attribution de la citation). */
export interface AnnotationCitationReader {
  id?: string | null;
  name: string | null;
  username: string | null;
  logoUrl?: string | null;
  type?: 'PERSONAL' | 'MEDIA' | string | null;
}

/**
 * Ce qui part du tiroir vers le post, et ce que le feed affiche.
 * Miroir du snapshot Go `QuotedAnnotation` (même champ pour champ).
 */
export interface AnnotationCitation {
  id: string;
  /** La note : c'est ELLE qu'on cite. */
  note: string;
  /** Le passage annoté, copie du texte au moment de la citation. */
  excerpt: string;
  quoteOrdinal?: number;
  canonicalStart?: number;
  canonicalEnd?: number;
  contentSha?: string;
  reader: AnnotationCitationReader;
}

/** Ce qu'il faut savoir d'une annotation pour décider si elle est citable. */
export interface CitableAnnotation {
  id: string;
  text: string;
  note?: string | null;
  isPublic?: boolean;
  isOfficial?: boolean;
  quoteOrdinal?: number;
  canonicalStart?: number;
  canonicalEnd?: number;
  contentSha?: string;
  reader: AnnotationCitationReader;
}

/**
 * Une annotation est citable quand elle porte un texte ET qu'elle est
 * partagée (publique ou officielle). `isPublic` est accepté en surcharge :
 * le tiroir bascule la visibilité localement avant que le parent ne
 * confirme, et c'est cet état-là que la personne voit.
 */
export function isCitableAnnotation(
  annotation: Pick<CitableAnnotation, 'note' | 'isPublic' | 'isOfficial'> | null | undefined,
  isPublicOverride?: boolean
): boolean {
  if (!annotation) return false;
  const note = typeof annotation.note === 'string' ? annotation.note.trim() : '';
  if (!note) return false;
  return annotation.isOfficial === true || Boolean(isPublicOverride ?? annotation.isPublic);
}

/**
 * Construit le payload de citation, ou `null` si l'annotation ne peut pas
 * être publiée (surlignage nu, annotation privée). Un seul endroit décide,
 * le tiroir ne recompose pas la règle à la main.
 */
export function citationFromAnnotation(
  annotation: CitableAnnotation | null | undefined,
  options?: { isPublic?: boolean }
): AnnotationCitation | null {
  if (!annotation || !isCitableAnnotation(annotation, options?.isPublic)) return null;

  const note = annotation.note?.trim();
  if (!note) return null;

  return {
    id: annotation.id,
    note,
    excerpt: annotation.text.trim(),
    ...(annotation.quoteOrdinal !== undefined ? { quoteOrdinal: annotation.quoteOrdinal } : {}),
    ...(annotation.canonicalStart !== undefined
      ? { canonicalStart: annotation.canonicalStart }
      : {}),
    ...(annotation.canonicalEnd !== undefined ? { canonicalEnd: annotation.canonicalEnd } : {}),
    ...(annotation.contentSha ? { contentSha: annotation.contentSha } : {}),
    reader: {
      id: annotation.reader?.id ?? null,
      name: annotation.reader?.name ?? null,
      username: annotation.reader?.username ?? null,
      logoUrl: annotation.reader?.logoUrl ?? null,
      ...(annotation.reader?.type ? { type: annotation.reader.type } : {}),
    },
  };
}
