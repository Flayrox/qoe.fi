'use server';

// =====================================================================
// 🛠️ Actions d'édition de profil (compte personnel OU Média)
// =====================================================================
// ⚠️ BUG du 19/09 : le modal d'édition, ouvert depuis le profil public d'un
// Média, passait par l'action générique du SDK qui patchait /v1/me/profile
// (profil PERSONNEL) en plus de la publication « active » — les valeurs du
// média ont écrasé le compte (username perdu). Depuis, chaque ressource a
// SON endpoint dédié et le client choisit explicitement.
// =====================================================================

import { revalidatePath } from 'next/cache';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';

/**
 * Résout l'id du Média depuis l'id de sa publication (les profils publics
 * n'exposent que la publicationId). Retourne null si cette publication n'est
 * PAS un média — c'est le discriminant fiable : on n'écrit JAMAIS un profil
 * personnel via l'endpoint média, ni l'inverse.
 */
export async function resolveMediaIdByPublication(publicationId: string): Promise<string | null> {
  try {
    const res = await goFetch<{ mediaId: string }>(
      `/v1/media/by-publication/${encodeURIComponent(publicationId)}`
    );
    return res.mediaId || null;
  } catch {
    return null; // pas un média (ou pas membre) → profil personnel
  }
}

/** PATCH /v1/media/{id}/settings — réglages d'un Média (RBAC côté Go). */
export async function updateMediaProfileAction(
  mediaId: string,
  input: {
    name?: string;
    heroText?: string;
    logoUrl?: string | null;
    headerImageUrl?: string | null;
  }
) {
  await goFetch(`/v1/media/${encodeURIComponent(mediaId)}/settings`, {
    method: 'PATCH',
    body: input,
  });
  revalidatePath('/settings');
  return { success: true as const };
}
