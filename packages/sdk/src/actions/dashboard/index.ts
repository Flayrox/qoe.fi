'use server';

// =====================================================================
// 🎛️ actions/dashboard — Server Actions des réglages créateur (dashboard)
// =====================================================================
// Profil de publication (hero, logo, thème, SEO…), sous-domaine, liens de
// navigation / réseaux sociaux, onboarding, et gestion des clés API
// (demande d'accès, génération `qoe_live_…` avec scopes à moindre
// privilège, révocation).
// ✅ AOÛT 2026 : 100 % délégué au backend Go (apps/api/internal/
//    modules/settings). QOE_API_URL requis (backend-of-record).
// ⚠️ Fichier serveur — non exposé au mobile.
// =====================================================================

import { revalidatePath } from 'next/cache';
import { safeAction } from '../utils/safe-action';
import { goFetch } from '../utils/go-client';
import { getActivePublisherId } from '../workspace';
import type { ArticleAuthorBrief } from '../articles';

type User = ArticleAuthorBrief & {
  email: string;
  role: string;
  walletBalanceCents: number;
};

interface UpdateCreatorProfileInput {
  publisherId?: string;
  name?: string | null;
  heroText?: string | null;
  onboardingText?: string | null;
  accentColor?: string | null;
  layoutStyle?: string | null;
  logoUrl?: string | null;
  headerImageUrl?: string | null;
  fontFamily?: string | null;
  themeMode?: string | null;
  footerText?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  allowIndexing?: boolean;
  supportUrl?: string | null;
  siteOptions?: Record<string, unknown> | null;
}

interface NavigationLinkInput {
  label: string;
  url: string | null;
}

interface SocialLinkInput {
  platform: string;
  url: string;
}

interface CompleteOnboardingInput {
  name: string;
  heroText: string;
  subdomain: string;
  layoutStyle: string;
}

export const updateCreatorProfileAction = safeAction<UpdateCreatorProfileInput, User>(
  async (data) => {
    const publisherId = data.publisherId || (await getActivePublisherId());
    const res = await goFetch<User>('/v1/settings/profile', {
      method: 'PATCH',
      body: { ...data, publisherId },
    });
    revalidatePath('/settings');
    return res;
  }
);

export const checkSubdomainAvailabilityAction = safeAction<
  string,
  { available: boolean; reason?: string }
>(async (subdomain) => {
  return goFetch<{ available: boolean; reason?: string }>(
    `/v1/settings/subdomain/check?subdomain=${encodeURIComponent(subdomain)}`
  );
});

export const updateSubdomainAction = safeAction<
  { publisherId?: string; subdomain: string } | string,
  { success: boolean; subdomain: string }
>(async (input) => {
  const subdomain = typeof input === 'string' ? input : input.subdomain;
  const publisherId =
    (typeof input === 'object' && input.publisherId) || (await getActivePublisherId());
  const res = await goFetch<{ success: boolean; subdomain: string }>('/v1/settings/subdomain', {
    method: 'POST',
    body: { publisherId, subdomain },
  });
  revalidatePath('/settings');
  return res;
});

export const saveNavigationLinksAction = safeAction<
  { publisherId?: string; links: NavigationLinkInput[] } | NavigationLinkInput[],
  { success: boolean }
>(async (input) => {
  const links = Array.isArray(input) ? input : input.links;
  const publisherId =
    (!Array.isArray(input) && input.publisherId) || (await getActivePublisherId());
  await goFetch('/v1/settings/navigation', {
    method: 'PUT',
    body: { publisherId, links },
  });
  revalidatePath('/settings');
  return { success: true };
});

export const saveSocialLinksAction = safeAction<
  { publisherId?: string; links: SocialLinkInput[] } | SocialLinkInput[],
  { success: boolean }
>(async (input) => {
  const links = Array.isArray(input) ? input : input.links;
  const publisherId =
    (!Array.isArray(input) && input.publisherId) || (await getActivePublisherId());
  await goFetch('/v1/settings/social', {
    method: 'PUT',
    body: { publisherId, links },
  });
  revalidatePath('/settings');
  return { success: true };
});

export const submitApiApplicationAction = safeAction<string, { success: boolean }>(
  async (reason) => {
    await goFetch('/v1/settings/api-application', {
      method: 'POST',
      body: { reason },
    });
    revalidatePath('/developer');
    return { success: true };
  }
);

// Scopes autorisés pour une clé API (moindre privilège).
export type ApiKeyScope = 'READ' | 'WRITE' | 'ANALYTICS';

export interface GenerateApiKeyInput {
  name: string;
  scopes: ApiKeyScope[];
}

export const generateApiKeyAction = safeAction<GenerateApiKeyInput, { apiKey: string }>(
  async ({ name, scopes }) => {
    const res = await goFetch<{ apiKey: string }>('/v1/settings/api-keys', {
      method: 'POST',
      body: { name, scopes },
    });
    revalidatePath('/developer');
    return res;
  }
);

export const revokeApiKeyAction = safeAction<string, { success: boolean }>(async (id) => {
  await goFetch(`/v1/settings/api-keys/${id}`, { method: 'DELETE' });
  revalidatePath('/developer');
  return { success: true };
});

// Rotation de clé : même id, nouveau secret (l'ancienne clé est
// immédiatement invalide). Le nouveau secret n'est affiché qu'une fois.
export const rotateApiKeyAction = safeAction<string, { apiKey: string }>(async (id) => {
  const res = await goFetch<{ apiKey: string }>(`/v1/settings/api-keys/${id}/rotate`, {
    method: 'POST',
  });
  revalidatePath('/developer');
  return res;
});

export const completeOnboardingAction = safeAction<CompleteOnboardingInput, { success: boolean }>(
  async (data) => {
    await goFetch('/v1/settings/onboarding', {
      method: 'POST',
      body: {
        name: data.name,
        heroText: data.heroText,
        subdomain: data.subdomain,
        layoutStyle: data.layoutStyle,
      },
    });
    revalidatePath('/');
    return { success: true };
  }
);
