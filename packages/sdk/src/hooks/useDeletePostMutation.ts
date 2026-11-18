'use client';

import { useMutation } from '@tanstack/react-query';
import { deletePostAction } from '../actions/feed';
import { updatePostShadow } from '../shadow';

/**
 * 🗑️ Suppression de pensée — port de `usePostDeleteMutation` de Bluesky.
 *
 * La mutation se contente d'appeler l'action serveur, puis marque la pensée
 * comme supprimée dans le shadow store (`isDeleted: true`). Toutes les cartes
 * abonnées au shadow rendent alors une tombe (ou disparaissent) automatiquement :
 * aucun invalidation de cache, aucune liste manipulée à la main, aucun rollback.
 *
 * ⚠️ `deletePostAction` est une `safeAction` : elle **résout** un
 * `ActionResult` même en cas de refus (403, 404, réseau). Sans ce garde,
 * React Query considérait le refus comme un succès et masquait une pensée
 * toujours en ligne.
 */
export function useDeletePostMutation() {
  return useMutation({
    mutationFn: async (postId: string) => {
      const res = await deletePostAction(postId);
      if (!res.ok) {
        const message = typeof res.error === 'string' ? res.error : res.error?.message;
        throw new Error(message || 'Suppression impossible');
      }
      // On rend l'`ActionResult` complet : les appelants testent `res.ok`
      // eux-mêmes (et gardent le message d'erreur pour leur toast).
      return res;
    },
    onSuccess: (_data, postId) => {
      updatePostShadow(postId, { isDeleted: true });
    },
  });
}
