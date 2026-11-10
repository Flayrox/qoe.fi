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
import { getActivePublisherId } from '../articles';

export interface RecommendationItemDto {
  id: string;
  publisherId: string;
  publisherName: string;
  publisherSlug: string;
  publisherSubdomain: string | null;
  publisherCustomDomain: string | null;
  publicationBio: string | null;
  publisherLogoUrl: string | null;
  description: string | null;
  createdAt: string;
}

export const getRecommendationsAction = safeAction<
  { publisherId?: string } | void,
  RecommendationItemDto[]
>(async (input) => {
  const pubId = input?.publisherId || (await getActivePublisherId());
  const res = await goFetch<{ items: RecommendationItemDto[] }>(
    `/v1/creator/recommendations?publisherId=${encodeURIComponent(pubId)}`
  );
  return res.items || [];
});

export const addRecommendationAction = safeAction<
  { recommendedId: string; description?: string; publisherId?: string },
  { success: boolean }
>(async ({ recommendedId, description, publisherId }) => {
  const pubId = publisherId || (await getActivePublisherId());
  await goFetch(`/v1/creator/recommendations`, {
    method: 'POST',
    body: {
      publisherId: pubId,
      recommendedId,
      description: description?.trim() || undefined,
    },
  });
  revalidatePath('/settings');
  revalidatePath('/');
  return { success: true };
});

export const removeRecommendationAction = safeAction<
  { recommendedId: string; publisherId?: string },
  { success: boolean }
>(async ({ recommendedId, publisherId }) => {
  const pubId = publisherId || (await getActivePublisherId());
  await goFetch(
    `/v1/creator/recommendations/${encodeURIComponent(recommendedId)}?publisherId=${encodeURIComponent(pubId)}`,
    {
      method: 'DELETE',
    }
  );
  revalidatePath('/settings');
  revalidatePath('/');
  return { success: true };
});

export const lookupPublisherByDomainAction = safeAction<
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
    }>(`/v1/publishers/by-domain/${encodeURIComponent(clean)}`);
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
