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
 */
export function useDeletePostMutation() {
  return useMutation({
    mutationFn: deletePostAction,
    onSuccess: (_data, postId) => {
      updatePostShadow(postId, { isDeleted: true });
    },
  });
}
