'use server';

import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import type { CanonicalDocument } from '@qoe/ui/annotations';

/**
 * Document canonique d'un article (blocs + texte plat + offsets).
 * GET /v1/articles/{id}/document — base des ancres des surlignages.
 * null si indisponible → repli sur le moteur hérité (TreeWalker).
 * Server action : go-client est un module serveur (session Supabase).
 */
export async function getCanonicalDocumentAction(
  articleId: string
): Promise<CanonicalDocument | null> {
  try {
    const doc = await goFetch<CanonicalDocument>(
      `/v1/articles/${encodeURIComponent(articleId)}/document`
    );
    if (!doc || !Array.isArray(doc.blocks) || !doc.text) return null;
    return doc;
  } catch (err) {
    if ((err as { status?: number })?.status === 404) return null;
    console.error('[core] getCanonicalDocumentAction:', err);
    return null;
  }
}
