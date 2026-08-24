'use server';

// =====================================================================
// 🎒 actions/starterPacks — Server Actions des « packs de démarrage »
// =====================================================================
// Curated lists de créateurs à suivre (style Bluesky Starter Packs) :
// lecture paginée, création, et « tout suivre d'un coup ».
// ⚠️ Fichier serveur — pas encore d'endpoint Go équivalent pour le mobile.
// =====================================================================

import { revalidatePath } from 'next/cache';
import { safeAction } from '../utils/safe-action';
import { goFetch } from '../utils/go-client';

/** 🎒 Pack de démarrage (shape Go /v1/starter-packs). */
export interface StarterPackDTO {
  id: string;
  title: string;
  description: string | null;
  icon: string | null;
  publication: {
    id: string;
    name: string | null;
    slug: string;
    subdomain: string | null;
    customDomain: string | null;
    logoUrl: string | null;
    isCertified: boolean;
  };
  items: Array<{
    user: {
      id: string;
      name: string | null;
      username: string | null;
      logoUrl: string | null;
      isCertified: boolean;
      publicationId?: string | null;
      slug?: string | null;
      subdomain?: string | null;
      followerCount?: number;
    };
  }>;
  _count: number;
  createdAt: string;
  updatedAt: string;
}

export const getStarterPacksAction = safeAction<
  { limit?: number; cursor?: string } | undefined,
  { starterPacks: StarterPackDTO[]; nextCursor: string | null }
>(async (rawInput) => {
  const limit = rawInput?.limit || 20;
  const offset = 0; // pagination par offset côté Go
  const res = await goFetch<{ starterPacks: StarterPackDTO[] }>(
    `/v1/starter-packs?limit=${limit}&offset=${offset}`
  );
  return { starterPacks: res.starterPacks ?? [], nextCursor: null };
});

export const getStarterPackByIdAction = safeAction<{ id: string }, { starterPack: StarterPackDTO }>(
  async (input) => {
    const res = await goFetch<{ starterPack: StarterPackDTO }>(
      `/v1/starter-packs/${encodeURIComponent(input.id)}`
    );
    return { starterPack: res.starterPack };
  }
);

export const createStarterPackAction = safeAction<
  { title: string; description?: string; icon?: string; userIds: string[] },
  { starterPack: StarterPackDTO }
>(async (input) => {
  if (!input.title || input.title.trim().length === 0) {
    throw new Error('Title is required');
  }
  // Go-only : la publication personnelle de l'auteur est résolue côté backend.
  const res = await goFetch<{ starterPack: StarterPackDTO }>('/v1/starter-packs', {
    method: 'POST',
    body: {
      title: input.title,
      description: input.description ?? null,
      icon: input.icon ?? '🚀',
      userIds: input.userIds || [],
    },
  });
  revalidatePath('/starter-packs');
  return { starterPack: res.starterPack };
});

export const followAllInStarterPackAction = safeAction<
  { starterPackId: string },
  { followedCount: number }
>(async (input) => {
  const res = await goFetch<{ followedCount: number }>(
    `/v1/starter-packs/${encodeURIComponent(input.starterPackId)}/follow-all`,
    { method: 'POST' }
  );
  revalidatePath('/starter-packs');
  revalidatePath(`/starter-packs/${input.starterPackId}`);
  return { followedCount: res.followedCount ?? 0 };
});
