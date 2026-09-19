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

/** PATCH /v1/media/{id}/settings — réglages d'un Média (RBAC côté Go). */
export async function updateMediaProfileAction(
  mediaId: string,
  input: {
    name?: string;
    heroText?: string;
    logoUrl?: string;
    headerImageUrl?: string;
  }
) {
  await goFetch(`/v1/media/${encodeURIComponent(mediaId)}/settings`, {
    method: 'PATCH',
    body: input,
  });
  revalidatePath('/settings');
  return { success: true as const };
}
