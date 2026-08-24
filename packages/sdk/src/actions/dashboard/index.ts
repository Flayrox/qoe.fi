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
import { cookies } from 'next/headers';
import { safeAction } from '../utils/safe-action';
import { goFetch } from '../utils/go-client';
import type { ArticleAuthorBrief } from '../articles';

type User = ArticleAuthorBrief & {
  email: string;
  role: string;
  walletBalanceCents: number;
};

/**
 * 🎛️ Résout la publication active (personnelle OU média) depuis le cookie du workspace.
 */
async function getActivePublicationId(): Promise<string> {
  let saved: { type?: string; id?: string } | null = null;
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get('qoe_active_workspace')?.value;
    if (raw) saved = JSON.parse(decodeURIComponent(raw));
  } catch {
    saved = null;
  }

  // Go-only (backend-of-record) : workspace média → publication du média,
  // sinon publication personnelle (créée si absente via /v1/me/publication).
  if (saved?.type === 'MEDIA' && saved.id) {
    const res = await goFetch<{ publicationId: string }>(
      `/v1/me/media/${encodeURIComponent(saved.id)}`
    );
    if (res.publicationId) return res.publicationId;
  }

  const personal = await goFetch<{ publicationId: string }>('/v1/me/publication');
  return personal.publicationId;
}

interface UpdateCreatorProfileInput {
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
  advancedSettingsMode: boolean;
}

export const updateCreatorProfileAction = safeAction<UpdateCreatorProfileInput, User>(
  async (data) => {
    const publicationId = await getActivePublicationId();
    return goFetch<User>('/v1/settings/profile', {
      method: 'PATCH',
      body: { publicationId, ...data },
    });
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

export const updateSubdomainAction = safeAction<string, { success: boolean; subdomain: string }>(
  async (subdomain) => {
    const publicationId = await getActivePublicationId();
    return goFetch<{ success: boolean; subdomain: string }>('/v1/settings/subdomain', {
      method: 'POST',
      body: { publicationId, subdomain },
    });
  }
);

export const saveNavigationLinksAction = safeAction<NavigationLinkInput[], { success: boolean }>(
  async (links) => {
    const publicationId = await getActivePublicationId();
    await goFetch('/v1/settings/navigation', {
      method: 'PUT',
      body: { publicationId, links },
    });
    revalidatePath('/settings');
    return { success: true };
  }
);

export const saveSocialLinksAction = safeAction<SocialLinkInput[], { success: boolean }>(
  async (links) => {
    const publicationId = await getActivePublicationId();
    await goFetch('/v1/settings/social', {
      method: 'PUT',
      body: { publicationId, links },
    });
    revalidatePath('/settings');
    return { success: true };
  }
);

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
