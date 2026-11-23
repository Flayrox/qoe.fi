'use server';

import { getCurrentUser } from '@qoe/auth/current-user';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { t } from '@lingui/core/macro';

export interface MediaAssetSummary {
  id: string;
  url: string;
  mimeType: string;
  width?: number;
  height?: number;
  sizeBytes: number;
  blurhash?: string;
  status: string;
  targetType: string;
  createdAt: string;
}

export interface MediaAssetPage {
  items: MediaAssetSummary[];
  nextOffset: number;
  hasMore: boolean;
}

export type ListMediaAssetsResult =
  | ({ ok: true } & MediaAssetPage)
  | { ok: false; error: string; items: []; nextOffset: 0; hasMore: false };

/**
 * Liste les assets du compte courant pour le sélecteur de l'éditeur.
 * Le propriétaire est résolu côté Go depuis le JWT : aucun id client.
 */
export async function listMediaAssetsAction(
  options: { query?: string; targetType?: string; offset?: number; limit?: number } = {}
): Promise<ListMediaAssetsResult> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      ok: false,
      error: t`Non authentifié`,
      items: [],
      nextOffset: 0,
      hasMore: false,
    };
  }

  try {
    const params = new URLSearchParams();
    if (options.query?.trim()) params.set('q', options.query.trim());
    if (options.targetType) params.set('targetType', options.targetType);
    params.set('limit', String(Math.min(Math.max(options.limit ?? 24, 1), 60)));
    params.set('offset', String(Math.max(options.offset ?? 0, 0)));
    const page = await goFetch<MediaAssetPage>(`/v1/media-assets?${params.toString()}`);
    return {
      ok: true,
      items: page.items ?? [],
      nextOffset: page.nextOffset ?? 0,
      hasMore: page.hasMore === true,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : t`Impossible de charger la médiathèque`,
      items: [],
      nextOffset: 0,
      hasMore: false,
    };
  }
}
