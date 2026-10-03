'use server';

import { createClient as createServerClient } from '@qoe/supabase/server';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';

async function getAuthenticatedUser() {
  const supabase = await createServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error('Non authentifié');

  return authUser;
}

/**
 * Brouillon de mise en page (layout) de la publication.
 * GET /v1/settings/site-layout — retourne null si aucun brouillon en cours,
 * auquel cas le Studio reste sur la version publiée.
 */
export async function getSiteLayoutDraftAction(publicationId: string) {
  try {
    await getAuthenticatedUser();

    const res = await goFetch<{ layout?: string | null; updatedAt?: string | null }>(
      `/v1/settings/site-layout?publicationId=${encodeURIComponent(publicationId)}`
    );
    return { success: true, layout: res.layout ?? null, updatedAt: res.updatedAt ?? null };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Impossible de charger le brouillon',
    };
  }
}

/**
 * Enregistre le brouillon sans toucher au site public.
 * PATCH /v1/settings/site-layout
 */
export async function saveSiteLayoutDraftAction(publicationId: string, layout: string) {
  try {
    await getAuthenticatedUser();

    await goFetch('/v1/settings/site-layout', {
      method: 'PATCH',
      body: { publicationId, layout },
    });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Enregistrement impossible',
    };
  }
}

/**
 * Publie le brouillon : bascule le site public et archive l'ancienne
 * version dans SiteVersion. POST /v1/settings/site-layout/publish
 */
export async function publishSiteLayoutAction(publicationId: string) {
  try {
    await getAuthenticatedUser();

    await goFetch('/v1/settings/site-layout/publish', {
      method: 'POST',
      body: { publicationId },
    });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Publication impossible',
    };
  }
}

/**
 * Instantanés publiés, du plus récent au plus ancien.
 * GET /v1/settings/site-layout/versions
 */
export async function listSiteLayoutVersionsAction(publicationId: string) {
  try {
    await getAuthenticatedUser();

    const res = await goFetch<{ versions?: SiteVersionSnapshot[] }>(
      `/v1/settings/site-layout/versions?publicationId=${encodeURIComponent(publicationId)}`
    );
    return { success: true, versions: res.versions ?? [] };
  } catch (error) {
    return {
      success: false,
      versions: [] as SiteVersionSnapshot[],
      error: error instanceof Error ? error.message : 'Versions indisponibles',
    };
  }
}

/**
 * Restaure un instantané publié en l'appliquant comme layout public.
 * POST /v1/settings/site-layout/restore
 */
export async function restoreSiteLayoutVersionAction(publicationId: string, versionId: string) {
  try {
    await getAuthenticatedUser();

    await goFetch('/v1/settings/site-layout/restore', {
      method: 'POST',
      body: { publicationId, versionId },
    });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Restauration impossible',
    };
  }
}

export interface SiteVersionSnapshot {
  id: string;
  label: string;
  createdAt: string;
}
