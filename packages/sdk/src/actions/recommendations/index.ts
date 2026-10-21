'use server';

// =====================================================================
// 🤝 actions/recommendations — Recommandations de créateurs et pages
// =====================================================================
// Permet à un créateur de recommander d'autres publications souveraines
// à son audience pour créer un maillage éditorial et solidaire.
// Délégué à l'API Go (/v1/creator/recommendations).
// =====================================================================

import { revalidatePath } from 'next/cache';
import { safeAction } from '../utils/safe-action';
import { goFetch } from '../utils/go-client';
import { getActivePublicationId } from '../articles';

export interface RecommendationItemDto {
  id: string;
  publicationId: string;
  publicationName: string;
  publicationSlug: string;
  publicationSubdomain: string | null;
  publicationCustomDomain: string | null;
  publicationBio: string | null;
  publicationLogoUrl: string | null;
  description: string | null;
  createdAt: string;
}

export const getRecommendationsAction = safeAction<
  { publicationId?: string } | void,
  RecommendationItemDto[]
>(async (input) => {
  const pubId = input?.publicationId || (await getActivePublicationId());
  const res = await goFetch<{ items: RecommendationItemDto[] }>(
    `/v1/creator/recommendations?publicationId=${encodeURIComponent(pubId)}`
  );
  return res.items || [];
});

export const addRecommendationAction = safeAction<
  { recommendedId: string; description?: string; publicationId?: string },
  { success: boolean }
>(async ({ recommendedId, description, publicationId }) => {
  const pubId = publicationId || (await getActivePublicationId());
  await goFetch(`/v1/creator/recommendations`, {
    method: 'POST',
    body: {
      publicationId: pubId,
      recommendedId,
      description: description?.trim() || undefined,
    },
  });
  revalidatePath('/settings');
  revalidatePath('/');
  return { success: true };
});

export const removeRecommendationAction = safeAction<
  { recommendedId: string; publicationId?: string },
  { success: boolean }
>(async ({ recommendedId, publicationId }) => {
  const pubId = publicationId || (await getActivePublicationId());
  await goFetch(
    `/v1/creator/recommendations/${encodeURIComponent(recommendedId)}?publicationId=${encodeURIComponent(pubId)}`,
    {
      method: 'DELETE',
    }
  );
  revalidatePath('/settings');
  revalidatePath('/');
  return { success: true };
});

export const lookupPublicationByDomainAction = safeAction<
  { domain: string },
  {
    id: string;
    name: string;
    slug: string;
    subdomain: string | null;
    logoUrl: string | null;
    bio: string | null;
  } | null
>(async ({ domain }) => {
  try {
    const clean = domain
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '');
    const res = await goFetch<{
      id: string;
      name: string;
      slug: string;
      subdomain: string | null;
      logoUrl: string | null;
      heroText?: string | null;
      bio?: string | null;
    }>(`/v1/publications/by-domain/${encodeURIComponent(clean)}`);
    return {
      id: res.id,
      name: res.name,
      slug: res.slug,
      subdomain: res.subdomain,
      logoUrl: res.logoUrl,
      bio: res.heroText || res.bio || null,
    };
  } catch {
    return null;
  }
});
