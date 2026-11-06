'use server';

// =====================================================================
// 🗂️ admin-views-actions — Vues sauvegardées d'équipe en base (Lot B3)
// =====================================================================
// Persistance serveur des combinaisons filtres + tri + colonnes + densité.
// Permet de synchroniser les vues personnelles et d'équipe entre sessions.
// =====================================================================

import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { assertCapability } from '@/lib/admin-identity';
import type { GridViewState } from '@/components/shell/grid-view';

export interface ServerSavedView {
  id: string;
  userId: string;
  resource: string;
  name: string;
  isShared: boolean;
  isMine: boolean;
  state: GridViewState;
  createdAt: string;
  updatedAt: string;
}

/** 📋 Récupère les vues sauvegardées personnelles et d'équipe pour une ressource. */
export async function fetchSavedViewsAction(resource: string): Promise<ServerSavedView[]> {
  await assertCapability('admin.dashboard.read');
  try {
    const key = encodeURIComponent(resource.trim());
    const data = await goFetch<{ views: ServerSavedView[] }>(`/v1/admin/views/${key}`);
    return data.views ?? [];
  } catch {
    return [];
  }
}

/** 💾 Sauvegarde ou met à jour une vue d'exploitation sur le serveur. */
export async function saveSavedViewAction(
  resource: string,
  input: { name: string; isShared: boolean; state: GridViewState }
): Promise<ServerSavedView | null> {
  await assertCapability('admin.dashboard.read');
  try {
    const key = encodeURIComponent(resource.trim());
    const res = await goFetch<ServerSavedView>(`/v1/admin/views/${key}`, {
      method: 'POST',
      body: input,
    });
    return res;
  } catch {
    return null;
  }
}

/** 🗑️ Supprime une vue d'exploitation sur le serveur. */
export async function deleteSavedViewAction(resource: string, id: string): Promise<boolean> {
  await assertCapability('admin.dashboard.read');
  try {
    const resKey = encodeURIComponent(resource.trim());
    const idKey = encodeURIComponent(id.trim());
    await goFetch<{ deleted: boolean }>(`/v1/admin/views/${resKey}/${idKey}`, {
      method: 'DELETE',
    });
    return true;
  } catch {
    return false;
  }
}
